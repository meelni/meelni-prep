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

    // 3. CRITICAL: Check for existing active subscription (prevent double-charge)
    const existingSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    const existingStripeCustomerId = existingSubscription[0]?.stripeCustomerId;

    if (existingSubscription.length > 0) {
      const sub = existingSubscription[0];

      // Block duplicate subscription checkout, but allow one-time pass purchases.
      if (
        catalogId !== "interview_pass" &&
        (sub.tier === "starter" || sub.tier === "pro") &&
        (sub.status === "active" || sub.status === "trialing") &&
        !sub.cancelAtPeriodEnd
      ) {
        return NextResponse.json(
          {
            error: "You already have an active subscription",
            existingTier: sub.tier,
            status: sub.status,
          },
          { status: 400 }
        );
      }
    }

    const priceId = getStripePriceIdForCatalogId(catalogId);
    const mode = getCheckoutModeForCatalogId(catalogId);
    const metadata = {
      userId,
      catalogId,
    };

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

        const created = await stripe.checkout.sessions.create({
          ...(existingStripeCustomerId
            ? { customer: existingStripeCustomerId }
            : userEmail
              ? { customer_email: userEmail }
              : {}),
          client_reference_id: userId,
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          mode,
          ...(mode === "subscription"
            ? {
                subscription_data: {
                  metadata,
                },
              }
            : {}),
          metadata,
          success_url: `${req.nextUrl.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${req.nextUrl.origin}/pricing/canceled`,
          allow_promotion_codes: true,
          // One minute above Stripe's minimum explicit Checkout lifetime so
          // request latency cannot make the timestamp invalid. Expiry narrows the
          // window; the post-create and webhook tombstone checks remain the
          // correctness boundary because expiry cannot prevent every race.
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        });
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
