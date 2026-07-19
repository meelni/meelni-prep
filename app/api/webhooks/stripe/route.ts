import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { db } from "@/lib/db";
import {
  stripeEventLog,
  subscription,
  paymentHistory,
  stripeCustomerMapping,
} from "@/lib/db/schema";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import {
  createCreditLedgerService,
  emitSubscriptionRenewalPostCommitEffects,
  type SubscriptionRenewalPostCommitEffects,
} from "@/lib/billing/credits";
import {
  createDrizzleCreditLedgerStore,
  createDrizzleCreditLedgerStoreForLockedTransaction,
} from "@/lib/billing/credit-ledger-store";
import {
  monotonicStripeEventTimestamp,
  shouldApplyStripeSubscriptionState,
} from "@/lib/billing/stripe-event-ordering";
import { applyCurrentSubscriptionInvoice } from "@/lib/billing/subscription-invoice";
import {
  claimStripeCustomerOwnership,
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
  isCanonicalAccountUserId,
  reconcileDeletedCheckoutSession,
  stripeEventMetadataUserId,
} from "@/lib/billing/account-deletion-guard";
import { isAlreadyDeletedProviderError } from "@/lib/workflows/delete-account";
import {
  getBillingDatabaseTime,
  lockBillingUserUnlessDeleting,
  reconcileAuthoritativeProviderSnapshot,
  retrieveAuthoritativeSubscription,
  shouldApplyAuthoritativeProviderSnapshot,
} from "@/lib/billing/subscription-state";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
  getStripePriceIdForCatalogId,
} from "@/lib/billing/stripe-catalog";
import {
  getStripeInvoiceSubscriptionId,
  loadCompleteStripeInvoiceLines,
  selectPaidSubscriptionServicePeriod,
  selectUniqueSupportedStripeInvoicePriceId,
} from "@/lib/billing/stripe-invoice-service-period";
import {
  deriveInvoiceFirstSubscriptionBootstrap,
  type InvoiceFirstSubscriptionBootstrap,
} from "@/lib/billing/stripe-invoice-first-subscription";
import {
  fulfillInterviewPassCheckout,
  isCheckoutFulfillmentError,
  isCheckoutPaymentEventType,
} from "@/lib/billing/stripe-checkout-fulfillment";
import {
  findAuthoritativeSubscriptionCheckoutSession,
  findSubscriptionCheckoutSessionForInvoice,
  retrieveAuthoritativeCheckoutSession,
} from "@/lib/billing/stripe-checkout-session";
import { reconcileStripeBillingAdjustment } from "@/lib/billing/stripe-billing-adjustment";
import { normalizeStripeBillingAdjustmentEvent } from "@/lib/billing/stripe-adjustment-events";
import { getStripeLogicalEventKey } from "@/lib/billing/stripe-event-identity";
import {
  mayApplyStripeSubscriptionResource,
  stripeSubscriptionCursorMayApply,
  stripeSubscriptionEventCursor,
  type StripeSubscriptionResourceProof,
  type StripeSubscriptionEventCursor,
} from "@/lib/billing/stripe-subscription-event-order";

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
      reportOperationalFailure({
        operation: "stripe_webhook",
        errorCode: "stripe_signature_invalid",
        severity: "warning",
        retryable: false,
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const subject = getStripeEventSubject(event);
    const logicalEventKey = getStripeLogicalEventKey(event);
    const metadataUserId = stripeEventMetadataUserId(event);
    const checkoutCorrelation = getCheckoutCorrelation(event, metadataUserId);
    const eventUserId = isCheckoutPaymentEventType(event.type)
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
        case "checkout.session.async_payment_succeeded":
        case "checkout.session.async_payment_failed":
          await handleCheckoutPayment(event, stripe);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpdate(event, stripe);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event);
          break;

        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event, stripe);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event, stripe);
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
          break;
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
    reportOperationalFailure({
      operation: "stripe_webhook",
      errorCode: "stripe_webhook_failed",
      severity: "critical",
      retryable: true,
    });
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
async function handleSubscriptionUpdate(event: Stripe.Event, stripe: Stripe) {
  const eventSubscription = event.data.object as Stripe.Subscription;
  const userId = await getUserIdFromStripe(
    eventSubscription.customer as string,
    eventSubscription.metadata.userId
  );
  const eventTimestamp = new Date(event.created * 1000);
  const eventCursor = stripeSubscriptionEventCursor(event);
  await reconcileAuthoritativeProviderSnapshot({
    readVersion: async () => {
      const [current] = await db
        .select({ version: subscription.version })
        .from(subscription)
        .where(eq(subscription.userId, userId))
        .limit(1);
      return current?.version ?? null;
    },
    retrieve: () =>
      retrieveAuthoritativeSubscription(
        stripe.subscriptions,
        eventSubscription.id
      ),
    commit: async ({ expectedVersion, snapshot: stripeSubscription }) => {
      const snapshotUserId = await getUserIdFromStripe(
        stripeSubscription.customer as string,
        stripeSubscription.metadata.userId
      );
      if (snapshotUserId !== userId) {
        throw new Error("billing_subscription_snapshot_owner_mismatch");
      }

      return db.transaction(async (tx) => {
        await lockBillingUserUnlessDeleting(tx, userId);
        const [currentSub] = await tx
          .select()
          .from(subscription)
          .where(eq(subscription.userId, userId))
          .limit(1)
          .for("update");
        if ((currentSub?.version ?? null) !== expectedVersion) return "retry";

        const incomingStatus = mapStripeStatus(stripeSubscription.status);
        const currentResourceId = currentSub?.stripeSubscriptionId ?? null;
        const candidateResourceProof = subscriptionResourceProofFromEvent(
          stripeSubscription,
          eventCursor,
          event.type
        );
        if (
          !mayApplyStripeSubscriptionResource({
            currentResourceId,
            currentStatus: currentSub?.status ?? null,
            currentResourceProof: subscriptionResourceProofFromRow(currentSub),
            retiredResourceIds: currentSub?.retiredStripeSubscriptionIds ?? [],
            candidateResourceId: stripeSubscription.id,
            candidateResourceProof,
            eventType: event.type,
          }) ||
          !stripeSubscriptionCursorMayApply({
            currentResourceId,
            candidateResourceId: stripeSubscription.id,
            currentCursor: subscriptionEventCursorFromRow(currentSub),
            candidateCursor: eventCursor,
          })
        ) {
          return "skipped";
        }
        if (
          currentResourceId === stripeSubscription.id &&
          !shouldApplyAuthoritativeProviderSnapshot({
            current: currentSub ?? null,
            incomingStatus,
            incomingStripeSubscriptionId: stripeSubscription.id,
            triggeringEvent:
              event.type === "customer.subscription.created"
                ? "subscription_created"
                : "subscription_updated",
            eventTimestamp,
          })
        ) {
          return "skipped";
        }

        const observedAt = await getBillingDatabaseTime(tx);
        const catalogId = getStripeCatalogIdForPrice(
          stripeSubscription.items.data[0]?.price.id
        );
        const firstItem = stripeSubscription.items.data[0];
        const replacingResource = Boolean(
          currentResourceId && currentResourceId !== stripeSubscription.id
        );
        const lastEventTimestamp =
          currentSub?.lastEventTimestamp &&
          currentSub.lastEventTimestamp > eventTimestamp
            ? currentSub.lastEventTimestamp
            : eventTimestamp;
        const trialUpdates =
          catalogId === "pro" &&
          (stripeSubscription.status === "trialing" ||
            Boolean(
              stripeSubscription.trial_end &&
                new Date(stripeSubscription.trial_end * 1000) < observedAt
            ))
            ? { proTrialUsed: true }
            : {};
        const nextSubscriptionData = {
          userId,
          tier: catalogId,
          status: incomingStatus,
          billingCycle:
            firstItem?.price.recurring?.interval === "month"
              ? ("monthly" as const)
              : ("annual" as const),
          stripeCustomerId: stripeSubscription.customer as string,
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: firstItem?.price.id,
          stripeResourceCreatedAt: candidateResourceProof.resourceCreatedAt,
          stripeResourceCreatedEventTimestamp:
            candidateResourceProof.createdEventCursor?.createdAt ??
            currentSub?.stripeResourceCreatedEventTimestamp ??
            null,
          stripeResourceCreatedEventId:
            candidateResourceProof.createdEventCursor?.eventId ??
            currentSub?.stripeResourceCreatedEventId ??
            null,
          retiredStripeSubscriptionIds:
            replacingResource && currentResourceId
              ? sql`array_append(${subscription.retiredStripeSubscriptionIds}, ${currentResourceId})`
              : (currentSub?.retiredStripeSubscriptionIds ?? []),
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
          lastEventTimestamp,
          lastEventPriority: eventCursor.priority,
          lastEventId: eventCursor.eventId,
          updatedAt: observedAt,
          version: (currentSub?.version ?? 0) + 1,
          ...trialUpdates,
        };

        if (!currentSub) {
          await tx.insert(subscription).values(nextSubscriptionData);
        } else {
          const updated = await tx
            .update(subscription)
            .set(nextSubscriptionData)
            .where(
              and(
                eq(subscription.userId, userId),
                eq(subscription.version, currentSub.version)
              )
            )
            .returning({ id: subscription.id });
          if (updated.length !== 1) return "retry";
        }

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
              updatedAt: observedAt,
            },
          });
        return "applied";
      });
    },
  });
}

