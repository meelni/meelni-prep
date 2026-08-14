import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { mapStripeSubscriptionStatus } from "./stripe-subscription-status";

test("every Stripe subscription status maps explicitly and non-paying states fail closed", () => {
  const cases: Array<
    [Stripe.Subscription.Status, ReturnType<typeof mapStripeSubscriptionStatus>]
  > = [
    ["active", "active"],
    ["canceled", "canceled"],
    ["incomplete", "paused"],
    ["incomplete_expired", "paused"],
    ["past_due", "past_due"],
    ["paused", "paused"],
    ["trialing", "trialing"],
    ["unpaid", "paused"],
  ];

  for (const [stripeStatus, expected] of cases) {
    assert.equal(mapStripeSubscriptionStatus(stripeStatus), expected);
  }
});

test("a future provider status fails closed instead of granting active access", () => {
  assert.equal(
    mapStripeSubscriptionStatus(
      "future_non_entitling_status" as Stripe.Subscription.Status
    ),
    "paused"
  );
});
