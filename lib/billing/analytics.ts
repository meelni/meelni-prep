import type { BillingCatalogId } from "@meelni/core";

import { trackServerEvent } from "@/lib/analytics/posthog-server";
import { toSafeAnalyticsErrorCode } from "@/lib/analytics/event-policy";
import { readUserAnalyticsConsent } from "@/lib/db/analytics-consent";
import type { CreditGrantSource, CreditTransactionType } from "./credits";

export interface BillingCreditEventInput {
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
  return trackBillingEvent("billing_credit_granted", input);
}

export function trackBillingCreditReserved(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_credit_reserved", input);
}

export function trackBillingCreditConsumed(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_credit_consumed", input);
}

export function trackBillingCreditReleased(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_credit_released", input);
}

export function trackBillingCreditRefunded(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_credit_refunded", input);
}

export function trackBillingCreditExpired(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_credit_expired", input);
}

export function trackBillingCreditRolloverCreated(
  input: BillingCreditEventInput
) {
  return trackBillingEvent("billing_credit_rollover_created", input);
}

export function trackBillingNoCredits(input: BillingCreditEventInput) {
  return trackBillingEvent("billing_no_credits", input);
}

async function trackBillingEvent(
  event: string,
  input: BillingCreditEventInput
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (!process.env.ANALYTICS_PSEUDONYM_KEY) return;
  await deliverBillingAnalytics(event, input, {
    readConsent: readUserAnalyticsConsent,
    track: trackServerEvent,
  });
}

export async function deliverBillingAnalytics(
  event: string,
  input: BillingCreditEventInput,
  deps: {
    readConsent: typeof readUserAnalyticsConsent;
    track: typeof trackServerEvent;
  }
): Promise<void> {
  try {
    const consent = await deps.readConsent(input.userId);
    await deps.track(
      event,
      buildBillingAnalyticsProperties(input),
      { userId: input.userId },
      consent
    );
  } catch (error) {
    console.error("[BillingAnalytics] Optional delivery failed", error);
  }
}

export function buildBillingAnalyticsProperties(
  input: BillingCreditEventInput
): Record<string, unknown> {
  return {
    catalog_id: input.catalogId,
    credit_source: input.creditSource,
    transaction_type: input.transactionType,
    credits: input.credits,
    balance_after: input.balanceAfter,
    reason_code: input.reason
      ? toSafeAnalyticsErrorCode(input.reason)
      : undefined,
    duplicate: input.duplicate,
  };
}
