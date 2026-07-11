import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import {
  accountDeletionRequest,
  appUser,
  stripeEventLog,
  subscription,
  paymentHistory,
  stripeCustomerMapping,
} from "@/lib/db/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { createCreditLedgerService } from "@/lib/billing/credits";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import { shouldApplyStripeSubscriptionState } from "@/lib/billing/stripe-event-ordering";
import {
  ensureStripeInvoicePaymentAllocationRefunded,
  ensureStripePaymentFullyRefunded,
} from "@/lib/billing/stripe-refund-reconciliation";
import { loadStripeInvoicePaymentAllocations } from "@/lib/billing/stripe-invoice-reconciliation";
import {
  getMappedStripeCustomerUserId,
  resolveAuthoritativeStripeUserId,
  stripeSubjectOwnerMismatch,
  type StripeCheckoutCorrelation,
} from "@/lib/billing/stripe-customer-ownership";
import {
  buildStripeDeletionSubject,
  buildStripeDeletionSubjects,
  getStripeEventSubject,
  type StripeDeletionSubject,
} from "@/lib/billing/stripe-privacy";
import {
  clearLateStripeDeletionSubjects,
  findStripeDeletionTombstoneFingerprint,
  getAccountDeletionRequestByStripeFingerprint,
  hasAccountDeletionTombstone,
  getAccountDeletionRequest,
  markLateStripeReconciliationFailed,
  recordLateStripeDeletionSubjects,
  redactStripeEventLogs,
} from "@/lib/db/account-deletions";
import {
  checkoutReconciliationErrorCode,
  checkoutSessionAuthenticatedUserId,
  deletedBillingIdempotencyKey,
  reconcileDeletedCheckoutSession,
  stripeEventMetadataUserId,
} from "@/lib/billing/account-deletion-guard";
import { isAlreadyDeletedProviderError } from "@/lib/workflows/delete-account";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
  isStripeCheckoutCatalogId,
} from "@/lib/billing/stripe-catalog";
import { reconcileStripeBillingAdjustment } from "@/lib/billing/stripe-billing-adjustment";
import { normalizeStripeBillingAdjustmentEvent } from "@/lib/billing/stripe-adjustment-events";
import { getStripeLogicalEventKey } from "@/lib/billing/stripe-event-identity";
import {
  mayApplyStripeSubscriptionResource,
  stripeSubscriptionCursorMayApply,
  stripeSubscriptionEventCursor,
  type StripeSubscriptionEventCursor,
} from "@/lib/billing/stripe-subscription-event-order";
import { stripeSubscriptionCursorIsNewer } from "@/lib/db/stripe-subscription-event-order";

