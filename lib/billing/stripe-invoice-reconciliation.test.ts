import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import { loadStripeInvoicePaymentAllocations } from "./stripe-invoice-reconciliation";

test("invoice reconciliation loads every paid allocation across pagination", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const stripe = stripeWithInvoicePayments(async (params) => {
    calls.push(params);
    if (!params.starting_after) {
      return page(
        [
          invoicePayment({
            id: "inpay_first",
            amount: 1_000,
            paymentIntentId: "pi_shared",
          }),
        ],
        true
      );
    }
    return page(
      [
        invoicePayment({
          id: "inpay_second",
          amount: 1_900,
          chargeId: "ch_second",
        }),
      ],
      false
    );
  });

  const allocations = await loadStripeInvoicePaymentAllocations(stripe, {
    id: "in_multi",
    amount_paid: 2_900,
    currency: "usd",
  });

  assert.deepEqual(
    allocations.map(({ allocationAmount, kind, providerId }) => ({
      allocationAmount,
      kind,
      providerId,
    })),
    [
      {
        allocationAmount: 1_000,
        kind: "payment_intent",
        providerId: "pi_shared",
      },
      {
        allocationAmount: 1_900,
        kind: "charge",
        providerId: "ch_second",
      },
    ]
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.starting_after, "inpay_first");
});

test("invoice reconciliation fails closed on incomplete totals and payment records", async () => {
  await assert.rejects(
    () =>
      loadStripeInvoicePaymentAllocations(
        stripeWithInvoicePayments(async () =>
          page(
            [
              invoicePayment({
                id: "inpay_partial",
                amount: 1_000,
                paymentIntentId: "pi_partial",
              }),
            ],
            false
          )
        ),
        { id: "in_partial", amount_paid: 2_900, currency: "usd" }
      ),
    hasInvoiceEvidenceError
  );

  await assert.rejects(
    () =>
      loadStripeInvoicePaymentAllocations(
        stripeWithInvoicePayments(async () =>
          page(
            [
              {
                ...invoicePayment({
                  id: "inpay_record",
                  amount: 2_900,
                  paymentIntentId: "pi_unused",
                }),
                payment: {
                  type: "payment_record",
                  payment_record: "pyr_test",
                },
              } as Stripe.InvoicePayment,
            ],
            false
          )
        ),
        { id: "in_record", amount_paid: 2_900, currency: "usd" }
      ),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "stripe_invoice_payment_manual_reconciliation_required"
  );
});

function stripeWithInvoicePayments(
  list: (params: Record<string, unknown>) => Promise<unknown>
) {
  return {
    invoicePayments: { list },
  } as unknown as Stripe;
}

function page(data: Stripe.InvoicePayment[], hasMore: boolean) {
  return { data, has_more: hasMore };
}

function invoicePayment(input: {
  amount: number;
  chargeId?: string;
  id: string;
  paymentIntentId?: string;
}): Stripe.InvoicePayment {
  return {
    id: input.id,
    object: "invoice_payment",
    amount_paid: input.amount,
    amount_requested: input.amount,
    created: 1,
    currency: "usd",
    invoice: "in_test",
    is_default: false,
    livemode: false,
    payment: input.paymentIntentId
      ? { type: "payment_intent", payment_intent: input.paymentIntentId }
      : { type: "charge", charge: input.chargeId },
    status: "paid",
    status_transitions: { canceled_at: null, paid_at: 1 },
  };
}

function hasInvoiceEvidenceError(error: unknown) {
  return (
    (error as { code?: string }).code ===
    "stripe_invoice_payment_evidence_invalid"
  );
}
