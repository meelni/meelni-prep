import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { getStripeLogicalEventKey } from "./stripe-event-identity";

function event(id: string, type: Stripe.Event.Type, object: object) {
  return { id, type, data: { object } } as Stripe.Event;
}

test("distinct Stripe Events converge on the same immutable transition", () => {
  const first = event("evt_1", "invoice.payment_succeeded", { id: "in_1" });
  const second = event("evt_2", "invoice.payment_succeeded", { id: "in_1" });
  assert.equal(
    getStripeLogicalEventKey(first),
    getStripeLogicalEventKey(second)
  );
});

test("adjustment lifecycle deliveries converge by provider object and direction", () => {
  const object = {
    id: "re_1",
    payment_intent: "pi_1",
    amount: 500,
    currency: "usd",
    status: "succeeded",
  };
  assert.equal(
    getStripeLogicalEventKey(event("evt_1", "refund.created", object)),
    getStripeLogicalEventKey(event("evt_2", "refund.updated", object))
  );
  assert.notEqual(
    getStripeLogicalEventKey(event("evt_2", "refund.updated", object)),
    getStripeLogicalEventKey(
      event("evt_3", "refund.failed", { ...object, status: "failed" })
    )
  );
});

test("mutable subscription updates are never logically deduplicated", () => {
  assert.equal(
    getStripeLogicalEventKey(
      event("evt_1", "customer.subscription.updated", { id: "sub_1" })
    ),
    null
  );
});