const MAX_STRIPE_WEBHOOK_BODY_BYTES = 64 * 1024;
const PAYMENT_FAILURE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

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
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    const contentLength = req.headers.get("content-length");
    if (
      contentLength !== null &&
      (!/^\d+$/.test(contentLength) ||
        Number(contentLength) > MAX_STRIPE_WEBHOOK_BODY_BYTES)
    ) {
      return NextResponse.json({ error: "Webhook too large" }, { status: 413 });
    }
    const body = await readBoundedStripeWebhookBody(req);
    if (!body.ok) {
      return NextResponse.json(
        {
          error:
            body.reason === "too_large"
              ? "Webhook too large"
              : "Invalid webhook",
        },
        { status: body.reason === "too_large" ? 413 : 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body.value,
        signature,
        webhookSecret
      );
    } catch {
      console.error("Webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const subject = getStripeEventSubject(event);
    const logicalEventKey = getStripeLogicalEventKey(event);
    const metadataUserId = stripeEventMetadataUserId(event);
    const checkoutCorrelation = getCheckoutCorrelation(event, metadataUserId);
    const eventUserId =
      event.type === "checkout.session.completed"
        ? checkoutSessionAuthenticatedUserId(
            event.data.object as Stripe.Checkout.Session
          )
        : metadataUserId;
    const matchedDeletionFingerprint =
      await findStripeDeletionTombstoneFingerprint(subject.fingerprints);
    const subjectDeletionRequest = matchedDeletionFingerprint
      ? await getAccountDeletionRequestByStripeFingerprint(
          matchedDeletionFingerprint
        )
      : undefined;
    const mappedUserId = await getMappedStripeCustomerUserId(
      subject.customerId
    );
    const authoritativeUserId = resolveAuthoritativeStripeUserId({
      checkoutCorrelation,
      eventUserId,
      mappedUserId,
      tombstoneUserId: subjectDeletionRequest?.userId ?? null,
    });
    const userDeletionTombstone = authoritativeUserId
      ? await hasAccountDeletionTombstone(authoritativeUserId)
      : false;
    const deletionUserId =
      subjectDeletionRequest?.userId ??
      (userDeletionTombstone ? authoritativeUserId : null);
    const deletionTombstone = Boolean(
      subjectDeletionRequest || userDeletionTombstone
    );
    const reconcileDeletedBilling =
      deletionTombstone && isDeletedBillingReconciliationEvent(event.type);

    // CRITICAL: Idempotency check using stripe_event_log
    let existingEvent = await db
      .select()
      .from(stripeEventLog)
      .where(
        logicalEventKey
          ? or(
              eq(stripeEventLog.stripeEventId, event.id),
              eq(stripeEventLog.logicalEventKey, logicalEventKey)
            )
          : eq(stripeEventLog.stripeEventId, event.id)
      )
      .limit(1);

    let eventLog = existingEvent[0];
    let logicalReplay = false;

    if (eventLog) {
      logicalReplay = eventLog.stripeEventId !== event.id;
      // Upgrade legacy rows before any early return or retry transition. This
      // prevents a process interruption from leaving an old raw payload behind.
      await db
        .update(stripeEventLog)
        .set({ payload: "{}", lastError: null })
        .where(eq(stripeEventLog.id, eventLog.id));

      if (deletionTombstone && !reconcileDeletedBilling) {
        await db
          .update(stripeEventLog)
          .set({
            status: "processed",
            payload: "{}",
            lastError: null,
            processedAt: new Date(),
            subjectFingerprint: matchedDeletionFingerprint,
            subjectFingerprints: subject.fingerprints,
          })
          .where(eq(stripeEventLog.id, eventLog.id));
        return NextResponse.json({ received: true, status: "deleted_subject" });
      }

      // Exact duplicate Event deliveries require no state validation. A new
      // Event object with the same logical key replays the idempotent handler,
      // which verifies the already-persisted payment truth below.
      if (eventLog.status === "processed" && !logicalReplay) {
        console.log("Stripe webhook duplicate skipped");
        return NextResponse.json({
          received: true,
          status: "already_processed",
        });
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
      } else if (reconcileDeletedBilling) {
        // Reconcile even if an older deployment marked the event processed.
        // The provider operations share object-derived idempotency keys.
        await db
          .update(stripeEventLog)
          .set({ status: "pending", payload: "{}", lastError: null })
          .where(eq(stripeEventLog.id, eventLog.id));
      }
    } else {
      // Log new event
      const inserted = await db
        .insert(stripeEventLog)
        .values({
          stripeEventId: event.id,
          logicalEventKey,
          eventType: event.type,
          subjectFingerprint: matchedDeletionFingerprint ?? subject.fingerprint,
          subjectFingerprints: subject.fingerprints,
          // Never persist raw Stripe payloads. The verified event is scoped to
          // this request; durable logs retain only operational metadata.
          payload: "{}",
          status:
            deletionTombstone && !reconcileDeletedBilling
              ? "processed"
              : "pending",
          attempts: 1,
          processedAt:
            deletionTombstone && !reconcileDeletedBilling ? new Date() : null,
        })
        .onConflictDoNothing()
        .returning();
      eventLog = inserted[0];
      if (!eventLog) {
        existingEvent = await db
          .select()
          .from(stripeEventLog)
          .where(
            logicalEventKey
              ? or(
                  eq(stripeEventLog.stripeEventId, event.id),
                  eq(stripeEventLog.logicalEventKey, logicalEventKey)
                )
              : eq(stripeEventLog.stripeEventId, event.id)
          )
          .limit(1);
        eventLog = existingEvent[0];
        if (!eventLog) throw new Error("stripe_event_log_conflict_unresolved");
        logicalReplay = eventLog.stripeEventId !== event.id;
      }
    }

    if (deletionTombstone) {
      if (reconcileDeletedBilling) {
        await db
          .update(stripeEventLog)
          .set({
            payload: "{}",
            lastError: null,
            subjectFingerprint: subject.fingerprint,
          })
          .where(eq(stripeEventLog.stripeEventId, event.id));
        try {
          const reconciliationStatus =
            await reconcileStripeEventForDeletedAccount(
              event,
              stripe,
              deletionUserId
            );
          await db
            .update(stripeEventLog)
            .set({
              status: "processed",
              payload: "{}",
              lastError: null,
              processedAt: new Date(),
              subjectFingerprint: subject.fingerprint,
            })
            .where(eq(stripeEventLog.stripeEventId, event.id));
          return NextResponse.json({
            received: true,
            status: reconciliationStatus,
          });
        } catch (error) {
          await db
            .update(stripeEventLog)
            .set({
              status: "failed",
              payload: "{}",
              lastError: checkoutReconciliationErrorCode(error),
              subjectFingerprint: subject.fingerprint,
            })
            .where(eq(stripeEventLog.stripeEventId, event.id));
          throw error;
        }
      }
      return NextResponse.json({ received: true, status: "deleted_subject" });
    }

    // Process event based on type
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event, stripe);
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

        case "refund.created":
        case "refund.updated":
        case "refund.failed":
        case "charge.refunded":
          await handleRefundOrDispute(event);
          break;

        case "charge.dispute.created":
        case "charge.dispute.funds_withdrawn":
        case "charge.dispute.funds_reinstated":
        case "charge.dispute.closed":
          await handleRefundOrDispute(event);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      await db
        .update(stripeEventLog)
        .set({
          status: "processed",
          payload: "{}",
          processedAt: new Date(),
        })
        .where(eq(stripeEventLog.id, eventLog.id));

      return NextResponse.json({
        received: true,
        ...(logicalReplay ? { status: "logical_replay" } : {}),
      });
    } catch (error) {
      if (
        isAccountDeletionPendingError(error) &&
        isDeletedBillingReconciliationEvent(event.type)
      ) {
        await redactDeletedStripeEvent(event);
        try {
          const reconciliationStatus =
            await reconcileStripeEventForDeletedAccount(
              event,
              stripe,
              deletionUserId ?? eventUserId
            );
          await db
            .update(stripeEventLog)
            .set({
              status: "processed",
              payload: "{}",
              lastError: null,
              processedAt: new Date(),
              subjectFingerprint: subject.fingerprint,
            })
            .where(eq(stripeEventLog.stripeEventId, event.id));
          return NextResponse.json({
            received: true,
            status: reconciliationStatus,
          });
        } catch (reconciliationError) {
          await db
            .update(stripeEventLog)
            .set({
              status: "failed",
              payload: "{}",
              lastError: checkoutReconciliationErrorCode(reconciliationError),
              subjectFingerprint: subject.fingerprint,
            })
            .where(eq(stripeEventLog.stripeEventId, event.id));
          throw reconciliationError;
        }
      }

      // Mark event as failed
      await db
        .update(stripeEventLog)
        .set({
          status: "failed",
          payload: "{}",
          lastError: safeStripeWebhookErrorCode(error),
        })
        .where(eq(stripeEventLog.id, eventLog.id));

      throw error;
    }
  } catch {
    console.error("Stripe webhook processing failed");
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
async function getUserIdFromStripe(
  customerId: string,
  fallbackMetadata?: string
): Promise<string> {
  const mappedUserId = await getMappedStripeCustomerUserId(customerId);
  const userId = resolveAuthoritativeStripeUserId({
    checkoutCorrelation: "not_applicable",
    eventUserId: fallbackMetadata ?? null,
    mappedUserId,
    tombstoneUserId: null,
  });
  if (userId) return userId;

  if (fallbackMetadata) return fallbackMetadata;

  throw new Error("stripe_customer_owner_not_found");
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
  const eventCursor = stripeSubscriptionEventCursor(event);

  // Get current subscription (for optimistic locking)
  const currentSub = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  const currentResourceId = currentSub[0]?.stripeSubscriptionId ?? null;
  if (
    !mayApplyStripeSubscriptionResource({
      currentResourceId,
      currentStatus: currentSub[0]?.status ?? null,
      candidateResourceId: stripeSubscription.id,
      eventType: event.type,
    })
  ) {
    console.log("Stripe event skipped for superseded subscription resource");
    return;
  }
  const currentCursor = subscriptionEventCursorFromRow(currentSub[0]);
  if (
    !stripeSubscriptionCursorMayApply({
      currentResourceId,
      candidateResourceId: stripeSubscription.id,
      currentCursor,
      candidateCursor: eventCursor,
    })
  ) {
    console.log("Stripe subscription event skipped as stale");
    return;
  }

  const catalogId = getStripeCatalogIdForPrice(
    stripeSubscription.items.data[0]?.price.id
  );

  // Phase 0.5C: Set trial tracking flags (P0 fix #4)
  let trialUpdates = {};
  if (
    stripeSubscription.status === "trialing" ||
    (stripeSubscription.trial_end &&
      new Date(stripeSubscription.trial_end * 1000) < new Date())
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
    billingCycle:
      firstItem?.price.recurring?.interval === "month"
        ? ("monthly" as const)
        : ("annual" as const),
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
    lastEventTimestamp: eventTimestamp,
    lastEventPriority: eventCursor.priority,
    lastEventId: eventCursor.eventId,
    updatedAt: new Date(),
    ...trialUpdates,
  };

  // Wrap all updates in a transaction for atomicity (P1 fix #5)
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    const currentSub = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1)
      .for("update");
    if (
      currentSub[0] &&
      !shouldApplyStripeSubscriptionState({
        currentStatus: currentSub[0].status,
        currentStripeSubscriptionId: currentSub[0].stripeSubscriptionId,
        event:
          event.type === "customer.subscription.created"
            ? "subscription_created"
            : "subscription_updated",
        eventTimestamp,
        incomingStripeSubscriptionId: stripeSubscription.id,
        lastEventTimestamp: currentSub[0].lastEventTimestamp,
      })
    ) {
      return;
    }
    const currentVersion = currentSub[0]?.version ?? 0;
    const nextSubscriptionData = {
      ...subscriptionData,
      version: currentVersion + 1,
    };

    if (currentSub.length === 0) {
      // Create new subscription
      await tx.insert(subscription).values(nextSubscriptionData);
    } else {
      // Update with optimistic locking
      const result = await tx
        .update(subscription)
        .set(nextSubscriptionData)
        .where(
          and(
            eq(subscription.userId, userId),
            eq(subscription.version, currentVersion)
          )
        )
        .returning({ id: subscription.id });

      // If no rows updated, version mismatch (concurrent update detected)
      if (result.length === 0) {
        throw new Error("stripe_subscription_version_conflict");
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
async function handleCheckoutCompleted(
  event: Stripe.Event,
  stripe: Stripe
): Promise<"processed" | "deleted_checkout_reconciled"> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = checkoutSessionAuthenticatedUserId(session);
  const catalogId = session.metadata?.catalogId;

  if (!userId || !catalogId || !isStripeCheckoutCatalogId(catalogId)) {
    console.warn("Checkout fulfillment rejected invalid account correlation");
    return "processed";
  }

  if (await hasAccountDeletionTombstone(userId)) {
    await redactDeletedStripeEvent(event);
    await reconcileCheckoutForDeletedAccount(session, stripe, userId);
    return "deleted_checkout_reconciled";
  }

  try {
    if (catalogId === "interview_pass") {
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

    const customerId = getStripeCustomerId(session.customer);
    if (customerId) {
      await upsertStripeCustomerMapping({
        stripeCustomerId: customerId,
        userId,
      });
    }
  } catch (error) {
    if (!isAccountDeletionPendingError(error)) throw error;
    await redactDeletedStripeEvent(event);
    await reconcileCheckoutForDeletedAccount(session, stripe, userId);
    return "deleted_checkout_reconciled";
  }

  if (session.payment_status !== "paid") {
    throw new Error("checkout_payment_not_settled");
  }
  const paymentIntentId = getExpandableId(session.payment_intent);
  if (!paymentIntentId || session.amount_total === null || !session.currency) {
    throw new Error("billing_payment_correlation_required");
  }

  const ledger = createCreditLedgerService({
    store: createDrizzleCreditLedgerStore(),
  });
  const { grant } = await ledger.grantCredits({
    userId,
    catalogId,
    source: "checkout",
    sourceId: session.id,
    idempotencyKey: `stripe:checkout:${session.id}:interview_pass`,
  });
  await db
    .insert(paymentHistory)
    .values({
      userId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutSessionId: session.id,
      stripeEventId: event.id,
      creditGrantId: grant.id,
      catalogId,
      amountInCents: session.amount_total,
      currency: session.currency,
      status: "succeeded",
      tier: catalogId,
    })
    .onConflictDoNothing();
  const persisted = await db
    .select()
    .from(paymentHistory)
    .where(eq(paymentHistory.stripeCheckoutSessionId, session.id))
    .limit(1);
  assertPersistedPayment(persisted[0], {
    userId,
    stripePaymentIntentId: paymentIntentId,
    creditGrantId: grant.id,
    catalogId,
    amountInCents: session.amount_total,
    currency: session.currency,
    status: "succeeded",
  });
  return "processed";
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

  const eventTimestamp = new Date(event.created * 1000);
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    const [currentSub] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1)
      .for("update");
    if (
      !currentSub ||
      !shouldApplyStripeSubscriptionState({
        currentStatus: currentSub.status,
        currentStripeSubscriptionId: currentSub.stripeSubscriptionId,
        event: "subscription_deleted",
        eventTimestamp,
        incomingStripeSubscriptionId: stripeSubscription.id,
        lastEventTimestamp: currentSub.lastEventTimestamp,
      })
    ) {
      return;
    }
    await tx
      .update(subscription)
      .set({
        status: "canceled",
        canceledAt: eventTimestamp,
        lastEventTimestamp: eventTimestamp,
        version: currentSub.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, userId));
  });
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
  let creditGrantId: string | null = null;

  if (catalogId === "starter" || catalogId === "pro") {
    const ledger = createCreditLedgerService({
      store: createDrizzleCreditLedgerStore(),
    });
    const renewal = await ledger.renewSubscriptionCredits({
      userId,
      catalogId,
      renewalIdempotencyKey: `stripe:invoice:${invoice.id}:${catalogId}`,
      rolloverIdempotencyKey: `stripe:rollover:${invoice.id}:${catalogId}`,
      sourceId: invoice.id,
    });
    creditGrantId = renewal.grant.id;
  }

  const invoicePayment = await getInvoicePaymentCorrelation(invoice);
  const eventTimestamp = new Date(event.created * 1000);
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    // In recent Stripe API versions, payment_intent moved to invoice payments.
    // The event ID remains the durable idempotency key for payment history.
    await tx
      .insert(paymentHistory)
      .values({
        userId,
        stripePaymentIntentId: invoicePayment.paymentIntentId,
        stripeInvoiceId: invoice.id,
        stripeChargeId: invoicePayment.chargeId,
        stripeEventId: event.id,
        creditGrantId,
        catalogId,
        amountInCents: invoice.amount_paid,
        currency: invoice.currency,
        status: "succeeded",
        tier: catalogId,
        periodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null,
        receiptUrl: invoice.hosted_invoice_url,
      })
      .onConflictDoNothing({ target: paymentHistory.stripeEventId });

    const persisted = await tx
      .select()
      .from(paymentHistory)
      .where(
        and(
          eq(paymentHistory.stripeInvoiceId, invoice.id),
          eq(paymentHistory.status, "succeeded")
        )
      )
      .limit(1);
    assertPersistedPayment(persisted[0], {
      userId,
      stripePaymentIntentId: invoicePayment.paymentIntentId,
      stripeChargeId: invoicePayment.chargeId,
      creditGrantId,
      catalogId,
      amountInCents: invoice.amount_paid,
      currency: invoice.currency,
      status: "succeeded",
    });

    const [currentSub] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1)
      .for("update");
    if (
      !currentSub ||
      !shouldApplyStripeSubscriptionState({
        currentStatus: currentSub.status,
        currentStripeSubscriptionId: currentSub.stripeSubscriptionId,
        event: "invoice_succeeded",
        eventTimestamp,
        incomingStripeSubscriptionId: getInvoiceSubscriptionId(invoice),
        lastEventTimestamp: currentSub.lastEventTimestamp,
      })
    ) {
      return;
    }
    // Older invoice events may still be recorded, but cannot overwrite newer
    // or terminal subscription state.
    await tx
      .update(subscription)
      .set({
        status: "active",
        gracePeriodEnd: null,
        lastEventTimestamp: eventTimestamp,
        version: currentSub.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, userId));
  });
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

  const settledPayment = await db
    .select({ id: paymentHistory.id })
    .from(paymentHistory)
    .where(
      and(
        eq(paymentHistory.stripeInvoiceId, invoice.id),
        eq(paymentHistory.status, "succeeded")
      )
    )
    .limit(1);
  if (settledPayment[0]) {
    // Stripe does not guarantee delivery order. A delayed failure must not
    // overwrite a later successful settlement for the same invoice.
    return;
  }

  // Set a 7-day grace period without persisting raw provider errors.
  const eventTimestamp = new Date(event.created * 1000);
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    await tx
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
        periodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : null,
        periodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : null,
        failureReason: "payment_failed",
        createdAt: stripeEventCreatedAt(event),
      })
      .onConflictDoNothing();
    const persisted = await tx
      .select()
      .from(paymentHistory)
      .where(
        and(
          eq(paymentHistory.stripeInvoiceId, invoice.id),
          eq(paymentHistory.status, "failed")
        )
      )
      .limit(1);
    assertPersistedPayment(persisted[0], {
      userId,
      catalogId: getStripeCatalogIdForPrice(getInvoicePriceId(invoice)),
      amountInCents: invoice.amount_due,
      currency: invoice.currency,
      status: "failed",
    });
    const gracePeriodEnd = new Date(
      persisted[0]!.createdAt.getTime() + PAYMENT_FAILURE_GRACE_MS
    );

    const [currentSub] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1)
      .for("update");
    if (
      !currentSub ||
      !shouldApplyStripeSubscriptionState({
        currentStatus: currentSub.status,
        currentStripeSubscriptionId: currentSub.stripeSubscriptionId,
        event: "invoice_failed",
        eventTimestamp,
        incomingStripeSubscriptionId: getInvoiceSubscriptionId(invoice),
        lastEventTimestamp: currentSub.lastEventTimestamp,
      })
    ) {
      return;
    }
    await tx
      .update(subscription)
      .set({
        status: "past_due",
        gracePeriodEnd,
        lastEventTimestamp: eventTimestamp,
        version: currentSub.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(subscription.userId, userId));
  });
}