/**
 * Reconcile signed Checkout payment events against current provider truth.
 */
async function handleCheckoutPayment(
  event: Stripe.Event,
  stripe: Stripe
): Promise<"processed" | "deleted_checkout_reconciled"> {
  if (!isCheckoutPaymentEventType(event.type)) return "processed";
  const signedSession = event.data.object as Stripe.Checkout.Session;
  // Subscription state and renewal credits remain owned by subscription and
  // invoice handlers. Signed Checkout events only trigger one-time fulfillment.
  if (signedSession.mode !== "payment") return "processed";
  const ledger = createCreditLedgerService({
    store: createDrizzleCreditLedgerStore(),
  });

  try {
    const result = await fulfillInterviewPassCheckout(
      {
        eventType: event.type,
        sessionId: signedSession.id,
        expectedPriceId: getStripePriceIdForCatalogId("interview_pass"),
      },
      {
        retrieveSession: (sessionId) =>
          retrieveAuthoritativeCheckoutSession(stripe, sessionId),
        claimCustomerOwnership: ({ customerId, userId }) =>
          claimStripeCustomerOwnership({ customerId, userId }),
        hasDeletionTombstone: hasAccountDeletionTombstone,
        grantInterviewPass: async (input) => {
          const { grant } = await ledger.grantCredits(input);
          return { grantId: grant.id };
        },
      }
    );

    if (result.status === "account_deletion_pending") {
      await redactDeletedStripeEvent(event);
      if (isCheckoutSettlementEvent(event.type)) {
        await reconcileCheckoutForDeletedAccount(
          signedSession,
          stripe,
          result.userId
        );
        return "deleted_checkout_reconciled";
      }
      return "processed";
    }

    if (result.status === "payment_failed") {
      await persistFailedCheckoutPayment(event, result);
      return "processed";
    }
    if (result.status !== "fulfilled") return "processed";

    await persistSucceededCheckoutPayment(event, result);
  } catch (error) {
    if (!isAccountDeletionPendingError(error)) throw error;
    await redactDeletedStripeEvent(event);
    if (isCheckoutSettlementEvent(event.type)) {
      await reconcileCheckoutForDeletedAccount(
        signedSession,
        stripe,
        checkoutSessionAuthenticatedUserId(signedSession)
      );
      return "deleted_checkout_reconciled";
    }
  }
  return "processed";
}

async function persistFailedCheckoutPayment(
  event: Stripe.Event,
  result: {
    sessionId: string;
    userId: string;
    amountInCents: number;
    currency: "usd";
  }
) {
  await db
    .insert(paymentHistory)
    .values({
      userId: result.userId,
      stripePaymentIntentId: null,
      stripeCheckoutSessionId: result.sessionId,
      stripeEventId: event.id,
      creditGrantId: null,
      catalogId: "interview_pass",
      amountInCents: result.amountInCents,
      currency: result.currency,
      status: "failed",
      tier: "interview_pass",
      failureReason: "payment_failed",
      createdAt: stripeEventCreatedAt(event),
    })
    .onConflictDoNothing({
      target: paymentHistory.stripeCheckoutSessionId,
    });
  const persisted = await db
    .select()
    .from(paymentHistory)
    .where(eq(paymentHistory.stripeCheckoutSessionId, result.sessionId))
    .limit(1);
  assertPersistedFailedCheckoutPayment(persisted[0], {
    userId: result.userId,
    catalogId: "interview_pass",
    amountInCents: result.amountInCents,
    currency: result.currency,
  });
}

