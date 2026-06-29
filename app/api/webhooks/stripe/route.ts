import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeEventLog, subscription, paymentHistory, stripeCustomerMapping } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createCreditLedgerService } from "@/lib/billing/credits";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
  isStripeCheckoutCatalogId,
} from "@/lib/billing/stripe-catalog";

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
    const stripe = getStripe();
    const webhookSecret = getStripeWebhookSecret();
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
        case "checkout.session.completed":
          await handleCheckoutCompleted(event);
          break;

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

function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is required");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}

function getStripeWebhookSecret() {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required");
  }

  return stripeWebhookSecret;
}

/**
 * Phase 0.5C: Get userId from Stripe customer with metadata fallback (P0 fix #3)
 *
 * CRITICAL: Always check stripe_customer_mapping as fallback
 * Stripe metadata can be overwritten via Customer Portal
 */
async function getUserIdFromStripe(customerId: string, fallbackMetadata?: string): Promise<string> {
  // First try: metadata (fast path)
  if (fallbackMetadata) {
    return fallbackMetadata;
  }

  // Second try: stripe_customer_mapping table (CRITICAL FALLBACK)
  const mapping = await db
    .select()
    .from(stripeCustomerMapping)
    .where(eq(stripeCustomerMapping.stripeCustomerId, customerId))
    .limit(1);

  if (mapping.length > 0) {
    return mapping[0].userId;
  }

  throw new Error(`Cannot find userId for Stripe customer ${customerId}`);
}

/**
 * Handle subscription.created and subscription.updated events
 *
 * Updates subscription state with optimistic locking
 * Phase 0.5C: Added customer mapping upsert and trial tracking (P0 fixes #2, #4)
 */
async function handleSubscriptionUpdate(event: Stripe.Event) {
  const stripeSubscription = event.data.object as Stripe.Subscription;

  // Phase 0.5C: Use metadata fallback (P0 fix #3)
  const userId = await getUserIdFromStripe(
    stripeSubscription.customer as string,
    stripeSubscription.metadata.userId
  );

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

  const catalogId = getStripeCatalogIdForPrice(
    stripeSubscription.items.data[0]?.price.id
  );

  // Phase 0.5C: Set trial tracking flags (P0 fix #4)
  let trialUpdates = {};
  if (
    stripeSubscription.status === "trialing" ||
    (stripeSubscription.trial_end && new Date(stripeSubscription.trial_end * 1000) < new Date())
  ) {
    if (catalogId === "pro") {
      trialUpdates = { proTrialUsed: true };
    }
  }

  // In recent Stripe API versions, current_period_start/end are read from the SubscriptionItem.
  const firstItem = stripeSubscription.items.data[0];

  const subscriptionData = {
    userId,
    tier: catalogId,
    status: mapStripeStatus(stripeSubscription.status),
    billingCycle: firstItem?.price.recurring?.interval === "month"
      ? "monthly" as const
      : "annual" as const,
    stripeCustomerId: stripeSubscription.customer as string,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: firstItem?.price.id,
    currentPeriodStart: firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000)
      : null,
    currentPeriodEnd: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : null,
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
    ...trialUpdates,
  };

  // Wrap all updates in a transaction for atomicity (P1 fix #5)
  await db.transaction(async (tx) => {
    if (currentSub.length === 0) {
      // Create new subscription
      await tx.insert(subscription).values(subscriptionData);
    } else {
      // Update with optimistic locking
      const result = await tx
        .update(subscription)
        .set(subscriptionData)
        .where(
          and(
            eq(subscription.userId, userId),
            eq(subscription.version, currentVersion)
          )
        )
        .returning({ id: subscription.id });

      // If no rows updated, version mismatch (concurrent update detected)
      if (result.length === 0) {
        throw new Error(`Optimistic lock failure: subscription version mismatch for user ${userId}`);
      }
    }

    // Phase 0.5C: Upsert stripe_customer_mapping (P0 fix #2)
    // CRITICAL: This is the source of truth if Stripe metadata gets overwritten
    await tx
      .insert(stripeCustomerMapping)
      .values({
        stripeCustomerId: stripeSubscription.customer as string,
        stripeSubscriptionId: stripeSubscription.id,
        userId,
      })
      .onConflictDoUpdate({
        target: stripeCustomerMapping.stripeCustomerId,
        set: {
          stripeSubscriptionId: stripeSubscription.id,
          userId,
          updatedAt: new Date(),
        },
      });

  });
}

/**
 * Handle checkout.session.completed events for one-time credit products.
 */
