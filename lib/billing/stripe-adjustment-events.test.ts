import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { normalizeStripeBillingAdjustmentEvent } from "./stripe-adjustment-events";

function stripeEvent(
  id: string,
  type: Stripe.Event.Type,
  object: Record<string, unknown>
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

test("refund lifecycle events converge on provider object and direction", () => {
  const refund = {
    id: "re_test",
    object: "refund",
    status: "pending",
    payment_intent: "pi_test",
    charge: "ch_test",
    amount: 500,
    currency: "usd",
  };
  const created = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_created", "refund.created", refund)
  );
  const updated = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_updated", "refund.updated", {
      ...refund,
      status: "succeeded",
    })
  );
  const failed = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_failed", "refund.failed", {
      ...refund,
      status: "failed",
    })
  );

  assert.equal(created.providerAdjustmentId, "re_test");
  assert.equal(updated.providerAdjustmentId, "re_test");
  assert.equal(created.direction, "withdraw");
  assert.equal(updated.direction, "withdraw");
  assert.notEqual(created.stripeEventId, updated.stripeEventId);
  assert.equal(failed.direction, "reinstate");
});

test("legacy charge.refunded uses the newest Refund identity", () => {
  const normalized = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_charge", "charge.refunded", {
      id: "ch_test",
      object: "charge",
      payment_intent: "pi_test",
      amount_refunded: 900,
      currency: "usd",
      refunds: {
        data: [
          { id: "re_old", created: 10, amount: 400, currency: "usd" },
          { id: "re_new", created: 20, amount: 500, currency: "usd" },
        ],
      },
    })
  );
  assert.equal(normalized.providerAdjustmentId, "re_new");
  assert.equal(normalized.amountInCents, 500);
  assert.equal(normalized.direction, "withdraw");
});

test("dispute funds and closed events normalize reversible directions", () => {
  const dispute = {
    id: "dp_test",
    object: "dispute",
    payment_intent: "pi_test",
    charge: "ch_test",
    amount: 1900,
    currency: "usd",
    reason: "fraudulent",
    status: "under_review",
  };
  const created = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_dp_created", "charge.dispute.created", dispute)
  );
  const withdrawn = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_dp_withdrawn", "charge.dispute.funds_withdrawn", dispute)
  );
  const reinstated = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_dp_reinstated", "charge.dispute.funds_reinstated", {
      ...dispute,
      status: "won",
    })
  );
  const closedWon = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_dp_closed", "charge.dispute.closed", {
      ...dispute,
      status: "won",
    })
  );
  const closedLost = normalizeStripeBillingAdjustmentEvent(
    stripeEvent("evt_dp_lost", "charge.dispute.closed", {
      ...dispute,
      status: "lost",
    })
  );

  assert.equal(created.providerAdjustmentId, "dp_test");
  assert.equal(withdrawn.providerAdjustmentId, "dp_test");
  assert.equal(created.direction, "withdraw");
  assert.equal(withdrawn.direction, "withdraw");
  assert.equal(reinstated.direction, "reinstate");
  assert.equal(closedWon.direction, "reinstate");
  assert.equal(closedLost.direction, "withdraw");
});
