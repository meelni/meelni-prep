import type { BillingCatalogId } from "@meelni/core";

import type { createCreditLedgerService } from "./credits";
import { shouldApplyStripeSubscriptionState } from "./stripe-event-ordering";

type CreditLedgerService = ReturnType<typeof createCreditLedgerService>;

export interface SubscriptionInvoiceState {
  status: string;
  stripeSubscriptionId: string | null;
  lastEventTimestamp: Date | null;
}

export async function applyCurrentSubscriptionInvoice(input: {
  current: SubscriptionInvoiceState | null;
  incomingStripeSubscriptionId: string | null;
  eventTimestamp: Date;
  invoiceId: string;
  catalogId: BillingCatalogId;
  userId: string;
  ledger: Pick<CreditLedgerService, "renewSubscriptionCredits">;
  onCreditGrant?(creditGrantId: string): void;
  applySubscriptionState(): Promise<void>;
}): Promise<"applied" | "skipped"> {
  if (
    !input.current ||
    !shouldApplyStripeSubscriptionState({
      currentStatus: input.current.status,
      currentStripeSubscriptionId: input.current.stripeSubscriptionId,
      event: "invoice_succeeded",
      eventTimestamp: input.eventTimestamp,
      incomingStripeSubscriptionId: input.incomingStripeSubscriptionId,
      lastEventTimestamp: input.current.lastEventTimestamp,
    })
  ) {
    return "skipped";
  }

  if (input.catalogId === "starter" || input.catalogId === "pro") {
    const renewal = await input.ledger.renewSubscriptionCredits({
      userId: input.userId,
      catalogId: input.catalogId,
      renewalIdempotencyKey: `stripe:invoice:${input.invoiceId}:${input.catalogId}`,
      rolloverIdempotencyKey: `stripe:rollover:${input.invoiceId}:${input.catalogId}`,
      sourceId: input.invoiceId,
    });
    input.onCreditGrant?.(renewal.grant.id);
  }
  await input.applySubscriptionState();
  return "applied";
}
