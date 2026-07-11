import assert from "node:assert/strict";
import test from "node:test";

import {
  compareStripeSubscriptionEventCursors,
  mayApplyStripeSubscriptionResource,
  stripeSubscriptionEventCursor,
} from "./stripe-subscription-event-order";

function cursor(type: string, id: string, created = 1_000) {
  return stripeSubscriptionEventCursor({ type, id, created } as never);
}

test("subscription cursors impose one total order inside a Stripe second", () => {
  const ordered = [
    cursor("invoice.payment_failed", "evt_z"),
    cursor("invoice.payment_succeeded", "evt_a"),
    cursor("customer.subscription.updated", "evt_Z"),
    cursor("customer.subscription.updated", "evt_a"),
    cursor("customer.subscription.deleted", "evt_a"),
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(
      compareStripeSubscriptionEventCursors(
        ordered[index - 1]!,
        ordered[index]!
      ) < 0
    );
  }
});

test("only a created event may replace a canceled subscription resource", () => {
  for (const eventType of [
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ]) {
    assert.equal(
      mayApplyStripeSubscriptionResource({
        currentResourceId: "sub_new",
        currentStatus: "active",
        candidateResourceId: "sub_old",
        eventType,
      }),
      false
    );
  }
  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_old",
      currentStatus: "canceled",
      candidateResourceId: "sub_new",
      eventType: "customer.subscription.created",
    }),
    true
  );
});

test("a later Stripe second always wins over event-type precedence", () => {
  assert.ok(
    compareStripeSubscriptionEventCursors(
      cursor("invoice.payment_failed", "evt_a", 1_001),
      cursor("customer.subscription.deleted", "evt_z", 1_000)
    ) > 0
  );
});
