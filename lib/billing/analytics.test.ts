import assert from "node:assert/strict";
import test from "node:test";

import { buildBillingPaymentAdjustedAnalytics } from "./analytics";

test("settlement analytics exclude provider and internal correlation identifiers", () => {
  const rawUserId = "550e8400-e29b-41d4-a716-446655440000";
  const providerId = "dp_sensitive";
  const grantId = "grant_sensitive";
  const result = buildBillingPaymentAdjustedAnalytics({
    userId: rawUserId,
    credits: 1,
    reason: "dispute",
    duplicate: false,
    idempotencyKey: providerId,
    grantId,
    reservedCredits: 0,
    consumedCredits: 1,
    unrecoverableCredits: 0,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(rawUserId), false);
  assert.equal(serialized.includes(providerId), false);
  assert.equal(serialized.includes(grantId), false);
  assert.match(result.distinctId, /^[a-f0-9]{64}$/);
  assert.equal(
    result.distinctId,
    buildBillingPaymentAdjustedAnalytics({ userId: rawUserId }).distinctId
  );
});
