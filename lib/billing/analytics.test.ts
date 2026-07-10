import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBillingAnalyticsProperties,
  deliverBillingAnalytics,
} from "./analytics";

test("billing analytics retain aggregate facts without operational identifiers", () => {
  const properties = buildBillingAnalyticsProperties({
    userId: "raw-user",
    catalogId: "starter",
    credits: 5,
    balanceAfter: 7,
    idempotencyKey: "private-key",
    sessionId: "private-session",
    sourceId: "private-source",
    reason: "Provider said jane@example.com failed",
  });
  assert.deepEqual(properties, {
    catalog_id: "starter",
    credit_source: undefined,
    transaction_type: undefined,
    credits: 5,
    balance_after: 7,
    reason_code: "unexpected_error",
    duplicate: undefined,
  });
  assert.equal(JSON.stringify(properties).includes("private"), false);
  assert.equal(JSON.stringify(properties).includes("raw-user"), false);
});

test("billing delivery awaits consent lookup and provider flush without exposing failures", async () => {
  const calls: string[] = [];
  const consent = {
    decision: "accepted" as const,
    policyVersion: 1,
    source: "settings" as const,
    decidedAt: "2026-07-10T12:00:00.000Z",
    scope: "account" as const,
  };
  await deliverBillingAnalytics(
    "billing_credit_granted",
    { userId: "raw-user", credits: 5 },
    {
      async readConsent(userId) {
        calls.push(`consent:${userId}`);
        return consent;
      },
      async track(event, properties, subject, suppliedConsent) {
        calls.push(`capture:${event}:${String(properties.credits)}`);
        assert.deepEqual(subject, { userId: "raw-user" });
        assert.equal(suppliedConsent, consent);
        calls.push("flushed");
      },
    }
  );
  assert.deepEqual(calls, [
    "consent:raw-user",
    "capture:billing_credit_granted:5",
    "flushed",
  ]);

  await assert.doesNotReject(() =>
    deliverBillingAnalytics(
      "billing_credit_granted",
      { userId: "raw-user" },
      {
        async readConsent() {
          throw new Error("database unavailable");
        },
        async track() {
          assert.fail("capture must not run");
        },
      }
    )
  );
});
