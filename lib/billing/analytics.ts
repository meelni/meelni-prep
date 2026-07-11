import { createHash } from "node:crypto";

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
  reservedCredits?: number;
  consumedCredits?: number;
  unrecoverableCredits?: number;
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

export function trackBillingCreditRolloverCreated(
  input: BillingCreditEventInput
) {
  trackBillingEvent("billing_credit_rollover_created", input);
}

export function trackBillingNoCredits(input: BillingCreditEventInput) {
  trackBillingEvent("billing_no_credits", input);
}

export function trackBillingPaymentAdjusted(input: BillingCreditEventInput) {
  if (!process.env.POSTHOG_SERVER_KEY && !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }
  const event = buildBillingPaymentAdjustedAnalytics(input);
  trackServerEvent(event.event, event.properties, event.distinctId);
}

export function buildBillingPaymentAdjustedAnalytics(
  input: BillingCreditEventInput
) {
  return {
    event: "billing_credit_payment_adjusted",
    distinctId: pseudonymizeBillingUser(input.userId),
    properties: {
      credits: input.credits,
      reason: input.reason,
      duplicate: input.duplicate,
      reserved_credits: input.reservedCredits,
      consumed_credits: input.consumedCredits,
      unrecoverable_credits: input.unrecoverableCredits,
    },
  };
}

function pseudonymizeBillingUser(userId: string) {
  return createHash("sha256")
    .update(`meelni:billing-settlement-analytics:v1:${userId}`)
    .digest("hex");
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
      reserved_credits: input.reservedCredits,
      consumed_credits: input.consumedCredits,
      unrecoverable_credits: input.unrecoverableCredits,
    },
    input.userId
  );
}
