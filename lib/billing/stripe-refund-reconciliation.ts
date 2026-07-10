import { createHash } from "node:crypto";

import type Stripe from "stripe";

export type StripeRefundEvidence = {
  id: string;
  amount: number;
  status: string;
  metadata?: Record<string, string>;
};

const DELETION_ALLOCATION_METADATA_KEY =
  "meelni_deletion_invoice_payment_fingerprint";

export function summarizeStripeRefunds(
  chargeAmount: number,
  refunds: StripeRefundEvidence[]
) {
  assertProviderAmount(chargeAmount);
  const uniqueRefunds = new Map(
    refunds.map((refund) => [refund.id, refund] as const)
  );
  let succeededAmount = 0;
  for (const refund of uniqueRefunds.values()) {
    assertRefundEvidence(refund);
    if (refund.status !== "succeeded") continue;
    if (succeededAmount > Number.MAX_SAFE_INTEGER - refund.amount) {
      throw stripeRefundStateError("stripe_refund_incomplete");
    }
    succeededAmount += refund.amount;
  }
  if (succeededAmount > chargeAmount) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  const hasUnresolvedRefund = [...uniqueRefunds.values()].some(
    ({ status }) =>
      status !== "succeeded" && status !== "failed" && status !== "canceled"
  );
  return {
    fullySucceeded: succeededAmount === chargeAmount,
    hasUnresolvedRefund,
    succeededAmount,
  };
}

export function stripeRefundAttemptIdempotencyKey(
  baseKey: string,
  refunds: StripeRefundEvidence[]
) {
  const state = refunds
    .map(({ id, amount, status }) => `${id}:${amount}:${status}`)
    .sort()
    .join("|");
  const fingerprint = createHash("sha256").update(state).digest("hex");
  return `${baseKey}:attempt:${fingerprint}`;
}

export async function ensureStripePaymentFullyRefunded(
  stripe: Stripe,
  kind: "charge" | "payment_intent",
  providerId: string,
  baseIdempotencyKey: string
) {
  const charge = await loadStripePaymentCharge(stripe, kind, providerId);
  const initialRefunds = await listStripeChargeRefunds(stripe, charge.id);
  const initialState = summarizeStripeRefunds(charge.amount, initialRefunds);
  if (initialState.fullySucceeded) return;
  if (initialState.hasUnresolvedRefund) {
    throw stripeRefundStateError("stripe_refund_pending");
  }

  let createdRefund: Stripe.Refund | undefined;
  let createError: unknown;
  try {
    createdRefund = await stripe.refunds.create(
      {
        ...(kind === "payment_intent"
          ? { payment_intent: providerId }
          : { charge: providerId }),
        reason: "requested_by_customer",
      },
      {
        idempotencyKey: stripeRefundAttemptIdempotencyKey(
          baseIdempotencyKey,
          initialRefunds
        ),
      }
    );
  } catch (error) {
    createError = error;
  }

  const listedRefunds = await listStripeChargeRefunds(stripe, charge.id);
  const finalRefunds = createdRefund
    ? mergeStripeRefundEvidence(listedRefunds, [
        toRefundEvidence(createdRefund),
      ])
    : listedRefunds;
  const finalState = summarizeStripeRefunds(charge.amount, finalRefunds);
  if (finalState.fullySucceeded) return;
  if (createError) throw createError;
  throw stripeRefundStateError(
    finalState.hasUnresolvedRefund
      ? "stripe_refund_pending"
      : "stripe_refund_incomplete"
  );
}

