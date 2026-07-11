import assert from "node:assert/strict";
import test from "node:test";

import {
  compareStripeSubscriptionEventCursors,
  mayApplyStripeSubscriptionResource,
  stripeSubscriptionCursorMayApply,
  stripeSubscriptionEventCursor,
} from "./stripe-subscription-event-order";

function cursor(type: string, id: string, created = 1_000) {
  return stripeSubscriptionEventCursor({ type, id, created } as never);
}

function proof(
  resourceCreated = 900,
  eventId = "evt_created",
  eventCreated = resourceCreated
) {
  return {
    resourceCreatedAt: new Date(resourceCreated * 1_000),
    createdEventCursor: cursor(
      "customer.subscription.created",
      eventId,
      eventCreated
    ),
  };
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

test("only a created event with newer proof may replace another resource", () => {
  for (const eventType of [
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ]) {
    assert.equal(
      mayApplyStripeSubscriptionResource({
        currentResourceId: "sub_new",
        currentStatus: "active",
        currentResourceProof: proof(),
        retiredResourceIds: ["sub_retired"],
        candidateResourceId: "sub_old",
        candidateResourceProof: proof(1_000),
        eventType,
      }),
      false
    );
  }
  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_old",
      currentStatus: "canceled",
      currentResourceProof: proof(900, "evt_old_created"),
      retiredResourceIds: [],
      candidateResourceId: "sub_new",
      candidateResourceProof: proof(1_000, "evt_new_created"),
      eventType: "customer.subscription.created",
    }),
    true
  );
  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_first_winner",
      currentStatus: "active",
      currentResourceProof: proof(1_000, "evt_first_winner"),
      retiredResourceIds: ["sub_old"],
      candidateResourceId: "sub_maximal_winner",
      candidateResourceProof: proof(1_001, "evt_maximal_winner"),
      eventType: "customer.subscription.created",
    }),
    true,
    "a retry must supersede an active but older concurrent winner"
  );
});

test("a canceled resource cursor cannot suppress a same-second replacement", () => {
  const oldDeletion = cursor(
    "customer.subscription.deleted",
    "evt_old_deleted"
  );
  const replacementCreation = cursor(
    "customer.subscription.created",
    "evt_new_created"
  );

  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_old",
      currentStatus: "canceled",
      currentResourceProof: proof(900, "evt_old_created"),
      retiredResourceIds: [],
      candidateResourceId: "sub_new",
      candidateResourceProof: {
        resourceCreatedAt: new Date(1_000_000),
        createdEventCursor: replacementCreation,
      },
      eventType: "customer.subscription.created",
    }),
    true
  );
  assert.ok(
    compareStripeSubscriptionEventCursors(replacementCreation, oldDeletion) < 0,
    "the old cursor would suppress the replacement if compared across resources"
  );
  assert.equal(
    stripeSubscriptionCursorMayApply({
      currentResourceId: "sub_old",
      candidateResourceId: "sub_new",
      currentCursor: oldDeletion,
      candidateCursor: replacementCreation,
    }),
    true
  );
  assert.equal(
    stripeSubscriptionCursorMayApply({
      currentResourceId: "sub_old",
      candidateResourceId: "sub_old",
      currentCursor: oldDeletion,
      candidateCursor: replacementCreation,
    }),
    false
  );
});

test("cross-resource replacement requires durable monotonic creation proof", () => {
  const base = {
    currentResourceId: "sub_current",
    currentStatus: "canceled",
    currentResourceProof: proof(1_000, "evt_current_created", 1_001),
    retiredResourceIds: ["sub_retired"],
    eventType: "customer.subscription.created",
  } as const;

  assert.equal(
    mayApplyStripeSubscriptionResource({
      ...base,
      candidateResourceId: "sub_retired",
      candidateResourceProof: proof(2_000, "evt_retired_replay", 2_000),
    }),
    false
  );
  assert.equal(
    mayApplyStripeSubscriptionResource({
      ...base,
      currentResourceProof: null,
      candidateResourceId: "sub_unproven",
      candidateResourceProof: proof(2_000),
    }),
    false
  );
  assert.equal(
    mayApplyStripeSubscriptionResource({
      ...base,
      candidateResourceId: "sub_older",
      candidateResourceProof: proof(999, "evt_stale_created", 2_000),
    }),
    false
  );
  assert.equal(
    mayApplyStripeSubscriptionResource({
      ...base,
      candidateResourceId: "sub_newer",
      candidateResourceProof: proof(1_001, "evt_newer_created", 1_001),
    }),
    true
  );
});

test("same-second resources use durable created-event order", () => {
  const currentProof = proof(1_000, "evt_Z", 1_001);
  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_current",
      currentStatus: "canceled",
      currentResourceProof: currentProof,
      retiredResourceIds: [],
      candidateResourceId: "sub_same_second_newer",
      candidateResourceProof: proof(1_000, "evt_a", 1_001),
      eventType: "customer.subscription.created",
    }),
    true
  );
  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_current",
      currentStatus: "canceled",
      currentResourceProof: currentProof,
      retiredResourceIds: [],
      candidateResourceId: "sub_same_second_older",
      candidateResourceProof: proof(1_000, "evt_A", 1_001),
      eventType: "customer.subscription.created",
    }),
    false
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