function subscriptionEventCursorFromRow(
  row:
    | {
        lastEventTimestamp: Date | null;
        lastEventPriority: number | null;
        lastEventId: string | null;
      }
    | undefined
): StripeSubscriptionEventCursor | null {
  if (!row?.lastEventTimestamp) return null;
  return {
    createdAt: row.lastEventTimestamp,
    priority: row.lastEventPriority ?? -1,
    eventId: row.lastEventId ?? "",
  };
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
  console.log("Stripe trial ending event accepted");
}

/**
 * Handle charge.refunded event
 *
 * Phase 0.5B: Track refunds in payment history
 */
async function handleRefundOrDispute(event: Stripe.Event) {
  await reconcileStripeBillingAdjustment(
    normalizeStripeBillingAdjustmentEvent(event)
  );
}

type PersistedPayment = typeof paymentHistory.$inferSelect;

function assertPersistedPayment(
  actual: PersistedPayment | undefined,
  expected: Partial<
    Pick<
      PersistedPayment,
      | "userId"
      | "stripePaymentIntentId"
      | "stripeChargeId"
      | "creditGrantId"
      | "catalogId"
      | "amountInCents"
      | "currency"
      | "status"
    >
  >
) {
  if (!actual) throw new Error("billing_payment_persistence_conflict");
  for (const [field, value] of Object.entries(expected)) {
    if (actual[field as keyof PersistedPayment] !== value) {
      throw new Error(`billing_payment_truth_mismatch:${field}`);
    }
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

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockBillingUserUnlessDeleting(
  tx: BillingTransaction,
  userId: string
) {
  const [user] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1)
    .for("update");
  if (!user) throw new Error("billing_user_not_found");
  const [tombstone] = await tx
    .select({ userId: accountDeletionRequest.userId })
    .from(accountDeletionRequest)
    .where(eq(accountDeletionRequest.userId, userId))
    .limit(1);
  if (tombstone) throw new Error("account_deletion_pending");
}

function getExpandableId(value: { id: string } | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function getInvoicePaymentCorrelation(invoice: Stripe.Invoice) {
  const embedded = invoice.payments?.data.find(
    (candidate) => candidate.status === "paid"
  );
  const invoicePayment =
    embedded ??
    (
      await getStripe().invoicePayments.list({
        invoice: invoice.id,
        limit: 10,
      })
    ).data.find((candidate) => candidate.status === "paid");
  const paymentIntent = invoicePayment?.payment.payment_intent;
  const charge = invoicePayment?.payment.charge;
  const expandedPaymentIntent =
    paymentIntent && typeof paymentIntent !== "string" ? paymentIntent : null;
  return {
    paymentIntentId: getExpandableId(paymentIntent),
    chargeId:
      getExpandableId(charge) ??
      getExpandableId(expandedPaymentIntent?.latest_charge),
  };
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
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("billing_user_not_found");
    const [tombstone] = await tx
      .select({ userId: accountDeletionRequest.userId })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1);
    if (tombstone) throw new Error("account_deletion_pending");

    await tx
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
  });
}