export async function ensureStripeInvoicePaymentAllocationRefunded(
  stripe: Stripe,
  input: {
    allocationAmount: number;
    allocationFingerprint: string;
    kind: "charge" | "payment_intent";
    providerId: string;
    baseIdempotencyKey: string;
  }
) {
  assertProviderAmount(input.allocationAmount);
  if (
    input.allocationAmount === 0 ||
    !/^[a-f0-9]{64}$/.test(input.allocationFingerprint)
  ) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  const charge = await loadStripePaymentCharge(
    stripe,
    input.kind,
    input.providerId
  );
  if (input.allocationAmount > charge.amount) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }

  const initialRefunds = await listStripeChargeRefunds(stripe, charge.id);
  const globalState = summarizeStripeRefunds(charge.amount, initialRefunds);
  if (globalState.fullySucceeded) return;
  if (globalState.hasUnresolvedRefund) {
    throw stripeRefundStateError("stripe_refund_pending");
  }

  const allocationCoversCharge = input.allocationAmount === charge.amount;
  const allocationRefunds = allocationCoversCharge
    ? initialRefunds
    : refundsForAllocation(initialRefunds, input.allocationFingerprint);
  const allocationState = summarizeStripeRefunds(
    input.allocationAmount,
    allocationRefunds
  );
  if (allocationState.fullySucceeded) return;

  const ambiguousSucceededAmount = initialRefunds
    .filter(
      ({ status, metadata }) =>
        status === "succeeded" && !metadata?.[DELETION_ALLOCATION_METADATA_KEY]
    )
    .reduce((total, { amount }) => total + amount, 0);
  if (!allocationCoversCharge && ambiguousSucceededAmount > 0) {
    // A partial untagged refund cannot be attributed to this invoice allocation.
    // Stop rather than over-refund another allocation or count ambiguous proof.
    throw stripeRefundStateError("stripe_refund_incomplete");
  }

  const remainingAmount =
    input.allocationAmount - allocationState.succeededAmount;
  if (globalState.succeededAmount > charge.amount - remainingAmount) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  let createdRefund: Stripe.Refund | undefined;
  let createError: unknown;
  try {
    createdRefund = await stripe.refunds.create(
      {
        ...(input.kind === "payment_intent"
          ? { payment_intent: input.providerId }
          : { charge: input.providerId }),
        amount: remainingAmount,
        reason: "requested_by_customer",
        metadata: {
          [DELETION_ALLOCATION_METADATA_KEY]: input.allocationFingerprint,
        },
      },
      {
        idempotencyKey: stripeRefundAttemptIdempotencyKey(
          input.baseIdempotencyKey,
          allocationRefunds
        ),
      }
    );
  } catch (error) {
    createError = error;
  }

  const listedRefunds = await listStripeChargeRefunds(stripe, charge.id);
  const finalRefunds = createdRefund
    ? mergeStripeRefundEvidence(listedRefunds, [
        toRefundEvidence(createdRefund),
      ])
    : listedRefunds;
  const finalGlobalState = summarizeStripeRefunds(charge.amount, finalRefunds);
  if (finalGlobalState.fullySucceeded) return;
  const finalAllocationState = summarizeStripeRefunds(
    input.allocationAmount,
    allocationCoversCharge
      ? finalRefunds
      : refundsForAllocation(finalRefunds, input.allocationFingerprint)
  );
  if (finalAllocationState.fullySucceeded) return;
  if (createError) throw createError;
  throw stripeRefundStateError(
    finalGlobalState.hasUnresolvedRefund ||
      finalAllocationState.hasUnresolvedRefund
      ? "stripe_refund_pending"
      : "stripe_refund_incomplete"
  );
}

async function loadStripePaymentCharge(
  stripe: Stripe,
  kind: "charge" | "payment_intent",
  providerId: string
): Promise<Pick<Stripe.Charge, "id" | "amount">> {
  if (kind === "charge") {
    const charge = await stripe.charges.retrieve(providerId);
    assertChargeEvidence(charge);
    return charge;
  }
  const paymentIntent = await stripe.paymentIntents.retrieve(providerId, {
    expand: ["latest_charge"],
  });
  const latestCharge = paymentIntent.latest_charge;
  if (!latestCharge) throw stripeRefundStateError("stripe_refund_incomplete");
  if (typeof latestCharge === "string") {
    const charge = await stripe.charges.retrieve(latestCharge);
    assertChargeEvidence(charge);
    return charge;
  }
  if (!("amount" in latestCharge)) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  assertChargeEvidence(latestCharge);
  return latestCharge;
}

async function listStripeChargeRefunds(stripe: Stripe, chargeId: string) {
  const refunds: StripeRefundEvidence[] = [];
  let startingAfter: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(...page.data.map(toRefundEvidence));
    if (!page.has_more) return refunds;
    const lastId = page.data.at(-1)?.id;
    if (!lastId) throw stripeRefundStateError("stripe_refund_incomplete");
    startingAfter = lastId;
  }
  throw stripeRefundStateError("stripe_refund_incomplete");
}

function toRefundEvidence(
  refund: Pick<Stripe.Refund, "id" | "amount" | "status" | "metadata">
): StripeRefundEvidence {
  const evidence = {
    id: refund.id,
    amount: refund.amount,
    status: refund.status ?? "unknown",
    metadata: refund.metadata ?? undefined,
  };
  assertRefundEvidence(evidence);
  return evidence;
}

function refundsForAllocation(
  refunds: StripeRefundEvidence[],
  allocationFingerprint: string
) {
  return refunds.filter(
    ({ metadata }) =>
      metadata?.[DELETION_ALLOCATION_METADATA_KEY] === allocationFingerprint
  );
}

function mergeStripeRefundEvidence(
  listed: StripeRefundEvidence[],
  additional: StripeRefundEvidence[]
) {
  return [
    ...new Map(
      [...listed, ...additional].map((item) => [item.id, item])
    ).values(),
  ];
}

function stripeRefundStateError(code: string): Error & { code: string } {
  return Object.assign(new Error("Stripe refund is not terminal"), { code });
}

function assertChargeEvidence(value: { id?: unknown; amount?: unknown }) {
  if (typeof value.id !== "string" || !value.id) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  assertProviderAmount(value.amount);
}

function assertRefundEvidence(value: StripeRefundEvidence) {
  if (typeof value.id !== "string" || !value.id) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
  assertProviderAmount(value.amount);
  if (
    value.status !== "pending" &&
    value.status !== "requires_action" &&
    value.status !== "succeeded" &&
    value.status !== "failed" &&
    value.status !== "canceled"
  ) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
}

function assertProviderAmount(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw stripeRefundStateError("stripe_refund_incomplete");
  }
}
