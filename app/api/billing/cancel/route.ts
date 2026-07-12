import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import {
  BillingAccountBusyError,
  subscriptionMutationIdempotencyKey,
  withSerializedCancellationState,
} from "@/lib/billing/subscription-state";

const SUBSCRIPTION_MUTATION_TIMEOUT_MS = 10_000;

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

    const stripe = createStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: "Payment system not configured. Please contact support." },
        { status: 500 }
      );
    }

    try {
      return await mutateCancellationState({
        userId: user.id,
        stripe,
        desiredCancelAtPeriodEnd: true,
      });
    } catch (error) {
      if (error instanceof BillingAccountBusyError)
        return billingBusyResponse();
      if (isSubscriptionNotFoundError(error)) {
        return NextResponse.json(
          { error: "No subscription found" },
          { status: 404 }
        );
      }
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

    const stripe = createStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: "Unable to reactivate subscription. Please contact support." },
        { status: 500 }
      );
    }

    try {
      return await mutateCancellationState({
        userId: user.id,
        stripe,
        desiredCancelAtPeriodEnd: false,
      });
    } catch (error) {
      if (error instanceof BillingAccountBusyError)
        return billingBusyResponse();
      if (isSubscriptionNotFoundError(error)) {
        return NextResponse.json(
          { error: "No subscription found" },
          { status: 404 }
        );
      }
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

async function mutateCancellationState({
  userId,
  stripe,
  desiredCancelAtPeriodEnd,
}: {
  userId: string;
  stripe: Stripe;
  desiredCancelAtPeriodEnd: boolean;
}) {
  return withSerializedCancellationState(userId, async (state) => {
    const sub = state.subscription;
    if (sub.status === "canceled") {
      return NextResponse.json(
        {
          error:
            "Subscription has already ended and cannot be changed. Please start a new subscription.",
          currentPeriodEnd: sub.currentPeriodEnd,
        },
        { status: 409 }
      );
    }
    if (desiredCancelAtPeriodEnd && sub.cancelAtPeriodEnd) {
      return cancellationResponse(sub.currentPeriodEnd, state.observedAt);
    }
    if (!desiredCancelAtPeriodEnd && !sub.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is not scheduled for cancellation" },
        { status: 400 }
      );
    }
    if (sub.tier === "free") {
      return NextResponse.json(
        { error: "Free tier subscriptions cannot be canceled" },
        { status: 400 }
      );
    }
    if (!sub.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No Stripe subscription found. Please contact support." },
        { status: 400 }
      );
    }

    const action = desiredCancelAtPeriodEnd ? "cancel" : "reactivate";
    const providerSubscription = await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { cancel_at_period_end: desiredCancelAtPeriodEnd },
      {
        idempotencyKey: subscriptionMutationIdempotencyKey({
          userId,
          version: sub.version,
          action,
        }),
        timeout: SUBSCRIPTION_MUTATION_TIMEOUT_MS,
      }
    );
    if (
      providerSubscription.id !== sub.stripeSubscriptionId ||
      providerSubscription.status === "canceled" ||
      providerSubscription.cancel_at_period_end !== desiredCancelAtPeriodEnd
    ) {
      throw new Error("billing_subscription_provider_state_changed");
    }
    const committed = await state.commitProviderObservation({
      stripeSubscriptionId: sub.stripeSubscriptionId,
      cancelAtPeriodEnd: providerSubscription.cancel_at_period_end,
      currentPeriodEnd: providerPeriodEnd(providerSubscription),
    });
    if (desiredCancelAtPeriodEnd) {
      return cancellationResponse(
        committed.currentPeriodEnd,
        committed.updatedAt
      );
    }
    return NextResponse.json({
      success: true,
      message: "Your subscription has been reactivated.",
      status: "active",
    });
  });
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

function isSubscriptionNotFoundError(error: unknown) {
  return (
    error instanceof Error && error.message === "billing_subscription_not_found"
  );
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
