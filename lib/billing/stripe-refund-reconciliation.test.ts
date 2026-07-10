import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import {
  ensureStripePaymentFullyRefunded,
  stripeRefundAttemptIdempotencyKey,
  summarizeStripeRefunds,
} from "./stripe-refund-reconciliation";

test("only succeeded refunds count toward terminal full-refund evidence", () => {
  assert.deepEqual(
    summarizeStripeRefunds(2_900, [
      { id: "re_succeeded", amount: 1_000, status: "succeeded" },
      { id: "re_pending", amount: 1_900, status: "pending" },
    ]),
    {
      fullySucceeded: false,
      hasUnresolvedRefund: true,
      succeededAmount: 1_000,
    }
  );
  assert.equal(
    summarizeStripeRefunds(2_900, [
      { id: "re_one", amount: 1_000, status: "succeeded" },
      { id: "re_two", amount: 1_900, status: "succeeded" },
    ]).fullySucceeded,
    true
  );
});

test("a terminal failed refund advances the deterministic retry key", () => {
  const base = "account-deletion:refund:test";
  const first = stripeRefundAttemptIdempotencyKey(base, []);
  const retry = stripeRefundAttemptIdempotencyKey(base, [
    { id: "re_failed", amount: 2_900, status: "failed" },
  ]);
  assert.notEqual(first, retry);
  assert.equal(
    retry,
    stripeRefundAttemptIdempotencyKey(base, [
      { id: "re_failed", amount: 2_900, status: "failed" },
    ])
  );
});

test("refund history pagination is bounded and fails closed", async () => {
  let listCalls = 0;
  const stripe = {
    charges: {
      retrieve: async () => ({ id: "ch_test", amount: 2_900 }),
    },
    refunds: {
      list: async () => {
        listCalls += 1;
        return {
          data: [
            {
              id: `re_failed_${listCalls}`,
              amount: 0,
              status: "failed",
            },
          ],
          has_more: true,
        };
      },
    },
  } as unknown as Stripe;

  await assert.rejects(
    () =>
      ensureStripePaymentFullyRefunded(
        stripe,
        "charge",
        "ch_test",
        "account-deletion:refund:test"
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "stripe_refund_incomplete"
  );
  assert.equal(listCalls, 10);
});

test("invalid provider refund evidence fails closed before creating a refund", async () => {
  let createCalls = 0;
  const stripe = {
    charges: {
      retrieve: async () => ({ id: "ch_test", amount: 2_900 }),
    },
    refunds: {
      list: async () => ({
        data: [{ id: "re_invalid", amount: -1, status: "invented" }],
        has_more: false,
      }),
      create: async () => {
        createCalls += 1;
      },
    },
  } as unknown as Stripe;

  await assert.rejects(
    () =>
      ensureStripePaymentFullyRefunded(
        stripe,
        "charge",
        "ch_test",
        "account-deletion:refund:test"
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "stripe_refund_incomplete"
  );
  assert.equal(createCalls, 0);
});

test("an impossible succeeded total above the charge amount fails closed", () => {
  assert.throws(
    () =>
      summarizeStripeRefunds(2_900, [
        { id: "re_impossible", amount: 3_000, status: "succeeded" },
      ]),
    (error: unknown) =>
      (error as { code?: string }).code === "stripe_refund_incomplete"
  );
});