async function reconcileCheckoutForDeletedAccount(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  userId: string | null
) {
  const customerId = getStripeCustomerId(session.customer);
  const checkoutPaymentIntentId = getProviderId(session.payment_intent);
  const lateSubjects = await recordAndRedactLateSubjects(
    userId,
    getProviderId(session.subscription),
    customerId,
    compactSubjects([
      buildStripeDeletionSubject("payment_intent", checkoutPaymentIntentId),
      checkoutPaymentIntentId
        ? null
        : buildStripeDeletionSubject("invoice", getProviderId(session.invoice)),
    ])
  );

  try {
    const result = await reconcileDeletedCheckoutSession(session, {
      expireCheckout: async (checkoutSessionId, idempotencyKey) => {
        try {
          await stripe.checkout.sessions.expire(
            checkoutSessionId,
            {},
            { idempotencyKey }
          );
        } catch (error) {
          if (!isAlreadyDeletedProviderError(error)) throw error;
        }
      },
      cancelSubscription: async (subscriptionId, idempotencyKey) => {
        await cancelDeletedSubscription(stripe, subscriptionId, idempotencyKey);
      },
      loadInvoicePayments: async (invoiceId) => {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        return loadStripeInvoicePaymentAllocations(stripe, invoice);
      },
      refundPayment: async (payment, idempotencyKey) => {
        await refundDeletedPayment(stripe, payment, idempotencyKey);
      },
    });
    await cleanupDeletedCustomer(
      stripe,
      userId,
      customerId,
      lateSubjects.map(({ fingerprint }) => fingerprint)
    );
    return result;
  } catch (error) {
    if (userId) await markLateStripeReconciliationFailed(userId);
    throw normalizeDeletedBillingError(
      error,
      "deleted_checkout_reconciliation_failed"
    );
  }
}