async function persistSucceededCheckoutPayment(
  event: Stripe.Event,
  result: {
    sessionId: string;
    userId: string;
    paymentIntentId: string;
    grantId: string;
    amountInCents: number;
    currency: "usd";
  }
) {
  const succeeded = {
    userId: result.userId,
    stripePaymentIntentId: result.paymentIntentId,
    stripeCheckoutSessionId: result.sessionId,
    stripeEventId: event.id,
    creditGrantId: result.grantId,
    catalogId: "interview_pass" as const,
    amountInCents: result.amountInCents,
    currency: result.currency,
    status: "succeeded" as const,
    tier: "interview_pass" as const,
    failureReason: null,
  };
  await db
    .insert(paymentHistory)
    .values(succeeded)
    .onConflictDoUpdate({
      target: paymentHistory.stripeCheckoutSessionId,
      set: succeeded,
      setWhere: and(
        eq(paymentHistory.status, "failed"),
        eq(paymentHistory.userId, result.userId),
        eq(paymentHistory.catalogId, "interview_pass"),
        eq(paymentHistory.amountInCents, result.amountInCents),
        eq(paymentHistory.currency, result.currency),
        isNull(paymentHistory.stripePaymentIntentId),
        isNull(paymentHistory.creditGrantId)
      ),
    });
  const persisted = await db
    .select()
    .from(paymentHistory)
    .where(eq(paymentHistory.stripeCheckoutSessionId, result.sessionId))
    .limit(1);
  assertPersistedCheckoutPayment(persisted[0], {
    userId: result.userId,
    stripePaymentIntentId: result.paymentIntentId,
    creditGrantId: result.grantId,
    catalogId: "interview_pass",
    amountInCents: result.amountInCents,
    currency: result.currency,
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
async function handlePaymentSucceeded(event: Stripe.Event, stripe: Stripe) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = getStripeCustomerId(invoice.customer);
  const recurringPriceIds = [
    getStripePriceIdForCatalogId("starter"),
    getStripePriceIdForCatalogId("pro"),
  ] as const;
  const entitlementInvoice = isSubscriptionRenewalBillingReason(
    invoice.billing_reason
  );
  const invoiceLines = entitlementInvoice
    ? await loadCompleteStripeInvoiceLines(stripe, invoice)
    : invoice.lines.data;
  const paidServicePeriod = entitlementInvoice
    ? selectPaidSubscriptionServicePeriod(
        invoice,
        recurringPriceIds,
        invoiceLines
      )
    : null;
  if (entitlementInvoice && !paidServicePeriod) {
    throw new Error("stripe_invoice_service_period_invalid");
  }
  const paymentPriceId =
    paidServicePeriod?.priceId ??
    selectUniqueSupportedStripeInvoicePriceId(invoiceLines, recurringPriceIds);
  const catalogId = paymentPriceId
    ? getStripeCatalogIdForPrice(paymentPriceId)
    : null;
  const invoiceSubscriptionId = getStripeInvoiceSubscriptionId(invoice);
  let bootstrap: InvoiceFirstSubscriptionBootstrap | null = null;
  if (invoice.billing_reason === "subscription_create") {
    if (
      !paidServicePeriod ||
      !invoiceSubscriptionId ||
      invoice.currency !== "usd" ||
      !Number.isSafeInteger(invoice.amount_paid) ||
      invoice.amount_paid < 0
    ) {
      throw new Error("stripe_invoice_subscription_bootstrap_evidence_invalid");
    }
    bootstrap = deriveInvoiceFirstSubscriptionBootstrap({
      invoice,
      paidServicePeriod,
      supportedPrices: new Map([
        [recurringPriceIds[0], "starter"],
        [recurringPriceIds[1], "pro"],
      ]),
      subscription: await retrieveAuthoritativeSubscription(
        stripe.subscriptions,
        invoiceSubscriptionId
      ),
      subscriptionId: invoiceSubscriptionId,
    });
    if (
      catalogId !== bootstrap.catalogId ||
      customerId !== bootstrap.customerId
    ) {
      throw new Error("stripe_invoice_subscription_bootstrap_evidence_invalid");
    }
  }
  const ownerHint = bootstrap?.userId ?? invoice.metadata?.userId;
  const userId = customerId
    ? await getUserIdFromStripe(customerId, ownerHint)
    : ownerHint;
  if (!userId) {
    if (entitlementInvoice) {
      throw new Error("stripe_customer_owner_not_found");
    }
    reportOperationalFailure({
      operation: "stripe_webhook",
      errorCode: "stripe_owner_metadata_missing",
      severity: "warning",
      retryable: true,
    });
    return;
  }
  if (bootstrap && bootstrap.userId !== userId) {
    throw stripeSubjectOwnerMismatch();
  }

  const bootstrapCheckoutSession = bootstrap
    ? await findAuthoritativeSubscriptionCheckoutSession(stripe, {
        subscriptionId: bootstrap.subscriptionId,
        invoiceId: invoice.id,
        customerId: bootstrap.customerId,
        userId,
        catalogId: bootstrap.catalogId,
        expectedPriceId: bootstrap.priceId,
      })
    : null;

  const invoicePayment = await getInvoicePaymentCorrelation(invoice);
  const eventTimestamp = new Date(event.created * 1000);
  const invoiceCursor = stripeSubscriptionEventCursor(event);
  const invoicePeriodStart =
    paidServicePeriod?.periodStart ?? providerTimestamp(invoice.period_start);
  const invoicePeriodEnd =
    paidServicePeriod?.periodEnd ?? providerTimestamp(invoice.period_end);
  let postCommitEffects: SubscriptionRenewalPostCommitEffects | null = null;
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    let bootstrapExistingPayment: PersistedPayment | null = null;
    if (bootstrapCheckoutSession) {
      const invoicePayments = await tx
        .select()
        .from(paymentHistory)
        .where(eq(paymentHistory.stripeInvoiceId, invoice.id))
        .limit(3)
        .for("update");
      bootstrapExistingPayment = validateSubscriptionCreateInvoicePayment(
        invoicePayments,
        {
          userId,
          invoiceId: invoice.id,
          checkoutSessionId: bootstrapCheckoutSession.id,
          catalogId: bootstrap!.catalogId,
          amountInCents: invoice.amount_paid,
          currency: invoice.currency,
        }
      );
    }
    let [currentSub] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1)
      .for("update");
    const observedAt = await getBillingDatabaseTime(tx);

    if (bootstrap) {
      if (
        currentSub &&
        !currentSub.stripeSubscriptionId &&
        currentSub.status !== "canceled"
      ) {
        throw new Error("billing_subscription_unscoped_state_conflict");
      }
      const [mappingBefore] = await tx
        .select()
        .from(stripeCustomerMapping)
        .where(eq(stripeCustomerMapping.stripeCustomerId, bootstrap.customerId))
        .limit(1)
        .for("update");
      if (
        mappingBefore &&
        (mappingBefore.userId !== userId ||
          (mappingBefore.stripeSubscriptionId &&
            mappingBefore.stripeSubscriptionId !== bootstrap.subscriptionId))
      ) {
        throw new Error("billing_subscription_mapping_conflict");
      }
      if (!mappingBefore) {
        await tx
          .insert(stripeCustomerMapping)
          .values({
            stripeCustomerId: bootstrap.customerId,
            stripeSubscriptionId: bootstrap.subscriptionId,
            userId,
          })
          .onConflictDoNothing({
            target: stripeCustomerMapping.stripeCustomerId,
          });
      } else if (!mappingBefore.stripeSubscriptionId) {
        await tx
          .update(stripeCustomerMapping)
          .set({
            stripeSubscriptionId: bootstrap.subscriptionId,
            updatedAt: observedAt,
          })
          .where(
            and(
              eq(stripeCustomerMapping.stripeCustomerId, bootstrap.customerId),
              eq(stripeCustomerMapping.userId, userId)
            )
          );
      }
      const [mappingAfter] = await tx
        .select()
        .from(stripeCustomerMapping)
        .where(eq(stripeCustomerMapping.stripeCustomerId, bootstrap.customerId))
        .limit(1)
        .for("update");
      if (
        !mappingAfter ||
        mappingAfter.userId !== userId ||
        mappingAfter.stripeSubscriptionId !== bootstrap.subscriptionId
      ) {
        throw new Error("billing_subscription_mapping_conflict");
      }

      if (
        currentSub?.stripeSubscriptionId &&
        currentSub.stripeSubscriptionId !== bootstrap.subscriptionId
      ) {
        throw new Error("billing_subscription_resource_conflict");
      }
      if (
        currentSub?.stripeCustomerId &&
        currentSub.stripeCustomerId !== bootstrap.customerId
      ) {
        throw new Error("billing_subscription_customer_conflict");
      }
      if (
        currentSub?.stripePriceId &&
        currentSub.stripePriceId !== bootstrap.priceId
      ) {
        throw new Error("billing_subscription_price_conflict");
      }

      if (
        currentSub?.stripeSubscriptionId === bootstrap.subscriptionId &&
        (currentSub.status === "canceled" ||
          currentSub.tier !== bootstrap.catalogId ||
          currentSub.stripeCustomerId !== bootstrap.customerId ||
          currentSub.stripePriceId !== bootstrap.priceId ||
          currentSub.currentPeriodStart?.getTime() !==
            bootstrap.currentPeriodStart.getTime() ||
          currentSub.currentPeriodEnd?.getTime() !==
            bootstrap.currentPeriodEnd.getTime())
      ) {
        throw new Error("billing_subscription_bootstrap_conflict");
      }

      if (!currentSub?.stripeSubscriptionId) {
        const bootstrapState = {
          tier: bootstrap.catalogId,
          status: bootstrap.status,
          billingCycle: bootstrap.billingCycle,
          stripeCustomerId: bootstrap.customerId,
          stripeSubscriptionId: bootstrap.subscriptionId,
          stripePriceId: bootstrap.priceId,
          stripeResourceCreatedAt: bootstrap.resourceCreatedAt,
          stripeResourceCreatedEventTimestamp: null,
          stripeResourceCreatedEventId: null,
          currentPeriodStart: bootstrap.currentPeriodStart,
          currentPeriodEnd: bootstrap.currentPeriodEnd,
          trialEnd: bootstrap.trialEnd,
          canceledAt: bootstrap.canceledAt,
          cancelAtPeriodEnd: bootstrap.cancelAtPeriodEnd,
          lastEventTimestamp: invoiceCursor.createdAt,
          lastEventPriority: invoiceCursor.priority,
          lastEventId: invoiceCursor.eventId,
          updatedAt: observedAt,
        };
        if (!currentSub) {
          await tx.insert(subscription).values({ userId, ...bootstrapState });
        } else {
          const updated = await tx
            .update(subscription)
            .set({ ...bootstrapState, version: currentSub.version + 1 })
            .where(
              and(
                eq(subscription.userId, userId),
                eq(subscription.version, currentSub.version)
              )
            )
            .returning({ id: subscription.id });
          if (updated.length !== 1) {
            throw new Error("billing_subscription_version_conflict");
          }
        }
        [currentSub] = await tx
          .select()
          .from(subscription)
          .where(eq(subscription.userId, userId))
          .limit(1)
          .for("update");
        if (
          !currentSub ||
          currentSub.stripeSubscriptionId !== bootstrap.subscriptionId ||
          currentSub.stripeCustomerId !== bootstrap.customerId ||
          currentSub.stripePriceId !== bootstrap.priceId
        ) {
          throw new Error("billing_subscription_bootstrap_conflict");
        }
      }
    }

    let cycleDisposition: "current" | "retired" | null = null;
    if (invoice.billing_reason === "subscription_cycle") {
      if (!currentSub) {
        throw new Error("billing_subscription_state_missing");
      }
      if (!currentSub.stripeSubscriptionId) {
        throw new Error("billing_subscription_unscoped_state_conflict");
      }
      if (currentSub.stripeSubscriptionId === invoiceSubscriptionId) {
        if (
          !customerId ||
          currentSub.stripeCustomerId !== customerId ||
          !paymentPriceId ||
          currentSub.stripePriceId !== paymentPriceId ||
          !catalogId ||
          currentSub.tier !== catalogId
        ) {
          throw new Error("billing_subscription_cycle_binding_conflict");
        }
        cycleDisposition = "current";
      } else if (
        invoiceSubscriptionId &&
        currentSub.retiredStripeSubscriptionIds.includes(invoiceSubscriptionId)
      ) {
        cycleDisposition = "retired";
      } else {
        throw new Error("billing_subscription_resource_conflict");
      }
    }

    let creditGrantId: string | null = null;
    const result =
      paidServicePeriod && catalogId
        ? await applyCurrentSubscriptionInvoice({
            current: currentSub ?? null,
            incomingStripeSubscriptionId: invoiceSubscriptionId,
            eventTimestamp,
            billingReason: invoice.billing_reason,
            invoicePeriodStart,
            invoicePeriodEnd,
            invoiceId: invoice.id,
            catalogId,
            userId,
            ledger: createCreditLedgerService({
              store: createDrizzleCreditLedgerStoreForLockedTransaction(
                tx,
                userId
              ),
              now: () => observedAt,
            }),
            onCreditGrant: (grantId) => {
              creditGrantId = grantId;
            },
            applySubscriptionState: async () => {
              // Older invoice events remain recorded in payment history but
              // cannot reach this state or entitlement mutation.
              const updated = await tx
                .update(subscription)
                .set({
                  status: "active",
                  gracePeriodEnd: null,
                  lastEventTimestamp: monotonicStripeEventTimestamp(
                    currentSub!.lastEventTimestamp,
                    eventTimestamp
                  ),
                  currentPeriodStart: invoicePeriodStart,
                  currentPeriodEnd: invoicePeriodEnd,
                  version: currentSub!.version + 1,
                  updatedAt: observedAt,
                })
                .where(
                  and(
                    eq(subscription.userId, userId),
                    eq(subscription.version, currentSub!.version)
                  )
                )
                .returning({ id: subscription.id });
              if (updated.length !== 1) {
                throw new Error("billing_subscription_version_conflict");
              }
            },
          })
        : { status: "skipped" as const, postCommitEffects: null };
    if (bootstrap && result.status !== "applied") {
      throw new Error("billing_subscription_create_entitlement_not_applied");
    }
    if (
      cycleDisposition === "current" &&
      result.status !== "applied" &&
      currentSub!.status !== "canceled" &&
      !isHistoricalSubscriptionCycle(
        currentSub!,
        invoicePeriodStart,
        invoicePeriodEnd
      )
    ) {
      throw new Error("billing_subscription_cycle_entitlement_not_applied");
    }
    if (cycleDisposition === "retired" && result.status !== "skipped") {
      throw new Error("billing_subscription_retired_invoice_applied");
    }
    // Provider correlation is resolved before the transaction; payment truth,
    // entitlement truth, and subscription state commit atomically here.
    const succeededPayment = {
      userId,
      stripePaymentIntentId: invoicePayment.paymentIntentId,
      stripeInvoiceId: invoice.id,
      stripeCheckoutSessionId: bootstrapCheckoutSession?.id ?? null,
      stripeChargeId: invoicePayment.chargeId,
      stripeEventId: event.id,
      creditGrantId,
      catalogId,
      amountInCents: invoice.amount_paid,
      currency: invoice.currency,
      status: "succeeded",
      tier: catalogId,
      periodStart: invoicePeriodStart,
      periodEnd: invoicePeriodEnd,
      receiptUrl: invoice.hosted_invoice_url,
      failureReason: null,
    };
    let persisted: PersistedPayment[];
    if (bootstrapCheckoutSession && bootstrapExistingPayment) {
      if (bootstrapExistingPayment.status === "failed") {
        persisted = await tx
          .update(paymentHistory)
          .set(succeededPayment)
          .where(
            and(
              eq(paymentHistory.id, bootstrapExistingPayment.id),
              eq(paymentHistory.userId, userId),
              eq(paymentHistory.stripeInvoiceId, invoice.id),
              eq(paymentHistory.status, "failed"),
              or(
                isNull(paymentHistory.stripeCheckoutSessionId),
                eq(
                  paymentHistory.stripeCheckoutSessionId,
                  bootstrapCheckoutSession.id
                )
              ),
              eq(paymentHistory.catalogId, bootstrap!.catalogId),
              eq(paymentHistory.amountInCents, invoice.amount_paid),
              eq(paymentHistory.currency, invoice.currency),
              isNull(paymentHistory.stripePaymentIntentId),
              isNull(paymentHistory.stripeChargeId),
              isNull(paymentHistory.creditGrantId)
            )
          )
          .returning();
        if (persisted.length !== 1) {
          throw new Error("billing_payment_persistence_conflict");
        }
      } else {
        let retained = bootstrapExistingPayment;
        if (retained.stripeCheckoutSessionId === null) {
          const correlated = await tx
            .update(paymentHistory)
            .set({ stripeCheckoutSessionId: bootstrapCheckoutSession.id })
            .where(
              and(
                eq(paymentHistory.id, retained.id),
                eq(paymentHistory.userId, userId),
                eq(paymentHistory.stripeInvoiceId, invoice.id),
                eq(paymentHistory.status, retained.status),
                isNull(paymentHistory.stripeCheckoutSessionId),
                eq(paymentHistory.catalogId, bootstrap!.catalogId),
                eq(paymentHistory.amountInCents, invoice.amount_paid),
                eq(paymentHistory.currency, invoice.currency)
              )
            )
            .returning();
          if (correlated.length !== 1) {
            throw new Error("billing_payment_persistence_conflict");
          }
          retained = correlated[0]!;
        }
        assertPersistedPayment(retained, {
          userId,
          stripePaymentIntentId: invoicePayment.paymentIntentId,
          stripeCheckoutSessionId: bootstrapCheckoutSession.id,
          stripeChargeId: invoicePayment.chargeId,
          creditGrantId,
          catalogId,
          amountInCents: invoice.amount_paid,
          currency: invoice.currency,
        });
        if (
          retained.status !== "succeeded" &&
          !SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(retained.status)
        ) {
          throw new Error("billing_payment_truth_mismatch:status");
        }
        persisted = [retained];
      }
    } else {
      const succeededInsert = tx
        .insert(paymentHistory)
        .values(succeededPayment);
      if (bootstrapCheckoutSession) {
        await succeededInsert.onConflictDoUpdate({
          target: paymentHistory.stripeCheckoutSessionId,
          set: succeededPayment,
          setWhere: and(
            eq(paymentHistory.status, "failed"),
            eq(paymentHistory.userId, userId),
            eq(paymentHistory.stripeInvoiceId, invoice.id),
            eq(
              paymentHistory.stripeCheckoutSessionId,
              bootstrapCheckoutSession.id
            ),
            eq(paymentHistory.catalogId, bootstrap!.catalogId),
            eq(paymentHistory.amountInCents, invoice.amount_paid),
            eq(paymentHistory.currency, invoice.currency),
            isNull(paymentHistory.stripePaymentIntentId),
            isNull(paymentHistory.stripeChargeId),
            isNull(paymentHistory.creditGrantId)
          ),
        });
      } else {
        await succeededInsert.onConflictDoNothing();
      }
      persisted = await tx
        .select()
        .from(paymentHistory)
        .where(
          and(
            eq(paymentHistory.stripeInvoiceId, invoice.id),
            eq(paymentHistory.status, "succeeded")
          )
        )
        .limit(1);
    }
    if (
      !SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(persisted[0]?.status ?? "")
    ) {
      assertPersistedPayment(persisted[0], {
        userId,
        stripePaymentIntentId: invoicePayment.paymentIntentId,
        stripeCheckoutSessionId: bootstrapCheckoutSession?.id ?? null,
        stripeChargeId: invoicePayment.chargeId,
        creditGrantId,
        catalogId,
        amountInCents: invoice.amount_paid,
        currency: invoice.currency,
        status: "succeeded",
      });
    }
    postCommitEffects = result.postCommitEffects;
  });
  if (postCommitEffects) {
    emitSubscriptionRenewalPostCommitEffects(postCommitEffects);
  }
}

