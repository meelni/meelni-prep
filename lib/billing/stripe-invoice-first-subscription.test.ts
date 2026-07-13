import assert from "node:assert/strict";
import test from "node:test";

import type Stripe from "stripe";

import { deriveInvoiceFirstSubscriptionBootstrap } from "./stripe-invoice-first-subscription";

const START = 1_783_932_163;
const END = START + 2_592_000;

test("derives invoice-first state from one exact authoritative subscription item", () => {
  assert.deepEqual(
    deriveInvoiceFirstSubscriptionBootstrap({
      invoice: invoice(),
      paidServicePeriod: {
        priceId: "price_starter",
        periodStart: new Date(START * 1_000),
        periodEnd: new Date(END * 1_000),
      },
      supportedPrices: new Map([["price_starter", "starter"]]),
      subscription: subscription(),
      subscriptionId: "sub_first",
    }),
    {
      billingCycle: "monthly",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      catalogId: "starter",
      customerId: "cus_first",
      currentPeriodEnd: new Date(END * 1_000),
      currentPeriodStart: new Date(START * 1_000),
      priceId: "price_starter",
      resourceCreatedAt: new Date((START - 10) * 1_000),
      status: "active",
      subscriptionId: "sub_first",
      trialEnd: null,
      userId: "owner_first",
    }
  );
});

test("rejects ambiguous or conflicting invoice-first evidence", () => {
  const cases: Array<[string, Stripe.Invoice, Stripe.Subscription]> = [
    ["invoice customer", invoice({ customer: "cus_other" }), subscription()],
    [
      "invoice owner",
      invoice({ metadata: { userId: "owner_other" } }),
      subscription(),
    ],
    ["subscription owner", invoice(), subscription({ metadata: {} })],
    ["trial status", invoice(), subscription({ status: "trialing" })],
    [
      "quantity",
      invoice(),
      subscription({ items: subscriptionItems({ quantity: 2 }) }),
    ],
    [
      "item subscription",
      invoice(),
      subscription({
        items: subscriptionItems({ subscription: "sub_other" }),
      }),
    ],
    [
      "item period",
      invoice(),
      subscription({
        items: subscriptionItems({ current_period_end: END + 1 }),
      }),
    ],
    [
      "paginated items",
      invoice(),
      subscription({ items: { ...subscriptionItems(), has_more: true } }),
    ],
  ];

  for (const [name, candidateInvoice, candidateSubscription] of cases) {
    assert.throws(
      () =>
        deriveInvoiceFirstSubscriptionBootstrap({
          invoice: candidateInvoice,
          paidServicePeriod: {
            priceId: "price_starter",
            periodStart: new Date(START * 1_000),
            periodEnd: new Date(END * 1_000),
          },
          supportedPrices: new Map([["price_starter", "starter"]]),
          subscription: candidateSubscription,
          subscriptionId: "sub_first",
        }),
      { message: "stripe_invoice_subscription_bootstrap_evidence_invalid" },
      name
    );
  }
});

function invoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: "in_first",
    object: "invoice",
    billing_reason: "subscription_create",
    customer: "cus_first",
    metadata: {},
    ...overrides,
  } as unknown as Stripe.Invoice;
}

function subscription(
  overrides: Record<string, unknown> = {}
): Stripe.Subscription {
  return {
    id: "sub_first",
    object: "subscription",
    created: START - 10,
    customer: "cus_first",
    metadata: { userId: "owner_first" },
    status: "active",
    items: subscriptionItems(),
    trial_end: null,
    canceled_at: null,
    cancel_at_period_end: false,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function subscriptionItems(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        id: "si_first",
        subscription: "sub_first",
        quantity: 1,
        current_period_start: START,
        current_period_end: END,
        price: {
          id: "price_starter",
          recurring: { interval: "month" },
        },
        ...overrides,
      },
    ],
    has_more: false,
  };
}
