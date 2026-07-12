import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  subscriptionCheckoutExpiryIdempotencyKey,
  type SubscriptionCheckoutState,
} from "@/lib/billing/subscription-checkout";
import { lockBillingUserUnlessDeleting } from "@/lib/billing/subscription-state";

// Request validation schema
const checkoutSchema = z.object({
  catalogId: z.enum(["interview_pass", "starter", "pro"]),
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await req.json();
    const { catalogId } = checkoutSchema.parse(body);

    // 2. Check if user is authenticated (optional)
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

    if (await hasAccountDeletionTombstone(userId)) {
      return accountDeletionPendingResponse();
    }

    const stripe = getStripe();

    const priceId = getStripePriceIdForCatalogId(catalogId);
    const mode = getCheckoutModeForCatalogId(catalogId);
    const metadata = { userId, catalogId };

    if (mode === "subscription") {
      if (catalogId !== "starter" && catalogId !== "pro") {
        throw new Error("billing_subscription_catalog_invalid");
      }
      const checkout = await obtainSerializedSubscriptionCheckout({
        userId,
        catalogId,
        withUserLock: (work) =>
          db.transaction(async (tx) => {
            await lockBillingUserUnlessDeleting(tx, userId);
            const readState = async (): Promise<SubscriptionCheckoutState> => {
              const [row] = await tx
                .select()
                .from(subscription)
                .where(eq(subscription.userId, userId))
                .limit(1)
                .for("update");
              return row
                ? {
                    version: row.version,
                    tier: row.tier,
                    status: row.status,
                    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
                    stripeCustomerId: row.stripeCustomerId,
                    stripeSubscriptionId: row.stripeSubscriptionId,
                  }
                : emptySubscriptionCheckoutState();
            };
            return work(readState);
          }),
        hasProviderActiveSubscription: async (customerId) => {
          const [active, trialing] = await Promise.all([
            stripe.subscriptions.list(
              { customer: customerId, status: "active", limit: 1 },
              { timeout: 10_000 }
            ),
            stripe.subscriptions.list(
              { customer: customerId, status: "trialing", limit: 1 },
              { timeout: 10_000 }
            ),
          ]);
          return active.data.length > 0 || trialing.data.length > 0;
        },
        listOpenSessions: async (customerId) => {
          const sessions = await stripe.checkout.sessions.list(
            { customer: customerId, status: "open", limit: 100 },
            { timeout: 10_000 }
          );
          if (sessions.has_more) {
            throw new Error("billing_checkout_open_sessions_incomplete");
          }
          return sessions.data
            .filter((session) => session.mode === "subscription")
            .map((session) => ({
              id: session.id,
              url: session.url,
              catalogId: session.metadata?.catalogId ?? null,
              userId:
                session.metadata?.userId ?? session.client_reference_id ?? null,
            }));
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
            { idempotencyKey, timeout: 10_000 }
          );
          return {
            id: session.id,
            url: session.url,
            catalogId,
            userId,
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
                timeout: 10_000,
              }
            )
            .then(() => undefined),
      });
      if (!checkout.allowed) {
        return subscriptionCheckoutBlockedResponse(checkout.reason);
      }
      return NextResponse.json({
        url: checkout.session.url,
        sessionId: checkout.session.id,
        ...(checkout.reused ? { reused: true } : {}),
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
                openSession.client_reference_id === userId
            );
            if (existingSession) {
              return {
                id: existingSession.id,
                url: existingSession.url,
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
        return { id: created.id, url: created.url, reused: false };
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
    return NextResponse.json({
      url: checkout.session.url,
      sessionId: checkout.session.id,
      ...(checkout.session.reused ? { reused: true } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[Checkout] Checkout session request failed");
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
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
  metadata: { userId: string; catalogId: string };
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
    ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
    metadata,
    success_url: `${req.nextUrl.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.nextUrl.origin}/pricing/canceled`,
    allow_promotion_codes: true,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
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

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
