import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubscriptionCreditPolicy } from "./subscription-credit-policy";

const GRACE_END = new Date("2026-08-13T12:00:00.000Z");

test("past-due subscription credits are bounded by the recorded grace cutoff", () => {
  const policy = resolveSubscriptionCreditPolicy({
    status: "past_due",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
    gracePeriodEnd: GRACE_END,
  });

  assert.deepEqual(policy, {
    restricted: true,
    availableThrough: GRACE_END,
  });
});

test("active cancellation remains bounded by the provider period end", () => {
  const periodEnd = new Date("2026-09-01T00:00:00.000Z");

  assert.deepEqual(
    resolveSubscriptionCreditPolicy({
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd,
      gracePeriodEnd: null,
    }),
    { restricted: true, availableThrough: periodEnd }
  );
});

test("past-due state without a valid grace cutoff and all paused/unknown states deny subscription credits", () => {
  for (const [status, cancelAtPeriodEnd] of [
    ["past_due", false],
    ["paused", false],
    ["paused", true],
    ["unexpected_provider_state", true],
  ] as const) {
    const policy = resolveSubscriptionCreditPolicy({
      status,
      cancelAtPeriodEnd,
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
      gracePeriodEnd: null,
    });

    assert.deepEqual(policy, { restricted: true, availableThrough: null });
  }
});
