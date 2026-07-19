import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { stripeCustomerMapping, subscription } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import {
  STRIPE_API_VERSION,
  getCheckoutModeForCatalogId,
  getStripePriceIdForCatalogId,
} from "@/lib/billing/stripe-catalog";
import { obtainCheckoutSessionUnlessDeleting } from "@/lib/billing/account-deletion-guard";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import {
  obtainSerializedSubscriptionCheckout,
  subscriptionCustomerIdempotencyKey,
  subscriptionCheckoutExpiryIdempotencyKey,
  type SubscriptionCheckoutState,
} from "@/lib/billing/subscription-checkout";
import {
  BillingAccountBusyError,
  tryLockBillingUserUnlessDeleting,
} from "@/lib/billing/subscription-state";
import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import {
  CHECKOUT_RETURN_COOKIE_MAX_AGE_SECONDS,
  checkoutReturnCookieName,
  encodeCheckoutReturnCookie,
  isCheckoutReturnHandle,
} from "@/lib/billing/checkout-return-cookie";

const SUBSCRIPTION_CHECKOUT_PROVIDER_DEADLINE_MS = 90_000;
const SUBSCRIPTION_CHECKOUT_PROVIDER_CALL_TIMEOUT_MS = 10_000;

// Request validation schema
const checkoutSchema = z.object({
  catalogId: z.enum(["interview_pass", "starter", "pro"]),
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate before evaluating the user-scoped relaunch gate.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const userId = user?.id;
    const userEmail = user?.email;

    if (authError || !userId) {
      return NextResponse.json(
        { error: "Authentication required for checkout" },
        { status: 401 }
      );
    }

    const gateName = FEATURE_GATES.meelniReactivationAccess;
    const access = await resolveReactivationAccess({
      user,
      localOverride: req.cookies.get(
        `meelni_feature_flag_${encodeURIComponent(gateName)}`
      )?.value,
    });
    if (!access.value) {
      return NextResponse.json(
        {
          error: "interview_practice_unavailable",
          message: "New purchases are unavailable before relaunch.",
          retryable: false,
        },
        { status: 403 }
      );
    }

    // 2. Parse input only after the disabled boundary is resolved.
    const body = await req.json();
    const { catalogId } = checkoutSchema.parse(body);

    if (await hasAccountDeletionTombstone(userId)) {
      return accountDeletionPendingResponse();
    }

    const stripe = getStripe();

    const priceId = getStripePriceIdForCatalogId(catalogId);
    const mode = getCheckoutModeForCatalogId(catalogId);
    const proposedReturnHandle = createCheckoutReturnHandle();
    const metadata = {
      userId,
      catalogId,
      checkoutReturnHandle: proposedReturnHandle,
    };

    if (mode === "subscription") {
      if (catalogId !== "starter" && catalogId !== "pro") {
        throw new Error("billing_subscription_catalog_invalid");
      }
      const providerDeadline = createProviderDeadline(
        SUBSCRIPTION_CHECKOUT_PROVIDER_DEADLINE_MS
      );
      const checkout = await obtainSerializedSubscriptionCheckout({
        userId,
        catalogId,
        priceId,
        withUserLock: (work) =>
          db.transaction(async (tx) => {
            await tryLockBillingUserUnlessDeleting(tx, userId);
            const readState = async (): Promise<SubscriptionCheckoutState> => {
              const [row] = await tx
                .select()
                .from(subscription)
                .where(eq(subscription.userId, userId))
                .limit(1)
                .for("update");
              const [mapping] = await tx
                .select({
                  stripeCustomerId: stripeCustomerMapping.stripeCustomerId,
                })
                .from(stripeCustomerMapping)
                .where(eq(stripeCustomerMapping.userId, userId))
                .orderBy(desc(stripeCustomerMapping.updatedAt))
                .limit(1)
                .for("update");
              return row
                ? {
                    version: row.version,
                    tier: row.tier,
                    status: row.status,
                    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
                    stripeCustomerId:
                      row.stripeCustomerId ?? mapping?.stripeCustomerId ?? null,
                    stripeSubscriptionId: row.stripeSubscriptionId,
                  }
                : {
                    ...emptySubscriptionCheckoutState(),
                    stripeCustomerId: mapping?.stripeCustomerId ?? null,
                  };
            };
            const recordCustomerId = async (customerId: string) => {
              const [existing] = await tx
                .select({ userId: stripeCustomerMapping.userId })
                .from(stripeCustomerMapping)
                .where(eq(stripeCustomerMapping.stripeCustomerId, customerId))
                .limit(1)
                .for("update");
              if (existing && existing.userId !== userId) {
                throw new Error("billing_subscription_customer_owner_mismatch");
              }
              if (!existing) {
                await tx.insert(stripeCustomerMapping).values({
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: null,
                  userId,
                });
              }
            };
            return work({ readState, recordCustomerId });
          }),
        createCustomer: async () => {
          const customer = await stripe.customers.create(
            {
              ...(userEmail ? { email: userEmail } : {}),
              metadata: { userId },
            },
            {
              idempotencyKey: subscriptionCustomerIdempotencyKey(userId),
              timeout: providerDeadline.timeout(),
            }
          );
          return customer.id;
        },
        hasProviderActiveSubscription: async (customerId) => {
          const [active, trialing] = await Promise.all([
            stripe.subscriptions.list(
              { customer: customerId, status: "active", limit: 1 },
              { timeout: providerDeadline.timeout() }
            ),
            stripe.subscriptions.list(
              { customer: customerId, status: "trialing", limit: 1 },
              { timeout: providerDeadline.timeout() }
            ),
          ]);
          return active.data.length > 0 || trialing.data.length > 0;
        },
        listOpenSessions: async (customerId) => {
          const sessions = await stripe.checkout.sessions.list(
            { customer: customerId, status: "open", limit: 100 },
            { timeout: providerDeadline.timeout() }
          );
          if (sessions.has_more) {
            throw new Error("billing_checkout_open_sessions_incomplete");
          }
          return sessions.data.flatMap((session) => {
            const returnHandle = session.metadata?.checkoutReturnHandle;
            return session.mode === "subscription" &&
              returnHandle &&
              isCheckoutReturnHandle(returnHandle)
              ? [
                  {
                    id: session.id,
                    url: session.url,
                    returnHandle,
                    catalogId: session.metadata?.catalogId ?? null,
                    userId:
                      session.metadata?.userId ??
                      session.client_reference_id ??
                      null,
                    customerId:
                      getStripeCustomerId(session.customer) ?? customerId,
                  },
                ]
              : [];
          });
        },
        createSession: async (idempotencyKey, customerId) => {
          const session = await stripe.checkout.sessions.create(
            checkoutSessionParams({
              req,
              userId,
              userEmail,
              priceId,
              mode,
              metadata,
              existingStripeCustomerId: customerId,
            }),
            { idempotencyKey, timeout: providerDeadline.timeout() }
          );
          return {
            id: session.id,
            url: session.url,
            returnHandle: proposedReturnHandle,
            catalogId,
            userId,
            customerId: getStripeCustomerId(session.customer) ?? customerId,
          };
        },
        expireSession: (sessionId) =>
          stripe.checkout.sessions
            .expire(
              sessionId,
              {},
              {
                idempotencyKey:
                  subscriptionCheckoutExpiryIdempotencyKey(sessionId),
                timeout: providerDeadline.timeout(),
              }
            )
            .then(() => undefined),
      });
      if (!checkout.allowed) {
        return subscriptionCheckoutBlockedResponse(checkout.reason);
      }
      return checkoutSessionResponse({
        url: checkout.session.url,
        sessionId: checkout.session.id,
        returnHandle: checkout.session.returnHandle,
        reused: checkout.reused,
      });
    }

    // One-time passes may reuse the current Stripe customer but do not conflict
    // with an active subscription.
    const existingSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    const existingStripeCustomerId = existingSubscription[0]?.stripeCustomerId;

    const checkout = await obtainCheckoutSessionUnlessDeleting({
      hasDeletionTombstone: () => hasAccountDeletionTombstone(userId),
      obtainSession: async () => {
        if (existingStripeCustomerId) {
          try {
            const existingSessions = await stripe.checkout.sessions.list({
              customer: existingStripeCustomerId,
              status: "open",
              limit: 10,
            });
            const existingSession = existingSessions.data.find(
              (openSession) =>
                openSession.metadata?.catalogId === catalogId &&
                openSession.metadata?.userId === userId &&
                openSession.client_reference_id === userId &&
                isCheckoutReturnHandle(
                  openSession.metadata?.checkoutReturnHandle
                )
            );
            if (existingSession) {
              return {
                id: existingSession.id,
                url: existingSession.url,
                returnHandle: existingSession.metadata!.checkoutReturnHandle!,
                reused: true,
              };
            }
          } catch {
            console.warn("Could not check existing Checkout sessions");
          }
        }

        const created = await stripe.checkout.sessions.create(
          checkoutSessionParams({
            req,
            userId,
            userEmail,
            priceId,
            mode,
            metadata,
            existingStripeCustomerId,
          })
        );
        return {
          id: created.id,
          url: created.url,
          returnHandle: proposedReturnHandle,
          reused: false,
        };
      },
      expireSession: async (sessionId, idempotencyKey) => {
        await stripe.checkout.sessions.expire(
          sessionId,
          {},
          { idempotencyKey }
        );
      },
    });

    if (!checkout.allowed) {
      return accountDeletionPendingResponse();
    }

    // 6. Return checkout URL
    return checkoutSessionResponse({
      url: checkout.session.url,
      sessionId: checkout.session.id,
      returnHandle: checkout.session.returnHandle,
      reused: checkout.session.reused,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof BillingAccountBusyError) {
      return billingBusyResponse();
    }

    console.error("[Checkout] Checkout session request failed");
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

function createProviderDeadline(totalMs: number) {
  const expiresAt = Date.now() + totalMs;
  return {
    timeout() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        throw new Error("billing_subscription_provider_deadline_exceeded");
      }
      return Math.max(
        1,
        Math.min(SUBSCRIPTION_CHECKOUT_PROVIDER_CALL_TIMEOUT_MS, remaining)
      );
    },
  };
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
) {
  return customer
    ? typeof customer === "string"
      ? customer
      : customer.id
    : null;
}

function checkoutSessionParams({
  req,
  userId,
  userEmail,
  priceId,
  mode,
  metadata,
  existingStripeCustomerId,
}: {
  req: NextRequest;
  userId: string;
  userEmail?: string;
  priceId: string;
  mode: "payment" | "subscription";
  metadata: {
    userId: string;
    catalogId: string;
    checkoutReturnHandle: string;
  };
  existingStripeCustomerId?: string | null;
}): Stripe.Checkout.SessionCreateParams {
  return {
    ...(existingStripeCustomerId
      ? { customer: existingStripeCustomerId }
      : userEmail
        ? { customer_email: userEmail }
        : {}),
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode,
    ...(mode === "subscription"
      ? {
          subscription_data: {
            metadata: {
              userId: metadata.userId,
              catalogId: metadata.catalogId,
            },
          },
        }
      : {}),
    metadata,
    success_url: `${req.nextUrl.origin}/pricing/success`,
    cancel_url: `${req.nextUrl.origin}/pricing/canceled`,
    allow_promotion_codes: true,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  };
}

function createCheckoutReturnHandle(): string {
  return `cr_${randomUUID().replaceAll("-", "")}`;
}

function checkoutSessionResponse(input: {
  url: string | null;
  sessionId: string;
  returnHandle: string;
  reused: boolean;
}): NextResponse {
  const cookieName = checkoutReturnCookieName(input.returnHandle);
  const cookieValue = encodeCheckoutReturnCookie(
    input.returnHandle,
    input.sessionId
  );
  if (!input.url || !cookieName || !cookieValue) {
    throw new Error("billing_checkout_return_handle_invalid");
  }
  const response = NextResponse.json({
    url: input.url,
    returnHandle: input.returnHandle,
    ...(input.reused ? { reused: true } : {}),
  });
  response.cookies.set(
    cookieName,
    cookieValue,
    checkoutReturnCookieOptions(CHECKOUT_RETURN_COOKIE_MAX_AGE_SECONDS)
  );
  return response;
}

function checkoutReturnCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function emptySubscriptionCheckoutState(): SubscriptionCheckoutState {
  return {
    version: 0,
    tier: null,
    status: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };
}

function subscriptionCheckoutBlockedResponse(
  reason:
    | "active_subscription"
    | "scheduled_subscription"
    | "open_checkout_for_other_plan"
    | "state_changed"
) {
  return NextResponse.json(
    {
      error:
        reason === "scheduled_subscription"
          ? "Reactivate your current subscription before changing plans"
          : reason === "active_subscription"
            ? "You already have an active subscription"
            : reason === "open_checkout_for_other_plan"
              ? "Finish or expire your existing subscription Checkout before choosing another plan"
              : "Your billing state changed. Please try again.",
      reactivationRequired: reason === "scheduled_subscription",
    },
    { status: reason === "state_changed" ? 409 : 400 }
  );
}

function accountDeletionPendingResponse() {
  return NextResponse.json(
    {
      error: "account_deletion_pending",
      message:
        "Checkout is unavailable because account deletion is already in progress.",
    },
    { status: 409 }
  );
}

function billingBusyResponse() {
  return NextResponse.json(
    {
      error: "billing_account_busy",
      message: "Another billing request is already in progress. Please retry.",
      retryable: true,
    },
    { status: 409, headers: { "Retry-After": "1" } }
  );
}

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
