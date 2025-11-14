import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeEventLog, subscription, paymentHistory, usageRecord } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Stripe Webhook Handler with Idempotency
 *
 * Phase 0.5B: Implements webhook idempotency using stripe_event_log table
 *
 * Critical fixes:
 * 1. Idempotency check: Prevents duplicate event processing
 * 2. Event logging: All events stored in stripe_event_log
 * 3. Retry support: Failed events can be retried
 * 4. Atomic updates: Uses optimistic locking for subscription updates
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // CRITICAL: Idempotency check using stripe_event_log
    const existingEvent = await db
      .select()
      .from(stripeEventLog)
      .where(eq(stripeEventLog.stripeEventId, event.id))
      .limit(1);

    if (existingEvent.length > 0) {
      const eventLog = existingEvent[0];

      // If already processed, return success (idempotent)
      if (eventLog.status === "processed") {
        console.log(`Event ${event.id} already processed, skipping`);
        return NextResponse.json({ received: true, status: "already_processed" });
      }

      // If failed, allow retry (increment attempts)
      if (eventLog.status === "failed") {
        await db
          .update(stripeEventLog)
          .set({
            attempts: eventLog.attempts + 1,
            status: "pending",
          })
          .where(eq(stripeEventLog.id, eventLog.id));
      }
    } else {
      // Log new event
      await db.insert(stripeEventLog).values({
        stripeEventId: event.id,
        eventType: event.type,
        payload: JSON.stringify(event),
        status: "pending",
        attempts: 1,
      });
    }

    // Process event based on type
    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpdate(event);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event);
          break;

        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event);
          break;

        case "customer.subscription.trial_will_end":
          await handleTrialWillEnd(event);
          break;

        case "charge.refunded":
          await handleRefund(event);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      await db
        .update(stripeEventLog)
        .set({
          status: "processed",
          processedAt: new Date(),
        })
        .where(eq(stripeEventLog.stripeEventId, event.id));

      return NextResponse.json({ received: true });
    } catch (error) {
      // Mark event as failed
      await db
        .update(stripeEventLog)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(stripeEventLog.stripeEventId, event.id));

      throw error;
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle subscription.created and subscription.updated events
 *
 * Updates subscription state with optimistic locking
 */
async function handleSubscriptionUpdate(event: Stripe.Event) {
  const stripeSubscription = event.data.object as Stripe.Subscription;
  const userId = stripeSubscription.metadata.userId;

  if (!userId) {
    throw new Error("Missing userId in subscription metadata");
  }

  const eventTimestamp = new Date(event.created * 1000);

  // Get current subscription (for optimistic locking)
  const currentSub = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  const currentVersion = currentSub[0]?.version || 0;
  const lastEventTime = currentSub[0]?.lastEventTimestamp;

  // Prevent stale updates: Only process if event is newer than last processed event
  if (lastEventTime && eventTimestamp <= lastEventTime) {
    console.log(`Skipping stale event ${event.id} (${eventTimestamp} <= ${lastEventTime})`);
    return;
  }

  const subscriptionData = {
    userId,
    tier: getTierFromPrice(stripeSubscription.items.data[0]?.price.id),
    status: mapStripeStatus(stripeSubscription.status),
    billingCycle: stripeSubscription.items.data[0]?.price.recurring?.interval === "month"
      ? "monthly" as const
      : "annual" as const,
    stripeCustomerId: stripeSubscription.customer as string,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: stripeSubscription.items.data[0]?.price.id,
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    trialEnd: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
    canceledAt: stripeSubscription.canceled_at
      ? new Date(stripeSubscription.canceled_at * 1000)
      : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    version: currentVersion + 1,
    lastEventTimestamp: eventTimestamp,
    updatedAt: new Date(),
  };

  if (currentSub.length === 0) {
    // Create new subscription
    await db.insert(subscription).values(subscriptionData);
  } else {
    // Update with optimistic locking
    const result = await db
      .update(subscription)
      .set(subscriptionData)
      .where(
        and(
          eq(subscription.userId, userId),
          eq(subscription.version, currentVersion)
        )
      );

    // If no rows updated, version mismatch (concurrent update detected)
    if (result.rowCount === 0) {
      throw new Error(`Optimistic lock failure: subscription version mismatch for user ${userId}`);
    }
  }

  // Initialize usage record for new billing period if needed
  await initializeUsageRecord(userId, subscriptionData.currentPeriodStart, subscriptionData.currentPeriodEnd, subscriptionData.tier);
}

