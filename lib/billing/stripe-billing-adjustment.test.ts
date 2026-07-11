import assert from "node:assert/strict";
import test from "node:test";

import { resolveStripePaymentCorrelation } from "./stripe-billing-adjustment";

interface PaymentCorrelationFixture {
  paymentHistoryId: string;
  userId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  grantIdempotencyKey: string;
  sourcePaymentAmountInCents: number;
}

const payment = (
  overrides: Partial<PaymentCorrelationFixture> = {}
): PaymentCorrelationFixture => ({
  paymentHistoryId: "payment-a",
  userId: "user-a",
  paymentIntentId: "pi-a",
  chargeId: null,
  grantIdempotencyKey: "grant-a",
  sourcePaymentAmountInCents: 900,
  ...overrides,
});

test("payment intent and charge correlators must resolve unanimously", () => {
  assert.throws(
    () =>
      resolveStripePaymentCorrelation({
        paymentIntentId: "pi-a",
        chargeId: "ch-b",
        paymentIntentMatches: [payment()],
        chargeMatches: [
          payment({
            paymentHistoryId: "payment-b",
            paymentIntentId: "pi-b",
            chargeId: "ch-b",
          }),
        ],
      }),
    /billing_adjustment_correlation_required/
  );
});

test("a supplied payment intent cannot be ignored in favor of a charge", () => {
  assert.throws(
    () =>
      resolveStripePaymentCorrelation({
        paymentIntentId: "pi-missing",
        chargeId: "ch-a",
        paymentIntentMatches: [],
        chargeMatches: [payment({ chargeId: "ch-a" })],
      }),
    /billing_adjustment_correlation_required/
  );
});

test("charge backfill requires one payment-intent anchor with an empty charge", () => {
  assert.deepEqual(
    resolveStripePaymentCorrelation({
      paymentIntentId: "pi-a",
      chargeId: "ch-a",
      paymentIntentMatches: [payment()],
      chargeMatches: [],
    }),
    { match: payment(), backfillCharge: true }
  );
  assert.throws(
    () =>
      resolveStripePaymentCorrelation({
        paymentIntentId: "pi-a",
        chargeId: "ch-new",
        paymentIntentMatches: [payment({ chargeId: "ch-existing" })],
        chargeMatches: [],
      }),
    /billing_adjustment_correlation_required/
  );
});

test("one charge correlator can resolve a payment without a payment intent", () => {
  const match = payment({ chargeId: "ch-a" });
  assert.deepEqual(
    resolveStripePaymentCorrelation({
      chargeId: "ch-a",
      paymentIntentMatches: [],
      chargeMatches: [match],
    }),
    { match, backfillCharge: false }
  );
});
