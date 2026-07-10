import assert from "node:assert/strict";
import test from "node:test";

import { shouldApplyStripeSubscriptionState } from "./stripe-event-ordering";

const at = (seconds: number) => new Date(seconds * 1000);

test("newer subscription state applies and older state is rejected", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "invoice_failed",
      eventTimestamp: at(11),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: at(10),
    }),
    true
  );
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "invoice_succeeded",
      eventTimestamp: at(9),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: at(10),
    }),
    false
  );
});

test("subscription deletion wins same-second ties in either arrival order", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "past_due",
      event: "subscription_deleted",
      eventTimestamp: at(10),
      lastEventTimestamp: at(10),
    }),
    true
  );
  for (const event of [
    "invoice_failed",
    "invoice_succeeded",
    "subscription_updated",
  ] as const) {
    assert.equal(
      shouldApplyStripeSubscriptionState({
        currentStatus: "canceled",
        event,
        eventTimestamp: at(10),
        lastEventTimestamp: at(10),
      }),
      false
    );
  }
});

test("a new subscription can replace a canceled subscription", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "canceled",
      currentStripeSubscriptionId: "sub_old",
      event: "subscription_created",
      eventTimestamp: at(11),
      incomingStripeSubscriptionId: "sub_new",
      lastEventTimestamp: at(10),
    }),
    true
  );
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "canceled",
      currentStripeSubscriptionId: "sub_old",
      event: "subscription_created",
      eventTimestamp: at(10),
      incomingStripeSubscriptionId: "sub_new",
      lastEventTimestamp: at(10),
    }),
    true
  );
});

test("a stale creation cannot replace a distinct active subscription", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "subscription_created",
      eventTimestamp: at(11),
      incomingStripeSubscriptionId: "sub_old",
      lastEventTimestamp: at(10),
    }),
    false
  );
});

test("old subscription events cannot mutate a new subscription in same-second permutations", () => {
  // New-subscription-first: an old deletion arriving afterward is ignored.
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_new",
      event: "subscription_deleted",
      eventTimestamp: at(10),
      incomingStripeSubscriptionId: "sub_old",
      lastEventTimestamp: at(10),
    }),
    false
  );

  // Old-deletion-first: the new creation is allowed to replace the canceled
  // resource at the same Stripe timestamp.
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "canceled",
      currentStripeSubscriptionId: "sub_old",
      event: "subscription_created",
      eventTimestamp: at(10),
      incomingStripeSubscriptionId: "sub_new",
      lastEventTimestamp: at(10),
    }),
    true
  );

  for (const event of [
    "invoice_failed",
    "invoice_succeeded",
    "subscription_updated",
  ] as const) {
    assert.equal(
      shouldApplyStripeSubscriptionState({
        currentStatus: "active",
        currentStripeSubscriptionId: "sub_new",
        event,
        eventTimestamp: at(11),
        incomingStripeSubscriptionId: "sub_old",
        lastEventTimestamp: at(10),
      }),
      false
    );
  }
});

test("an uncorrelated invoice fails closed for a resource-scoped subscription", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "invoice_failed",
      eventTimestamp: at(11),
      incomingStripeSubscriptionId: null,
      lastEventTimestamp: at(10),
    }),
    false
  );
});

test("an invoice without a subscription reference cannot mutate an unscoped legacy row", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: null,
      event: "invoice_succeeded",
      eventTimestamp: at(11),
      incomingStripeSubscriptionId: null,
      lastEventTimestamp: at(10),
    }),
    false
  );
});

test("a creation scopes and reactivates a legacy canceled row without a provider id", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "canceled",
      currentStripeSubscriptionId: null,
      event: "subscription_created",
      eventTimestamp: at(10),
      incomingStripeSubscriptionId: "sub_new",
      lastEventTimestamp: at(10),
    }),
    true
  );
});

test("resource-specific events fail closed for a legacy row without a provider id", () => {
  for (const event of [
    "invoice_failed",
    "invoice_succeeded",
    "subscription_deleted",
    "subscription_updated",
  ] as const) {
    assert.equal(
      shouldApplyStripeSubscriptionState({
        currentStatus: "active",
        currentStripeSubscriptionId: null,
        event,
        eventTimestamp: at(11),
        incomingStripeSubscriptionId: "sub_unknown",
        lastEventTimestamp: at(10),
      }),
      false
    );
  }
});

test("an older duplicate deletion cannot regress the terminal timestamp", () => {
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "canceled",
      currentStripeSubscriptionId: "sub_current",
      event: "subscription_deleted",
      eventTimestamp: at(9),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: at(10),
    }),
    false
  );
});
