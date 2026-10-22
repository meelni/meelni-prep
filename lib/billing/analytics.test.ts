import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBillingAnalyticsProperties,
  buildBillingPaymentAdjustedAnalytics,
  deliverBillingAnalytics,
  trackBillingCreditGranted,
} from "./analytics";

test("billing analytics entry points expose awaitable delivery", async () => {
  const publicKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const pseudonymKey = process.env.ANALYTICS_PSEUDONYM_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.ANALYTICS_PSEUDONYM_KEY;
  try {
    const delivery = trackBillingCreditGranted({
      userId: "raw-user",
      credits: 1,
    });
    assert.equal(typeof delivery.then, "function");
    await delivery;
  } finally {
    if (publicKey !== undefined)
      process.env.NEXT_PUBLIC_POSTHOG_KEY = publicKey;
    if (pseudonymKey !== undefined) {
      process.env.ANALYTICS_PSEUDONYM_KEY = pseudonymKey;
    }
  }
});

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

test("billing analytics retain aggregates without operational identifiers", () => {
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

  assert.equal(JSON.stringify(properties).includes("private"), false);
  assert.equal(JSON.stringify(properties).includes("raw-user"), false);
  assert.equal(properties.catalog_id, "starter");
  assert.equal(properties.credits, 5);
  assert.equal(properties.balance_after, 7);
  assert.equal(properties.reason_code, "unexpected_error");
});

test("billing delivery resolves consent before optional provider delivery", async () => {
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
