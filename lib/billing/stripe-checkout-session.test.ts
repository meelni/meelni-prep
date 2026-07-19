import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import {
  findAuthoritativeSubscriptionCheckoutSession,
  findSubscriptionCheckoutSessionForInvoice,
} from "./stripe-checkout-session";

const INPUT = {
  subscriptionId: "sub_checkout_123",
  invoiceId: "in_checkout_123",
  customerId: "cus_checkout_123",
  userId: "11111111-1111-4111-8111-111111111111",
  catalogId: "starter" as const,
  expectedPriceId: "price_starter",
};

test("finds exactly one authoritative subscription Checkout Session", async () => {
  let received: unknown;
  const stripe = fakeStripe(async (params) => {
    received = params;
    return { data: [session()], has_more: false };
  });

  await assert.doesNotReject(async () => {
    assert.deepEqual(
      await findAuthoritativeSubscriptionCheckoutSession(stripe, INPUT),
      { id: "cs_test_subscription_checkout" }
    );
  });
  assert.deepEqual(received, {
    subscription: INPUT.subscriptionId,
    status: "complete",
    limit: 100,
    expand: ["data.line_items"],
  });
});

test("resolves validated unpaid subscription-create correlation for failure truth", async () => {
  const stripe = fakeStripe(async () => ({
    data: [session({ payment_status: "unpaid" })],
    has_more: false,
  }));
  assert.deepEqual(
    await findSubscriptionCheckoutSessionForInvoice(stripe, {
      subscriptionId: INPUT.subscriptionId,
      invoiceId: INPUT.invoiceId,
      customerId: INPUT.customerId,
      supportedPrices: new Map([[INPUT.expectedPriceId, "starter"]]),
    }),
    {
      id: "cs_test_subscription_checkout",
      userId: INPUT.userId,
      catalogId: "starter",
      priceId: INPUT.expectedPriceId,
      paymentStatus: "unpaid",
    }
  );
});

test("fails closed on incomplete or ambiguous Checkout Session inventory", async () => {
  await assert.rejects(
    findAuthoritativeSubscriptionCheckoutSession(
      fakeStripe(async () => ({ data: [session()], has_more: true })),
      INPUT
    ),
    /checkout_session_ambiguous/
  );
  await assert.rejects(
    findAuthoritativeSubscriptionCheckoutSession(
      fakeStripe(async () => ({
        data: [session(), session()],
        has_more: false,
      })),
      INPUT
    ),
    /checkout_session_ambiguous/
  );
});

test("validates every owner, provider, catalog, and line-item binding", async () => {
  const invalid = [
    { invoice: "in_other" },
    { subscription: "sub_other" },
    { customer: "cus_other" },
    { client_reference_id: "foreign-user" },
    { metadata: { userId: INPUT.userId, catalogId: "pro" } },
    { line_items: { data: [], has_more: false } },
    {
      line_items: {
        data: [{ price: { id: "price_other" }, quantity: 1, currency: "usd" }],
        has_more: false,
      },
    },
  ];

  for (const overrides of invalid) {
    await assert.rejects(
      findAuthoritativeSubscriptionCheckoutSession(
        fakeStripe(async () => ({
          data: [session(overrides)],
          has_more: false,
        })),
        INPUT
      ),
      /checkout_session_invalid/
    );
  }
});

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_subscription_checkout",
    status: "complete",
    payment_status: "paid",
    mode: "subscription",
    subscription: INPUT.subscriptionId,
    invoice: INPUT.invoiceId,
    customer: INPUT.customerId,
    client_reference_id: INPUT.userId,
    metadata: { userId: INPUT.userId, catalogId: INPUT.catalogId },
    currency: "usd",
    line_items: {
      data: [
        {
          price: { id: INPUT.expectedPriceId },
          quantity: 1,
          currency: "usd",
        },
      ],
      has_more: false,
    },
    ...overrides,
  };
}

function fakeStripe(
  list: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
): Stripe {
  return {
    checkout: { sessions: { list } },
  } as unknown as Stripe;
}
