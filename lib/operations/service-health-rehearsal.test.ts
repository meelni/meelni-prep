import assert from "node:assert/strict";
import test from "node:test";

import { verifyServiceHealthRehearsalEvidence } from "./service-health-rehearsal";

test("rehearsal evidence binds a safe ordered lifecycle to one stable hash", () => {
  const evidence = fixture();
  const first = verifyServiceHealthRehearsalEvidence(evidence);
  const reordered = Object.fromEntries(Object.entries(evidence).reverse());
  const second = verifyServiceHealthRehearsalEvidence(reordered);

  assert.equal(first.status, "verified");
  assert.match(first.evidenceSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(first.evidenceSha256, second.evidenceSha256);
  assert.equal(first.release, "a".repeat(40));
});

test("rehearsal evidence rejects unsafe claims, bad order, and extra fields", () => {
  const unsafe = [
    { ...fixture(), environment: "production" },
    { ...fixture(), productionMutation: true },
    { ...fixture(), customerDataUsed: true },
    {
      ...fixture(),
      cleanup: {
        ...fixture().cleanup,
        completedAt: "2026-07-19T23:01:30.000Z",
      },
    },
    { ...fixture(), leakedCustomerEmail: "customer@example.com" },
  ];

  for (const evidence of unsafe) {
    const result = verifyServiceHealthRehearsalEvidence(evidence);
    assert.equal(result.status, "rejected");
    assert.equal(result.release, null);
    assert.equal(result.evidenceSha256, null);
    assert.doesNotMatch(JSON.stringify(result), /customer@example/i);
  }
});

function fixture() {
  return {
    contract: "meelni_service_health_rehearsal_evidence",
    version: 1,
    environment: "preview",
    release: "a".repeat(40),
    relaunchGate: "off",
    productionMutation: false,
    customerDataUsed: false,
    target: { originSha256: "b".repeat(64), path: "/api/health" },
    baseline: {
      observedAt: "2026-07-19T23:00:00.000Z",
      result: synthetic("passed", "health_endpoint_healthy"),
    },
    disturbance: {
      kind: "preview_synthetic_stripe_webhook_failure",
      fixtureSha256: "c".repeat(64),
      inducedAt: "2026-07-19T23:01:00.000Z",
    },
    degradation: {
      observedAt: "2026-07-19T23:02:00.000Z",
      result: synthetic("failed", "health_endpoint_degraded"),
    },
    alert: {
      receiptSha256: "d".repeat(64),
      receivedAt: "2026-07-19T23:03:00.000Z",
      acknowledgedAt: "2026-07-19T23:04:00.000Z",
    },
    cleanup: {
      receiptSha256: "e".repeat(64),
      completedAt: "2026-07-19T23:05:00.000Z",
    },
    recovery: {
      observedAt: "2026-07-19T23:06:00.000Z",
      result: synthetic("passed", "health_endpoint_healthy"),
    },
  };
}

function synthetic(status: "passed" | "failed", code: string) {
  return {
    synthetic: "meelni_service_health",
    version: 1,
    status,
    code,
  };
}