/**
 * Handle invoice.payment_failed event
 *
 * Phase 0.5B: Implements 7-day grace period for failed payments
 */
async function handlePaymentFailed(event: Stripe.Event, stripe: Stripe) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = getStripeCustomerId(invoice.customer);
  const recurringPrices = new Map([
    [getStripePriceIdForCatalogId("starter"), "starter" as const],
    [getStripePriceIdForCatalogId("pro"), "pro" as const],
  ]);
  const invoiceSubscriptionId = getStripeInvoiceSubscriptionId(invoice);
  let checkoutCorrelation: Awaited<
    ReturnType<typeof findSubscriptionCheckoutSessionForInvoice>
  > | null = null;
  if (invoice.billing_reason === "subscription_create") {
    if (!customerId || !invoiceSubscriptionId) {
      throw new Error("stripe_invoice_subscription_bootstrap_evidence_invalid");
    }
    checkoutCorrelation = await findSubscriptionCheckoutSessionForInvoice(
      stripe,
      {
        subscriptionId: invoiceSubscriptionId,
        invoiceId: invoice.id,
        customerId,
        supportedPrices: recurringPrices,
      }
    );
    const invoicePriceId = selectUniqueSupportedStripeInvoicePriceId(
      await loadCompleteStripeInvoiceLines(stripe, invoice),
      [...recurringPrices.keys()]
    );
    if (
      !invoicePriceId ||
      invoice.currency !== "usd" ||
      !Number.isSafeInteger(invoice.amount_due) ||
      invoice.amount_due < 0 ||
      checkoutCorrelation.priceId !== invoicePriceId ||
      checkoutCorrelation.catalogId !== recurringPrices.get(invoicePriceId)
    ) {
      throw new Error("stripe_invoice_subscription_bootstrap_evidence_invalid");
    }
  }
  const ownerHint = checkoutCorrelation?.userId ?? invoice.metadata?.userId;
  const userId = customerId
    ? await getUserIdFromStripe(customerId, ownerHint)
    : ownerHint;

  if (!userId) {
    reportOperationalFailure({
      operation: "stripe_webhook",
      errorCode: "stripe_owner_metadata_missing",
      severity: "warning",
      retryable: true,
    });
    return;
  }
  if (checkoutCorrelation && checkoutCorrelation.userId !== userId) {
    throw stripeSubjectOwnerMismatch();
  }

  if (checkoutCorrelation && checkoutCorrelation.paymentStatus !== "unpaid") {
    if (checkoutCorrelation.paymentStatus !== "paid") {
      throw new Error("stripe_subscription_checkout_session_invalid");
    }
  }

  // Set a 7-day grace period without persisting raw provider errors.
  const eventTimestamp = new Date(event.created * 1000);
  await db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, userId);
    const failedPayment = {
      userId,
      stripePaymentIntentId: null,
      stripeInvoiceId: invoice.id,
      stripeCheckoutSessionId: checkoutCorrelation?.id ?? null,
      stripeChargeId: null,
      stripeEventId: event.id,
      creditGrantId: null,
      catalogId:
        checkoutCorrelation?.catalogId ??
        getStripeCatalogIdForPrice(getInvoicePriceId(invoice)),
      amountInCents: invoice.amount_due,
      currency: invoice.currency,
      status: "failed",
      tier:
        checkoutCorrelation?.catalogId ??
        getStripeCatalogIdForPrice(getInvoicePriceId(invoice)),
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000)
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000)
        : null,
      failureReason: "payment_failed",
      createdAt: stripeEventCreatedAt(event),
    };
    let persisted: PersistedPayment[] = [];
    const invoicePayments = await tx
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.stripeInvoiceId, invoice.id))
      .limit(3)
      .for("update");
    if (checkoutCorrelation) {
      let existing = validateSubscriptionCreateInvoicePayment(invoicePayments, {
        userId,
        invoiceId: invoice.id,
        checkoutSessionId: checkoutCorrelation.id,
        catalogId: checkoutCorrelation.catalogId,
        amountInCents: invoice.amount_due,
        currency: invoice.currency,
      });
      if (existing?.stripeCheckoutSessionId === null) {
        const correlated = await tx
          .update(paymentHistory)
          .set({ stripeCheckoutSessionId: checkoutCorrelation.id })
          .where(
            and(
              eq(paymentHistory.id, existing.id),
              eq(paymentHistory.userId, userId),
              eq(paymentHistory.stripeInvoiceId, invoice.id),
              eq(paymentHistory.status, existing.status),
              isNull(paymentHistory.stripeCheckoutSessionId),
              eq(paymentHistory.catalogId, checkoutCorrelation.catalogId),
              eq(paymentHistory.amountInCents, invoice.amount_due),
              eq(paymentHistory.currency, invoice.currency)
            )
          )
          .returning();
        if (correlated.length !== 1) {
          throw new Error("billing_payment_persistence_conflict");
        }
        existing = correlated[0]!;
      }
      if (
        existing &&
        (existing.status === "succeeded" ||
          SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(existing.status))
      ) {
        return;
      }
      if (checkoutCorrelation.paymentStatus === "paid") {
        // Provider truth has advanced beyond this delayed failure. Preserve a
        // validated legacy correlation but wait for signed success settlement.
        return;
      }
      if (existing) persisted = [existing];
    } else {
      if (invoicePayments.length > 2) {
        throw new Error("billing_payment_invoice_history_ambiguous");
      }
      for (const payment of invoicePayments) {
        assertPersistedPayment(payment, {
          userId,
          catalogId: failedPayment.catalogId,
          amountInCents: invoice.amount_due,
          currency: invoice.currency,
        });
        if (payment.stripeInvoiceId !== invoice.id) {
          throw new Error("billing_payment_truth_mismatch:stripeInvoiceId");
        }
        if (payment.status === "failed") {
          if (
            payment.stripePaymentIntentId !== null ||
            payment.stripeChargeId !== null ||
            payment.creditGrantId !== null
          ) {
            throw new Error(
              "billing_payment_truth_mismatch:failed_correlation"
            );
          }
        } else if (
          payment.status === "succeeded" ||
          SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(payment.status)
        ) {
          if (!payment.stripePaymentIntentId || !payment.creditGrantId) {
            throw new Error(
              "billing_payment_truth_mismatch:settlement_correlation"
            );
          }
        } else {
          throw new Error("billing_payment_truth_mismatch:status");
        }
      }
      const settled = invoicePayments.find(
        (payment) =>
          payment.status === "succeeded" ||
          SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(payment.status)
      );
      if (settled) {
        // Stripe does not guarantee delivery order. A delayed failure must not
        // overwrite later successful or reversed settlement truth.
        return;
      }
      const failed = invoicePayments.filter(
        (payment) => payment.status === "failed"
      );
      if (failed.length > 1 || failed.length !== invoicePayments.length) {
        throw new Error("billing_payment_invoice_history_ambiguous");
      }
      if (failed[0]) persisted = [failed[0]];
    }
    if (persisted.length === 0) {
      const failedInsert = tx.insert(paymentHistory).values(failedPayment);
      await failedInsert.onConflictDoNothing();
      persisted = checkoutCorrelation
        ? await tx
            .select()
            .from(paymentHistory)
            .where(
              eq(paymentHistory.stripeCheckoutSessionId, checkoutCorrelation.id)
            )
            .limit(1)
        : await tx
            .select()
            .from(paymentHistory)
            .where(
              and(
                eq(paymentHistory.stripeInvoiceId, invoice.id),
                eq(paymentHistory.status, "failed")
              )
            )
            .limit(1);
    }
    assertPersistedPayment(persisted[0], {
      userId,
      ...(checkoutCorrelation
        ? { stripeCheckoutSessionId: checkoutCorrelation.id }
        : {}),
      catalogId:
        checkoutCorrelation?.catalogId ??
        getStripeCatalogIdForPrice(getInvoicePriceId(invoice)),
      amountInCents: invoice.amount_due,
      currency: invoice.currency,
    });
    if (persisted[0]?.status !== "failed") {
      if (persisted[0]?.status === "succeeded") return;
      throw new Error("billing_payment_truth_mismatch:status");
    }
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
        incomingStripeSubscriptionId: getStripeInvoiceSubscriptionId(invoice),
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