/**
 * Handle subscription.deleted event
 */
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const stripeSubscription = event.data.object as Stripe.Subscription;
  const userId = stripeSubscription.metadata.userId;

  if (!userId) {
    throw new Error("Missing userId in subscription metadata");
  }

  await db
    .update(subscription)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId));
}

/**
 * Handle invoice.payment_succeeded event
 *
 * Records successful payment in payment_history
 */
async function handlePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

  if (!userId) {
    console.warn("Missing userId in invoice metadata");
    return;
  }

  await db.insert(paymentHistory).values({
    userId,
    stripePaymentIntentId: invoice.payment_intent as string,
    stripeInvoiceId: invoice.id,
    stripeEventId: event.id,
    amountInCents: invoice.amount_paid,
    currency: invoice.currency,
    status: "succeeded",
    tier: invoice.lines.data[0]?.description || null,
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
    receiptUrl: invoice.hosted_invoice_url,
  });

  // Clear grace period if payment succeeds after past_due
  await db
    .update(subscription)
    .set({
      status: "active",
      gracePeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId));
}

/**
 * Handle invoice.payment_failed event
 *
 * Phase 0.5B: Implements 7-day grace period for failed payments
 */
async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

  if (!userId) {
    console.warn("Missing userId in invoice metadata");
    return;
  }

  // Record failed payment
  await db.insert(paymentHistory).values({
    userId,
    stripePaymentIntentId: invoice.payment_intent as string,
    stripeInvoiceId: invoice.id,
    stripeEventId: event.id,
    amountInCents: invoice.amount_due,
    currency: invoice.currency,
    status: "failed",
    tier: invoice.lines.data[0]?.description || null,
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
    failureReason: invoice.last_finalization_error?.message || "Payment failed",
  });

  // CRITICAL FIX: Set 7-day grace period
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

  await db
    .update(subscription)
    .set({
      status: "past_due",
      gracePeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId));
}

/**
 * Handle customer.subscription.trial_will_end event
 *
 * Phase 0.5B: Track trial expiration
 */
async function handleTrialWillEnd(event: Stripe.Event) {
  const stripeSubscription = event.data.object as Stripe.Subscription;
  const userId = stripeSubscription.metadata.userId;

  if (!userId) {
    throw new Error("Missing userId in subscription metadata");
  }

  // TODO: Send trial ending email notification (Phase 1)
  console.log(`Trial ending soon for user ${userId}`);
}

/**
 * Handle charge.refunded event
 *
 * Phase 0.5B: Track refunds in payment history
 */
async function handleRefund(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = charge.payment_intent as string;

  if (!paymentIntentId) {
    console.warn("Missing payment_intent in refund event");
    return;
  }

  // Update payment history to mark as refunded
  await db
    .update(paymentHistory)
    .set({
      status: "refunded",
    })
    .where(eq(paymentHistory.stripePaymentIntentId, paymentIntentId));
}

/**
 * Initialize usage record for new billing period
 */
async function initializeUsageRecord(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  tier: string
) {
  const limit = tier === "free" ? 3 : -1; // -1 = unlimited

  // Check if usage record already exists
  const existing = await db
    .select()
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.userId, userId),
        eq(usageRecord.periodStart, periodStart)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(usageRecord).values({
      userId,
      periodStart,
      periodEnd,
      interviewsUsed: 0,
      interviewsLimit: limit,
      tierSnapshot: tier,
    });
  }
}

/**
 * Map Stripe subscription status to our internal status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

/**
 * Get tier from Stripe price ID
 *
 * TODO: Replace with actual price ID mapping from environment variables
 */
function getTierFromPrice(priceId: string | undefined): string {
  if (!priceId) return "free";

  // Placeholder - should match actual Stripe price IDs
  if (priceId.includes("pro")) return "pro";
  if (priceId.includes("premium")) return "premium";

  return "free";
}
