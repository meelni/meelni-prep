import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import { reconcileProviderCancellationState } from "@/lib/billing/subscription-state";

// Keep the legacy false value deploy-compatible while rejecting the retired
// immediate-cancellation path and every unrecognized input.
const cancelSchema = z
  .object({ cancelImmediately: z.literal(false).optional() })
  .strict();

/**
 * POST /api/billing/cancel
 *
 * Cancel the user's subscription.
 *
 * Cancellation always takes effect at the end of the paid billing period.
 * Access and unused credits remain available until then. Refunds are a
 * separate manual support decision and are never created by this endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json().catch(() => null);
    const result = cancelSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const userId = user.id;

    // Get user's subscription
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    if (userSubscription.length === 0) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = userSubscription[0];

    // Check if already canceled
    if (sub.status === "canceled") {
      return NextResponse.json(
        {
          error: "Subscription has already ended",
          currentPeriodEnd: sub.currentPeriodEnd,
        },
        { status: 409 }
      );
    }

    if (sub.cancelAtPeriodEnd) {
      return cancellationResponse(sub.currentPeriodEnd);
    }

    // Check if free tier
    if (sub.tier === "free") {
      return NextResponse.json(
        { error: "Free tier subscriptions cannot be canceled" },
        { status: 400 }
      );
    }

    // Require Stripe configuration
    const stripe = createStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: "Payment system not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Cancel in Stripe
    if (!sub.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No Stripe subscription found. Please contact support." },
        { status: 400 }
      );
    }

    try {
      const providerSubscription = await stripe.subscriptions.update(
        sub.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
      if (!providerSubscription.cancel_at_period_end) {
        throw new Error("billing_cancel_provider_not_scheduled");
      }
      const observedAt = new Date();
      const periodEnd = providerPeriodEnd(providerSubscription, observedAt);
      await reconcileProviderCancellationState({
        userId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd,
      });

      return cancellationResponse(periodEnd);
    } catch {
      console.error("billing_cancel_provider_failed");
      return NextResponse.json(
        {
          error:
            "Failed to cancel subscription. Please try again or contact support.",
        },
        { status: 500 }
      );
    }
  } catch {
    console.error("billing_cancel_unexpected");
    return NextResponse.json(
      { error: "Failed to process cancellation request" },
      { status: 500 }
    );
  }
}

function createStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key
    ? new Stripe(key, {
        apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      })
    : null;
}

function cancellationResponse(periodEnd: Date | null) {
  if (
    !periodEnd ||
    !Number.isFinite(periodEnd.getTime()) ||
    periodEnd.getTime() <= Date.now()
  ) {
    return NextResponse.json(
      {
        error:
          "We could not confirm your paid-through date. Please contact support.",
      },
      { status: 409 }
    );
  }
  const timestamp = periodEnd.toISOString();
  return NextResponse.json({
    success: true,
    message:
      "Your subscription will end after the current paid billing period. You can keep using your access and unused credits until then. No automatic refund or proration was created.",
    status: "cancel_at_period_end",
    effectiveDate: timestamp,
    accessUntil: timestamp,
    unusedCreditsRetainedUntil: timestamp,
    automaticRefundCreated: false,
  });
}

/**
 * DELETE /api/billing/cancel
 *
 * Reactivate a subscription that was set to cancel at period end.
 * Only works if subscription hasn't actually been canceled yet.
 */
export async function DELETE() {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Get user's subscription
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    if (userSubscription.length === 0) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = userSubscription[0];

    // Check if subscription can be reactivated
    if (sub.status === "canceled") {
      return NextResponse.json(
        {
          error:
            "Subscription has already been canceled and cannot be reactivated. Please start a new subscription.",
        },
        { status: 400 }
      );
    }

    if (!sub.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is not scheduled for cancellation" },
        { status: 400 }
      );
    }

    const stripe = createStripeClient();
    if (!stripe || !sub.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "Unable to reactivate subscription. Please contact support." },
        { status: 500 }
      );
    }

    try {
      // Reactivate in Stripe
      const providerSubscription = await stripe.subscriptions.update(
        sub.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );
      if (providerSubscription.cancel_at_period_end) {
        throw new Error("billing_reactivate_provider_not_confirmed");
      }
      const observedAt = new Date();
      const periodEnd = providerPeriodEnd(providerSubscription, observedAt);
      await reconcileProviderCancellationState({
        userId,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      });

      return NextResponse.json({
        success: true,
        message: "Your subscription has been reactivated.",
        status: "active",
      });
    } catch {
      console.error("billing_reactivate_provider_failed");
      return NextResponse.json(
        { error: "Failed to reactivate subscription. Please contact support." },
        { status: 500 }
      );
    }
  } catch {
    console.error("billing_reactivate_unexpected");
    return NextResponse.json(
      { error: "Failed to process reactivation request" },
      { status: 500 }
    );
  }
}

function providerPeriodEnd(
  providerSubscription: Stripe.Subscription,
  observedAt: Date
) {
  const periodEndSeconds =
    providerSubscription.items.data[0]?.current_period_end;
  if (!periodEndSeconds || !Number.isSafeInteger(periodEndSeconds)) {
    throw new Error("billing_subscription_period_end_missing");
  }
  const periodEnd = new Date(periodEndSeconds * 1000);
  if (!Number.isFinite(periodEnd.getTime())) {
    throw new Error("billing_subscription_period_end_invalid");
  }
  if (periodEnd <= observedAt) {
    throw new Error("billing_subscription_period_end_not_future");
  }
  return periodEnd;
}
