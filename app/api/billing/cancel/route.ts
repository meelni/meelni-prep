import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import {
  getCancellationReadSnapshot,
  reconcileProviderCancellationState,
  reconcileVersionedProviderMutation,
  retrieveAuthoritativeSubscription,
  type CancellationStateSnapshot,
} from "@/lib/billing/subscription-state";

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
    const readSnapshot = await getCancellationReadSnapshot(userId);
    if (!readSnapshot) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const { subscription: sub, observedAt } = readSnapshot;

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
      return cancellationResponse(sub.currentPeriodEnd, observedAt);
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
      const converged = await convergeCancellationMutation({
        stripe,
        initial: providerSubscription,
        expected: sub,
        desiredCancelAtPeriodEnd: true,
      });

      return cancellationResponse(
        converged.currentPeriodEnd,
        converged.updatedAt
      );
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

function cancellationResponse(periodEnd: Date | null, observedAt: Date) {
  if (
    !periodEnd ||
    !Number.isFinite(periodEnd.getTime()) ||
    !Number.isFinite(observedAt.getTime()) ||
    periodEnd <= observedAt
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
    const readSnapshot = await getCancellationReadSnapshot(userId);
    if (!readSnapshot) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = readSnapshot.subscription;

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
      await convergeCancellationMutation({
        stripe,
        initial: providerSubscription,
        expected: sub,
        desiredCancelAtPeriodEnd: false,
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

async function convergeCancellationMutation({
  stripe,
  initial,
  expected,
  desiredCancelAtPeriodEnd,
}: {
  stripe: Stripe;
  initial: Stripe.Subscription;
  expected: CancellationStateSnapshot;
  desiredCancelAtPeriodEnd: boolean;
}) {
  if (!expected.stripeSubscriptionId) {
    throw new Error("billing_subscription_provider_mismatch");
  }
  const subscriptionId = expected.stripeSubscriptionId;
  const result = await reconcileVersionedProviderMutation({
    initialExpectedVersion: expected.version,
    initialSnapshot: initial,
    readVersion: async () => {
      const current = await getCancellationReadSnapshot(expected.userId);
      if (
        !current ||
        current.subscription.stripeSubscriptionId !== subscriptionId ||
        current.subscription.status === "canceled"
      ) {
        throw new Error("billing_subscription_provider_mismatch");
      }
      return current.subscription.version;
    },
    retrieve: () =>
      retrieveAuthoritativeSubscription(stripe.subscriptions, subscriptionId),
    commit: async ({ expectedVersion, snapshot }) => {
      if (snapshot.id !== subscriptionId || snapshot.status === "canceled") {
        throw new Error("billing_subscription_provider_mismatch");
      }
      return reconcileProviderCancellationState(
        {
          userId: expected.userId,
          stripeSubscriptionId: subscriptionId,
          cancelAtPeriodEnd: snapshot.cancel_at_period_end,
          currentPeriodEnd: providerPeriodEnd(snapshot),
        },
        expectedVersion
      );
    },
  });
  if (
    result.snapshot.cancel_at_period_end !== desiredCancelAtPeriodEnd ||
    result.value.cancelAtPeriodEnd !== desiredCancelAtPeriodEnd
  ) {
    throw new Error("billing_subscription_provider_state_changed");
  }
  return result.value;
}

function providerPeriodEnd(providerSubscription: Stripe.Subscription) {
  const periodEndSeconds =
    providerSubscription.items.data[0]?.current_period_end;
  if (!periodEndSeconds || !Number.isSafeInteger(periodEndSeconds)) {
    throw new Error("billing_subscription_period_end_missing");
  }
  const periodEnd = new Date(periodEndSeconds * 1000);
  if (!Number.isFinite(periodEnd.getTime())) {
    throw new Error("billing_subscription_period_end_invalid");
  }
  return periodEnd;
}