function subscriptionResourceProofFromEvent(
  stripeSubscription: Stripe.Subscription,
  eventCursor: StripeSubscriptionEventCursor,
  eventType: string
): StripeSubscriptionResourceProof {
  const resourceCreatedAt = new Date(stripeSubscription.created * 1000);
  if (!Number.isFinite(resourceCreatedAt.getTime())) {
    throw new Error("stripe_subscription_created_at_invalid");
  }
  return {
    resourceCreatedAt,
    createdEventCursor:
      eventType === "customer.subscription.created" ? eventCursor : null,
  };
}

function subscriptionResourceProofFromRow(
  row:
    | {
        stripeResourceCreatedAt: Date | null;
        stripeResourceCreatedEventTimestamp: Date | null;
        stripeResourceCreatedEventId: string | null;
      }
    | undefined
): StripeSubscriptionResourceProof | null {
  if (!row?.stripeResourceCreatedAt) return null;
  return {
    resourceCreatedAt: row.stripeResourceCreatedAt,
    createdEventCursor:
      row.stripeResourceCreatedEventTimestamp &&
      row.stripeResourceCreatedEventId
        ? {
            createdAt: row.stripeResourceCreatedEventTimestamp,
            priority: 30,
            eventId: row.stripeResourceCreatedEventId,
          }
        : null,
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

const SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES = new Set([
  "partially_refunded",
  "refunded",
  "disputed",
]);

function validateSubscriptionCreateInvoicePayment(
  rows: readonly PersistedPayment[],
  expected: {
    userId: string;
    invoiceId: string;
    checkoutSessionId: string;
    catalogId: string;
    amountInCents: number;
    currency: string;
  }
): PersistedPayment | null {
  if (rows.length > 2) {
    throw new Error("billing_payment_invoice_history_ambiguous");
  }
  const failed: PersistedPayment[] = [];
  const terminal: PersistedPayment[] = [];
  for (const row of rows) {
    assertPersistedPayment(row, {
      userId: expected.userId,
      catalogId: expected.catalogId,
      amountInCents: expected.amountInCents,
      currency: expected.currency,
    });
    if (row.stripeInvoiceId !== expected.invoiceId) {
      throw new Error("billing_payment_truth_mismatch:stripeInvoiceId");
    }
    if (
      row.stripeCheckoutSessionId !== null &&
      row.stripeCheckoutSessionId !== expected.checkoutSessionId
    ) {
      throw new Error("billing_payment_truth_mismatch:stripeCheckoutSessionId");
    }
    if (row.status === "failed") {
      if (
        row.stripePaymentIntentId !== null ||
        row.stripeChargeId !== null ||
        row.creditGrantId !== null
      ) {
        throw new Error("billing_payment_truth_mismatch:failed_correlation");
      }
      failed.push(row);
      continue;
    }
    if (
      row.status === "succeeded" ||
      SUBSCRIPTION_REVERSAL_PAYMENT_STATUSES.has(row.status)
    ) {
      if (!row.stripePaymentIntentId || !row.creditGrantId) {
        throw new Error(
          "billing_payment_truth_mismatch:settlement_correlation"
        );
      }
      terminal.push(row);
      continue;
    }
    throw new Error("billing_payment_truth_mismatch:status");
  }
  if (failed.length > 1 || terminal.length > 1) {
    throw new Error("billing_payment_invoice_history_ambiguous");
  }
  // Historical code could persist failure and settlement under separate
  // invoice+status rows. Terminal provider truth wins; the failed artifact is
  // retained as history and is never mutated into a second correlated row.
  return terminal[0] ?? failed[0] ?? null;
}

function assertPersistedPayment(
  actual: PersistedPayment | undefined,
  expected: Partial<
    Pick<
      PersistedPayment,
      | "userId"
      | "stripePaymentIntentId"
      | "stripeCheckoutSessionId"
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

const CHECKOUT_REPLAY_PAYMENT_STATUSES = new Set([
  "succeeded",
  "partially_refunded",
  "refunded",
  "disputed",
]);

function assertPersistedCheckoutPayment(
  actual: PersistedPayment | undefined,
  expected: Partial<
    Pick<
      PersistedPayment,
      | "userId"
      | "stripePaymentIntentId"
      | "creditGrantId"
      | "catalogId"
      | "amountInCents"
      | "currency"
    >
  >
) {
  assertPersistedPayment(actual, expected);
  if (!actual || !CHECKOUT_REPLAY_PAYMENT_STATUSES.has(actual.status)) {
    throw new Error("billing_payment_truth_mismatch:status");
  }
}

function assertPersistedFailedCheckoutPayment(
  actual: PersistedPayment | undefined,
  expected: Partial<
    Pick<
      PersistedPayment,
      "userId" | "catalogId" | "amountInCents" | "currency"
    >
  >
) {
  assertPersistedPayment(actual, expected);
  if (
    !actual ||
    (actual.status !== "failed" &&
      !CHECKOUT_REPLAY_PAYMENT_STATUSES.has(actual.status))
  ) {
    throw new Error("billing_payment_truth_mismatch:status");
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
  const line = invoice.lines.data[0] as Stripe.InvoiceLineItem & {
    price?: string | Stripe.Price | null;
  };
  const modernPriceId = line?.pricing?.price_details?.price;
  const legacyPrice = line?.price;
  const legacyPriceId =
    typeof legacyPrice === "string" ? legacyPrice : legacyPrice?.id;
  return modernPriceId && legacyPriceId && modernPriceId !== legacyPriceId
    ? undefined
    : (modernPriceId ?? legacyPriceId);
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

async function reconcileStripeEventForDeletedAccount(
  event: Stripe.Event,
  stripe: Stripe,
  userId: string | null
): Promise<
  | "deleted_checkout_reconciled"
  | "deleted_subscription_reconciled"
  | "deleted_invoice_reconciled"
> {
  if (isCheckoutSettlementEvent(event.type)) {
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
        "deleted_subscription_reconciliation_failed",
        "deleted_subscription_manual_reconciliation_required"
      );
    }
    return "deleted_subscription_reconciled";
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getStripeInvoiceSubscriptionId(invoice);
    const customerId = getStripeCustomerId(invoice.customer);
    const initialSubjects = await recordAndRedactLateSubjects(
      userId,
      subscriptionId,
      customerId,
      compactSubjects([buildStripeDeletionSubject("invoice", invoice.id)])
    );
    try {
      if (subscriptionId) {
        await cancelDeletedSubscription(
          stripe,
          subscriptionId,
          deletedBillingIdempotencyKey(subscriptionId, "cancel")
        );
      }

      await cleanupDeletedCustomer(
        stripe,
        userId,
        customerId,
        initialSubjects.map(({ fingerprint }) => fingerprint)
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

function isSubscriptionRenewalBillingReason(reason: string | null): boolean {
  return reason === "subscription_create" || reason === "subscription_cycle";
}

function isHistoricalSubscriptionCycle(
  current: {
    currentPeriodEnd: Date | null;
    currentPeriodStart: Date | null;
  },
  invoicePeriodStart: Date | null,
  invoicePeriodEnd: Date | null
): boolean {
  return Boolean(
    current.currentPeriodStart &&
      current.currentPeriodEnd &&
      current.currentPeriodStart < current.currentPeriodEnd &&
      invoicePeriodStart &&
      invoicePeriodEnd &&
      invoicePeriodStart < invoicePeriodEnd &&
      invoicePeriodEnd <= current.currentPeriodStart
  );
}

function providerTimestamp(value: number | null | undefined): Date | null {
  if (!value || !Number.isSafeInteger(value)) return null;
  const timestamp = new Date(value * 1000);
  return Number.isFinite(timestamp.getTime()) ? timestamp : null;
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
  if (isCheckoutFulfillmentError(error)) return error.code;
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
  return stripeWebhookErrorCode(error);
}

function isDeletedBillingReconciliationEvent(type: Stripe.Event.Type) {
  return (
    isCheckoutSettlementEvent(type) ||
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "invoice.payment_succeeded"
  );
}

function isCheckoutSettlementEvent(type: Stripe.Event.Type) {
  return (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
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
  if (!isCheckoutPaymentEventType(event.type)) return "not_applicable";
  const session = event.data.object as Stripe.Checkout.Session;
  const correlatedUserId = checkoutSessionAuthenticatedUserId(session);
  if (!metadataUserId && !session.client_reference_id) return "not_applicable";
  if (
    metadataUserId &&
    metadataUserId === session.client_reference_id &&
    !isCanonicalAccountUserId(metadataUserId)
  ) {
    // Canonical validation runs against the authoritative Checkout Session
    // after the event has a durable operational log. Never pass an untrusted
    // non-UUID value into an account-deletion UUID query.
    return "not_applicable";
  }
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
  return /^(billing_|checkout_|credit_|stripe_)[a-z0-9_]+$/.test(code)
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
