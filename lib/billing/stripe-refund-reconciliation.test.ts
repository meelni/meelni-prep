import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import {
  ensureStripeInvoicePaymentAllocationRefunded,
  ensureStripePaymentFullyRefunded,
  stripeRefundAttemptIdempotencyKey,
  summarizeStripeRefunds,
} from "./stripe-refund-reconciliation";

const ALLOCATION_METADATA_KEY = "meelni_deletion_invoice_payment_fingerprint";

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

test("invoice allocation refunds are exact, tagged, and independently idempotent", async () => {
  const created: Array<Record<string, unknown>> = [];
  const fingerprint = "a".repeat(64);
  const stripe = {
    charges: {
      retrieve: async () => ({ id: "ch_allocated", amount: 2_900 }),
    },
    refunds: {
      list: async () => ({ data: [], has_more: false }),
      create: async (input: Record<string, unknown>) => {
        created.push(input);
        return {
          id: "re_allocation",
          amount: 1_000,
          status: "succeeded",
          metadata: { [ALLOCATION_METADATA_KEY]: fingerprint },
        };
      },
    },
  } as unknown as Stripe;

  await ensureStripeInvoicePaymentAllocationRefunded(stripe, {
    allocationAmount: 1_000,
    allocationFingerprint: fingerprint,
    kind: "charge",
    providerId: "ch_allocated",
    baseIdempotencyKey: "account-deletion:invoice-payment:test",
  });

  assert.deepEqual(created, [
    {
      charge: "ch_allocated",
      amount: 1_000,
      reason: "requested_by_customer",
      metadata: { [ALLOCATION_METADATA_KEY]: fingerprint },
    },
  ]);
});

test("ambiguous partial refunds cannot satisfy an invoice allocation", async () => {
  let createCalls = 0;
  const stripe = {
    charges: {
      retrieve: async () => ({ id: "ch_ambiguous", amount: 2_900 }),
    },
    refunds: {
      list: async () => ({
        data: [{ id: "re_untagged", amount: 1_000, status: "succeeded" }],
        has_more: false,
      }),
      create: async () => {
        createCalls += 1;
      },
    },
  } as unknown as Stripe;

  await assert.rejects(
    () =>
      ensureStripeInvoicePaymentAllocationRefunded(stripe, {
        allocationAmount: 1_000,
        allocationFingerprint: "b".repeat(64),
        kind: "charge",
        providerId: "ch_ambiguous",
        baseIdempotencyKey: "account-deletion:invoice-payment:ambiguous",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "stripe_refund_incomplete"
  );
  assert.equal(createCalls, 0);
});

test("separately tagged allocations can refund the same charge", async () => {
  const fingerprints = ["c".repeat(64), "d".repeat(64)];
  const refunds: Array<{
    id: string;
    amount: number;
    status: "succeeded";
    metadata: Record<string, string>;
  }> = [];
  const stripe = {
    charges: {
      retrieve: async () => ({ id: "ch_shared", amount: 2_900 }),
    },
    refunds: {
      list: async () => ({ data: refunds, has_more: false }),
      create: async (input: {
        amount: number;
        metadata: Record<string, string>;
      }) => {
        const refund = {
          id: `re_allocation_${refunds.length + 1}`,
          amount: input.amount,
          status: "succeeded" as const,
          metadata: input.metadata,
        };
        refunds.push(refund);
        return refund;
      },
    },
  } as unknown as Stripe;

  await ensureStripeInvoicePaymentAllocationRefunded(stripe, {
    allocationAmount: 1_000,
    allocationFingerprint: fingerprints[0],
    kind: "charge",
    providerId: "ch_shared",
    baseIdempotencyKey: "account-deletion:invoice-payment:first",
  });
  await ensureStripeInvoicePaymentAllocationRefunded(stripe, {
    allocationAmount: 1_900,
    allocationFingerprint: fingerprints[1],
    kind: "charge",
    providerId: "ch_shared",
    baseIdempotencyKey: "account-deletion:invoice-payment:second",
  });

  assert.deepEqual(
    refunds.map(({ amount, metadata }) => ({ amount, metadata })),
    [
      {
        amount: 1_000,
        metadata: { [ALLOCATION_METADATA_KEY]: fingerprints[0] },
      },
      {
        amount: 1_900,
        metadata: { [ALLOCATION_METADATA_KEY]: fingerprints[1] },
      },
    ]
  );
});
