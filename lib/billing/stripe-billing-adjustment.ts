import { and, eq, isNull } from "drizzle-orm";

import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import { createCreditLedgerService } from "@/lib/billing/credit-ledger-service";
import { type BillingAdjustmentType } from "@/lib/billing/credit-ledger-payment-adjustments";
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

interface StripePaymentCorrelation {
  paymentHistoryId: string;
  userId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  grantIdempotencyKey: string;
  sourcePaymentAmountInCents: number;
}

export function resolveStripePaymentCorrelation(input: {
  paymentIntentId?: string | null;
  chargeId?: string | null;
  paymentIntentMatches: StripePaymentCorrelation[];
  chargeMatches: StripePaymentCorrelation[];
}): { match: StripePaymentCorrelation; backfillCharge: boolean } {
  if (input.paymentIntentId && input.paymentIntentMatches.length !== 1) {
    throw new Error("billing_adjustment_correlation_required");
  }
  if (input.chargeMatches.length > 1) {
    throw new Error("billing_adjustment_correlation_required");
  }
  const match = input.paymentIntentMatches[0] ?? input.chargeMatches[0];
  if (!match) throw new Error("billing_adjustment_correlation_required");
  if (
    input.chargeMatches[0] &&
    input.chargeMatches[0].paymentHistoryId !== match.paymentHistoryId
  ) {
    throw new Error("billing_adjustment_correlation_required");
  }
  const backfillCharge = Boolean(
    input.chargeId && input.chargeMatches.length === 0
  );
  if (backfillCharge && (!input.paymentIntentId || match.chargeId !== null)) {
    throw new Error("billing_adjustment_correlation_required");
  }
  return { match, backfillCharge };
}

export async function reconcileStripeBillingAdjustment(
  input: StripeBillingAdjustmentInput
) {
  if (!input.paymentIntentId && !input.chargeId) {
    throw new Error("billing_adjustment_correlation_required");
  }

  const match = await db.transaction(async (tx) => {
    const projection = {
      paymentHistoryId: paymentHistory.id,
      userId: paymentHistory.userId,
      paymentIntentId: paymentHistory.stripePaymentIntentId,
      chargeId: paymentHistory.stripeChargeId,
      grantIdempotencyKey: creditGrant.idempotencyKey,
      sourcePaymentAmountInCents: paymentHistory.amountInCents,
    };
    const paymentIntentMatches = input.paymentIntentId
      ? await tx
          .select(projection)
          .from(paymentHistory)
          .innerJoin(
            creditGrant,
            eq(paymentHistory.creditGrantId, creditGrant.id)
          )
          .where(
            eq(paymentHistory.stripePaymentIntentId, input.paymentIntentId)
          )
          .limit(2)
      : [];
    const chargeMatches = input.chargeId
      ? await tx
          .select(projection)
          .from(paymentHistory)
          .innerJoin(
            creditGrant,
            eq(paymentHistory.creditGrantId, creditGrant.id)
          )
          .where(eq(paymentHistory.stripeChargeId, input.chargeId))
          .limit(2)
      : [];

    const { match: resolved, backfillCharge } = resolveStripePaymentCorrelation(
      {
        paymentIntentId: input.paymentIntentId,
        chargeId: input.chargeId,
        paymentIntentMatches,
        chargeMatches,
      }
    );

    const paymentIntentId = input.paymentIntentId;
    if (input.chargeId && paymentIntentId && backfillCharge) {
      const backfilled = await tx
        .update(paymentHistory)
        .set({ stripeChargeId: input.chargeId })
        .where(
          and(
            eq(paymentHistory.id, resolved.paymentHistoryId),
            eq(paymentHistory.stripePaymentIntentId, paymentIntentId),
            isNull(paymentHistory.stripeChargeId)
          )
        )
        .returning({ id: paymentHistory.id });
      if (backfilled.length !== 1) {
        throw new Error("billing_adjustment_correlation_required");
      }
    }

    const verified = await tx
      .select(projection)
      .from(paymentHistory)
      .innerJoin(creditGrant, eq(paymentHistory.creditGrantId, creditGrant.id))
      .where(eq(paymentHistory.id, resolved.paymentHistoryId))
      .limit(1);
    const current = verified[0];
    if (
      !current ||
      (input.paymentIntentId &&
        current.paymentIntentId !== input.paymentIntentId) ||
      (input.chargeId && current.chargeId !== input.chargeId)
    ) {
      throw new Error("billing_adjustment_correlation_required");
    }
    return current;
  });

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