type DeletedPaymentReference = {
  allocationAmount?: number;
  allocationFingerprint?: string;
  kind: "payment_intent" | "charge";
  providerId: string;
};

async function reconcileStripeEventForDeletedAccount(
  event: Stripe.Event,
  stripe: Stripe,
  userId: string | null
): Promise<
  | "deleted_checkout_reconciled"
  | "deleted_subscription_reconciled"
  | "deleted_invoice_reconciled"
> {
  if (event.type === "checkout.session.completed") {
    await reconcileCheckoutForDeletedAccount(
      event.data.object as Stripe.Checkout.Session,
      stripe,
      userId
    );
    return "deleted_checkout_reconciled";
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const stripeSubscription = event.data.object as Stripe.Subscription;
    const customerId = getStripeCustomerId(stripeSubscription.customer);
    const latestInvoiceId =
      event.type === "customer.subscription.created"
        ? getProviderId(stripeSubscription.latest_invoice)
        : null;
    const lateSubjects = await recordAndRedactLateSubjects(
      userId,
      stripeSubscription.id,
      customerId,
      compactSubjects([buildStripeDeletionSubject("invoice", latestInvoiceId)])
    );
    try {
      await cancelDeletedSubscription(
        stripe,
        stripeSubscription.id,
        deletedBillingIdempotencyKey(stripeSubscription.id, "cancel")
      );

      let reconciledSubjects = lateSubjects;
      if (event.type === "customer.subscription.created") {
        if (!latestInvoiceId) {
          throw deletedBillingError(
            "deleted_subscription_manual_reconciliation_required"
          );
        }
        const invoice = await stripe.invoices.retrieve(latestInvoiceId);
        if (
          !Number.isSafeInteger(invoice.amount_paid) ||
          invoice.amount_paid < 0
        ) {
          throw deletedBillingError(
            "deleted_subscription_manual_reconciliation_required"
          );
        }
        const payments = await loadStripeInvoicePaymentAllocations(
          stripe,
          invoice
        );
        if (invoice.amount_paid > 0) {
          const paymentSubjects = await recordAndRedactLateSubjects(
            userId,
            null,
            null,
            compactSubjects(
              payments.map((payment) =>
                buildStripeDeletionSubject(payment.kind, payment.providerId)
              )
            )
          );
          reconciledSubjects = dedupeSubjects([
            ...reconciledSubjects,
            ...paymentSubjects,
          ]);
          for (const payment of payments) {
            await refundDeletedPayment(stripe, payment);
          }
        }
      }
      await cleanupDeletedCustomer(
        stripe,
        userId,
        customerId,
        reconciledSubjects.map(({ fingerprint }) => fingerprint)
      );
    } catch (error) {
      if (userId) await markLateStripeReconciliationFailed(userId);
      throw normalizeDeletedBillingError(
        error,
        "deleted_subscription_reconciliation_failed",
        "deleted_subscription_manual_reconciliation_required"
      );
    }
    return "deleted_subscription_reconciled";
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getInvoiceSubscriptionId(invoice);
    const customerId = getStripeCustomerId(invoice.customer);
    const initialSubjects = await recordAndRedactLateSubjects(
      userId,
      subscriptionId,
      customerId,
      compactSubjects([buildStripeDeletionSubject("invoice", invoice.id)])
    );
    try {
      const payments = await loadStripeInvoicePaymentAllocations(
        stripe,
        invoice
      );
      const paymentSubjects = await recordAndRedactLateSubjects(
        userId,
        null,
        null,
        compactSubjects(
          payments.map((payment) =>
            buildStripeDeletionSubject(payment.kind, payment.providerId)
          )
        )
      );
      const lateSubjects = dedupeSubjects([
        ...initialSubjects,
        ...paymentSubjects,
      ]);
      if (subscriptionId) {
        await cancelDeletedSubscription(
          stripe,
          subscriptionId,
          deletedBillingIdempotencyKey(subscriptionId, "cancel")
        );
      }

      if (invoice.amount_paid > 0) {
        for (const payment of payments) {
          await refundDeletedPayment(stripe, payment);
        }
      }
      await cleanupDeletedCustomer(
        stripe,
        userId,
        customerId,
        lateSubjects.map(({ fingerprint }) => fingerprint)
      );
    } catch (error) {
      if (userId) await markLateStripeReconciliationFailed(userId);
      throw normalizeDeletedBillingError(
        error,
        "deleted_invoice_reconciliation_failed",
        "deleted_invoice_manual_reconciliation_required"
      );
    }
    return "deleted_invoice_reconciled";
  }

  throw deletedBillingError("deleted_billing_reconciliation_failed");
}

