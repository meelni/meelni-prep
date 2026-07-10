import { and, eq, or } from "drizzle-orm";

import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  createCreditLedgerService,
  type BillingAdjustmentType,
} from "@/lib/billing/credits";
import { db } from "@/lib/db";
import { creditGrant, paymentHistory } from "@/lib/db/schema";

export interface StripeBillingAdjustmentInput {
  stripeEventId: string;
  providerAdjustmentId: string;
  adjustmentType: BillingAdjustmentType;
  direction: "withdraw" | "reinstate";
  paymentIntentId?: string | null;
  chargeId?: string | null;
  amountInCents?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function reconcileStripeBillingAdjustment(
  input: StripeBillingAdjustmentInput
) {
  if (!input.paymentIntentId && !input.chargeId) {
    throw new Error("billing_adjustment_correlation_required");
  }

  const correlation = await db
    .select({
      paymentHistoryId: paymentHistory.id,
      userId: paymentHistory.userId,
      grantIdempotencyKey: creditGrant.idempotencyKey,
      sourcePaymentAmountInCents: paymentHistory.amountInCents,
    })
    .from(paymentHistory)
    .innerJoin(creditGrant, eq(paymentHistory.creditGrantId, creditGrant.id))
    .where(
      or(
        input.paymentIntentId
          ? eq(paymentHistory.stripePaymentIntentId, input.paymentIntentId)
          : undefined,
        input.chargeId
          ? eq(paymentHistory.stripeChargeId, input.chargeId)
          : undefined
      )
    )
    .limit(2);

  if (correlation.length !== 1) {
    throw new Error("billing_adjustment_correlation_required");
  }
  const match = correlation[0]!;

  if (input.chargeId) {
    await db
      .update(paymentHistory)
      .set({ stripeChargeId: input.chargeId })
      .where(
        and(
          eq(paymentHistory.id, match.paymentHistoryId),
          input.paymentIntentId
            ? eq(paymentHistory.stripePaymentIntentId, input.paymentIntentId)
            : undefined
        )
      );
  }

  const ledger = createCreditLedgerService({
    store: createDrizzleCreditLedgerStore(),
  });
  const ledgerInput = {
    userId: match.userId,
    grantIdempotencyKey: match.grantIdempotencyKey,
    stripeEventId: input.stripeEventId,
    providerAdjustmentId: input.providerAdjustmentId,
    adjustmentType: input.adjustmentType,
    paymentHistoryId: match.paymentHistoryId,
    amountInCents: input.amountInCents,
    sourcePaymentAmountInCents: match.sourcePaymentAmountInCents,
    currency: input.currency,
    metadata: input.metadata,
  };
  return input.direction === "withdraw"
    ? ledger.revokePaidGrant(ledgerInput)
    : ledger.reinstatePaidGrant(ledgerInput);
}
