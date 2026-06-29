import type { BillingCatalogId } from "@meelni/core";

import { trackServerEvent } from "@/lib/analytics/posthog-server";
import type { CreditGrantSource, CreditTransactionType } from "./credits";

interface BillingCreditEventInput {
  userId: string;
  catalogId?: BillingCatalogId;
  creditSource?: CreditGrantSource;
  transactionType?: CreditTransactionType;
  credits?: number;
  balanceAfter?: number | null;
  idempotencyKey?: string;
  sourceId?: string | null;
  sessionId?: string | null;
  grantId?: string | null;
  reservationId?: string | null;
  reason?: string;
  duplicate?: boolean;
}

export function trackBillingCreditGranted(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_granted", input);
}

export function trackBillingCreditReserved(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_reserved", input);
}

export function trackBillingCreditConsumed(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_consumed", input);
}

export function trackBillingCreditReleased(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_released", input);
}

export function trackBillingCreditRefunded(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_refunded", input);
}

export function trackBillingCreditExpired(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_expired", input);
}

export function trackBillingCreditRolloverCreated(input: BillingCreditEventInput) {
  trackBillingEvent("billing_credit_rollover_created", input);
}

export function trackBillingNoCredits(input: BillingCreditEventInput) {
  trackBillingEvent("billing_no_credits", input);
}

function trackBillingEvent(event: string, input: BillingCreditEventInput) {
  if (!process.env.POSTHOG_SERVER_KEY && !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }

  trackServerEvent(
    event,
    {
      catalog_id: input.catalogId,
      credit_source: input.creditSource,
      transaction_type: input.transactionType,
      credits: input.credits,
      balance_after: input.balanceAfter,
      idempotency_key: input.idempotencyKey,
      source_id: input.sourceId,
      session_id: input.sessionId,
      grant_id: input.grantId,
      reservation_id: input.reservationId,
      reason: input.reason,
      duplicate: input.duplicate,
    },
    input.userId
  );
}