async function recordAndRedactLateSubjects(
  userId: string | null,
  subscriptionId: string | null,
  customerId: string | null,
  additionalSubjects: StripeDeletionSubject[] = []
) {
  const subjects = dedupeSubjects([
    ...buildStripeDeletionSubjects({
      subscriptionId,
      subscriptionCustomerId: customerId,
      mappedCustomerIds: [],
    }),
    ...additionalSubjects,
  ]);
  if (!userId) return subjects;
  let recorded = false;
  try {
    recorded = await recordLateStripeDeletionSubjects(userId, subjects);
    if (!recorded) return subjects;
    const request = await getAccountDeletionRequest(userId);
    if (request) await redactStripeEventLogs(request);
    return subjects;
  } catch (error) {
    if (recorded) await markLateStripeReconciliationFailed(userId);
    throw error;
  }
}

function compactSubjects(
  subjects: Array<StripeDeletionSubject | null>
): StripeDeletionSubject[] {
  return subjects.filter(
    (subject): subject is StripeDeletionSubject => subject !== null
  );
}

function dedupeSubjects(subjects: StripeDeletionSubject[]) {
  return [
    ...new Map(
      subjects.map((subject) => [subject.fingerprint, subject])
    ).values(),
  ];
}

async function cleanupDeletedCustomer(
  stripe: Stripe,
  userId: string | null,
  customerId: string | null,
  fingerprints: string[]
) {
  if (customerId) {
    try {
      await stripe.customers.del(
        customerId,
        {},
        {
          idempotencyKey: deletedBillingIdempotencyKey(customerId, "delete"),
        }
      );
    } catch (error) {
      if (!isAlreadyDeletedProviderError(error)) {
        throw deletedBillingError("deleted_customer_cleanup_failed");
      }
    }
  }
  if (userId) {
    await clearLateStripeDeletionSubjects(userId, fingerprints);
  }
}