async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const catalogId = session.metadata?.catalogId;

  if (!userId || !catalogId || !isStripeCheckoutCatalogId(catalogId)) {
    console.warn("Missing Checkout metadata for credit grant", {
      sessionId: session.id,
    });
    return;
  }

  const customerId = getStripeCustomerId(session.customer);
  if (customerId) {
    await upsertStripeCustomerMapping({
      stripeCustomerId: customerId,
      userId,
    });
  }

  if (catalogId !== "interview_pass") {
    return;
  }

  const ledger = createCreditLedgerService({
    store: createDrizzleCreditLedgerStore(),
  });
  await ledger.grantCredits({
    userId,
    catalogId,
    source: "checkout",
    sourceId: session.id,
    idempotencyKey: `stripe:checkout:${session.id}:interview_pass`,
  });
}

/**
 * Handle subscription.deleted event
 */
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const stripeSubscription = event.data.object as Stripe.Subscription;

  // Phase 0.5C: Use metadata fallback (P0 fix #3)
  const userId = await getUserIdFromStripe(
    stripeSubscription.customer as string,
    stripeSubscription.metadata.userId
  );

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
  const customerId = getStripeCustomerId(invoice.customer);
  const userId = customerId
    ? await getUserIdFromStripe(customerId, invoice.metadata?.userId)
    : invoice.metadata?.userId;

  if (!userId) {
    console.warn("Missing userId in invoice metadata");
    return;
  }

  const catalogId = getStripeCatalogIdForPrice(getInvoicePriceId(invoice));

  if (catalogId === "starter" || catalogId === "pro") {
    const ledger = createCreditLedgerService({
      store: createDrizzleCreditLedgerStore(),
    });
    await ledger.rolloverSubscriptionCredits({
      userId,
      catalogId,
      idempotencyKey: `stripe:rollover:${invoice.id}:${catalogId}`,
      sourceId: invoice.id,
    });
    await ledger.grantCredits({
      userId,
      catalogId,
      source: "subscription_renewal",
      sourceId: invoice.id,
      idempotencyKey: `stripe:invoice:${invoice.id}:${catalogId}`,
    });
  }

  // In recent Stripe API versions, payment_intent moved to the invoice payments array.
  // For simplicity, we'll use null and rely on stripeInvoiceId for tracking
  // Use onConflictDoNothing() for idempotency (P1 fix #6)
  await db
    .insert(paymentHistory)
    .values({
      userId,
      stripePaymentIntentId: null,
      stripeInvoiceId: invoice.id,
      stripeEventId: event.id,
      amountInCents: invoice.amount_paid,
      currency: invoice.currency,
      status: "succeeded",
      tier: catalogId,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      receiptUrl: invoice.hosted_invoice_url,
    })
    .onConflictDoNothing({ target: paymentHistory.stripeEventId });

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
  const customerId = getStripeCustomerId(invoice.customer);
  const userId = customerId
    ? await getUserIdFromStripe(customerId, invoice.metadata?.userId)
    : invoice.metadata?.userId;

  if (!userId) {
    console.warn("Missing userId in invoice metadata");
    return;
  }

  // Record failed payment
  // In recent Stripe API versions, payment_intent moved to the invoice payments array.
  // For simplicity, we'll use null and rely on stripeInvoiceId for tracking
  // Use onConflictDoNothing() for idempotency (P1 fix #6)
  await db
    .insert(paymentHistory)
    .values({
      userId,
      stripePaymentIntentId: null,
      stripeInvoiceId: invoice.id,
      stripeEventId: event.id,
      amountInCents: invoice.amount_due,
      currency: invoice.currency,
      status: "failed",
      tier: getStripeCatalogIdForPrice(getInvoicePriceId(invoice)),
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      failureReason: invoice.last_finalization_error?.message || "Payment failed",
    })
    .onConflictDoNothing({ target: paymentHistory.stripeEventId });

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
 */
function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) {
    return null;
  }

  return typeof customer === "string" ? customer : customer.id;
}

function getInvoicePriceId(invoice: Stripe.Invoice): string | undefined {
  return invoice.lines.data[0]?.pricing?.price_details?.price;
}

async function upsertStripeCustomerMapping({
  stripeCustomerId,
  stripeSubscriptionId,
  userId,
}: {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  userId: string;
}) {
  await db
    .insert(stripeCustomerMapping)
    .values({
      stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId ?? null,
      userId,
    })
    .onConflictDoUpdate({
      target: stripeCustomerMapping.stripeCustomerId,
      set: {
        stripeSubscriptionId: stripeSubscriptionId ?? null,
        userId,
        updatedAt: new Date(),
      },
    });
}
