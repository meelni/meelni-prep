import type { BillingCatalogId } from "@meelni/core";

import type { SubscriptionRenewalPostCommitEffects } from "./credit-ledger-subscriptions";
import type { CreditLedgerService } from "./credit-ledger-service";

export interface SubscriptionInvoiceState {
  status: string;
  stripeSubscriptionId: string | null;
  lastEventTimestamp: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

export async function applyCurrentSubscriptionInvoice(input: {
  current: SubscriptionInvoiceState | null;
  incomingStripeSubscriptionId: string | null;
  eventTimestamp: Date;
  billingReason: string | null;
  invoicePeriodStart: Date | null;
  invoicePeriodEnd: Date | null;
  invoiceId: string;
  catalogId: BillingCatalogId;
  userId: string;
  ledger: Pick<CreditLedgerService, "renewSubscriptionCredits">;
  onCreditGrant?(creditGrantId: string): void;
  applySubscriptionState(): Promise<void>;
}): Promise<{
  status: "applied" | "skipped";
  postCommitEffects: SubscriptionRenewalPostCommitEffects | null;
}> {
  const current = input.current;
  if (
    !current ||
    !shouldApplyCurrentSubscriptionInvoice({ ...input, current })
  ) {
    return { status: "skipped", postCommitEffects: null };
  }

  let postCommitEffects: SubscriptionRenewalPostCommitEffects | null = null;
  if (input.catalogId === "starter" || input.catalogId === "pro") {
    const renewal = await input.ledger.renewSubscriptionCredits({
      userId: input.userId,
      catalogId: input.catalogId,
      renewalIdempotencyKey: `stripe:invoice:${input.invoiceId}:${input.catalogId}`,
      rolloverIdempotencyKey: `stripe:rollover:${input.invoiceId}:${input.catalogId}`,
      sourceId: input.invoiceId,
    });
    input.onCreditGrant?.(renewal.grant.id);
    postCommitEffects = renewal.postCommitEffects;
  }
  await input.applySubscriptionState();
  return { status: "applied", postCommitEffects };
}

export function shouldApplyCurrentSubscriptionInvoice(input: {
  current: SubscriptionInvoiceState;
  incomingStripeSubscriptionId: string | null;
  eventTimestamp: Date;
  billingReason: string | null;
  invoicePeriodStart: Date | null;
  invoicePeriodEnd: Date | null;
}): boolean {
  const {
    current,
    incomingStripeSubscriptionId,
    eventTimestamp,
    billingReason,
    invoicePeriodStart,
    invoicePeriodEnd,
  } = input;
  const currentPeriodStart = current.currentPeriodStart;
  const currentPeriodEnd = current.currentPeriodEnd;
  if (
    current.status === "canceled" ||
    !current.stripeSubscriptionId ||
    current.stripeSubscriptionId !== incomingStripeSubscriptionId ||
    (billingReason !== "subscription_create" &&
      billingReason !== "subscription_cycle") ||
    !isValidPeriod(invoicePeriodStart, invoicePeriodEnd) ||
    !isValidPeriod(currentPeriodStart, currentPeriodEnd)
  ) {
    return false;
  }

  const exactCurrentPeriod =
    invoicePeriodStart!.getTime() === currentPeriodStart!.getTime() &&
    invoicePeriodEnd!.getTime() === currentPeriodEnd!.getTime();
  if (exactCurrentPeriod) return true;

  const advancesPeriod =
    invoicePeriodStart! >= currentPeriodEnd! &&
    invoicePeriodEnd! > currentPeriodEnd!;
  if (!advancesPeriod) return false;
  return Boolean(
    !current.lastEventTimestamp || eventTimestamp > current.lastEventTimestamp
  );
}

function isValidPeriod(start: Date | null, end: Date | null): boolean {
  return Boolean(
    start &&
      end &&
      Number.isFinite(start.getTime()) &&
      Number.isFinite(end.getTime()) &&
      start < end
  );
}