async function cancelDeletedSubscription(
  stripe: Stripe,
  subscriptionId: string,
  idempotencyKey: string
) {
  try {
    await stripe.subscriptions.cancel(
      subscriptionId,
      { prorate: false },
      { idempotencyKey }
    );
  } catch (error) {
    if (!isAlreadyDeletedProviderError(error)) throw error;
  }
}

async function refundDeletedPayment(
  stripe: Stripe,
  payment: DeletedPaymentReference,
  idempotencyKey?: string
) {
  if (
    payment.allocationAmount !== undefined &&
    payment.allocationFingerprint !== undefined
  ) {
    await ensureStripeInvoicePaymentAllocationRefunded(stripe, {
      allocationAmount: payment.allocationAmount,
      allocationFingerprint: payment.allocationFingerprint,
      kind: payment.kind,
      providerId: payment.providerId,
      baseIdempotencyKey:
        idempotencyKey ??
        `account-deletion:invoice-payment-refund:${payment.allocationFingerprint}`,
    });
    return;
  }
  await ensureStripePaymentFullyRefunded(
    stripe,
    payment.kind,
    payment.providerId,
    idempotencyKey ?? deletedBillingIdempotencyKey(payment.providerId, "refund")
  );
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  return getProviderId(invoice.parent?.subscription_details?.subscription);
}

async function redactDeletedStripeEvent(event: Stripe.Event) {
  const subject = getStripeEventSubject(event);
  await db
    .update(stripeEventLog)
    .set({
      payload: "{}",
      lastError: null,
      subjectFingerprint: subject.fingerprint,
    })
    .where(eq(stripeEventLog.stripeEventId, event.id));
}

function isAccountDeletionPendingError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message === "account_deletion_pending" ||
      error.message === "credit_ledger_user_not_found" ||
      error.message === "billing_user_not_found")
  );
}

function safeStripeWebhookErrorCode(error: unknown) {
  if (isAccountDeletionPendingError(error)) return "account_deletion_pending";
  if (error && typeof error === "object" && "code" in error) {
    const reconciliationCode = checkoutReconciliationErrorCode(error);
    if (
      String(error.code).startsWith("deleted_checkout_") ||
      String(error.code).startsWith("deleted_subscription_") ||
      String(error.code).startsWith("deleted_invoice_") ||
      String(error.code) === "deleted_customer_cleanup_failed" ||
      String(error.code) === "deleted_billing_reconciliation_failed"
    ) {
      return reconciliationCode;
    }
  }
  return "stripe_webhook_processing_failed";
}

function isDeletedBillingReconciliationEvent(type: Stripe.Event.Type) {
  return (
    type === "checkout.session.completed" ||
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "invoice.payment_succeeded"
  );
}

function deletedBillingError(code: string): Error & { code: string } {
  return Object.assign(new Error("Deleted billing reconciliation failed"), {
    code,
  });
}

function normalizeDeletedBillingError(
  error: unknown,
  fallbackCode: string,
  manualCode?: string
) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code).startsWith("deleted_")
  ) {
    return error;
  }
  if (
    manualCode &&
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code).startsWith("stripe_invoice_payment_")
  ) {
    return deletedBillingError(manualCode);
  }
  return deletedBillingError(fallbackCode);
}

function getProviderId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getCheckoutCorrelation(
  event: Stripe.Event,
  metadataUserId: string | null
): StripeCheckoutCorrelation {
  if (event.type !== "checkout.session.completed") return "not_applicable";
  const session = event.data.object as Stripe.Checkout.Session;
  const correlatedUserId = checkoutSessionAuthenticatedUserId(session);
  if (!metadataUserId && !session.client_reference_id) return "not_applicable";
  if (!correlatedUserId) throw stripeSubjectOwnerMismatch();
  return "valid";
}

async function readBoundedStripeWebhookBody(
  req: NextRequest
): Promise<
  | { ok: true; value: string }
  | { ok: false; reason: "too_large" | "unreadable" }
> {
  if (!req.body) return { ok: true, value: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let resolveAbort!: () => void;
  const aborted = new Promise<{ aborted: true }>((resolve) => {
    resolveAbort = () => resolve({ aborted: true });
  });
  const onAbort = () => {
    resolveAbort();
    void reader.cancel().catch(() => undefined);
  };
  if (req.signal.aborted) onAbort();
  else req.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      const next = await Promise.race([
        reader.read().then((result) => ({ aborted: false as const, result })),
        aborted,
      ]);
      if (next.aborted) return { ok: false, reason: "unreadable" };
      const { done, value } = next.result;
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_STRIPE_WEBHOOK_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size verdict is final; cancellation is best-effort.
        }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: new TextDecoder().decode(body) };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    req.signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function stripeWebhookErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "stripe_webhook_processing_failed";
  const code = error.message.split(":", 1)[0];
  return /^(billing_|credit_|stripe_)[a-z0-9_]+$/.test(code)
    ? code
    : "stripe_webhook_processing_failed";
}

function stripeEventCreatedAt(event: Stripe.Event) {
  const value = new Date(event.created * 1000);
  if (!Number.isFinite(value.getTime())) {
    throw new Error("stripe_event_timestamp_invalid");
  }
  return value;
}
