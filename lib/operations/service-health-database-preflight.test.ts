import assert from "node:assert/strict";
import test from "node:test";

import { runServiceHealthDatabasePreflight } from "./service-health-database-preflight";

const NOW = new Date("2026-07-19T23:00:00.000Z");

test("database preflight proves the exact evidence reader with a closed receipt", async () => {
  let captured: { staleBefore: Date; queryTimeoutMs: number } | undefined;
  const result = await runServiceHealthDatabasePreflight({
    reader: {
      read: async (input) => {
        captured = input;
        return {
          feedbackDispatchStale: false,
          feedbackDispatchFailed: false,
          stripeWebhookStale: false,
          stripeWebhookFailed: false,
        };
      },
    },
    now: () => NOW,
    timeoutMs: 2_000,
  });

  assert.deepEqual(result, {
    preflight: "meelni_service_health_database",
    version: 1,
    checkedAt: NOW.toISOString(),
    status: "passed",
    code: "database_evidence_query_ready",
  });
  assert.equal(captured?.staleBefore.toISOString(), "2026-07-19T22:50:00.000Z");
  assert.equal(captured?.queryTimeoutMs, 1_900);
});

test("database preflight redacts provider failures into one fixed code", async () => {
  const result = await runServiceHealthDatabasePreflight({
    reader: {
      read: async () => {
        throw new Error("postgres://user:password@customer.example/private");
      },
    },
    now: () => NOW,
  });

  assert.equal(result.code, "database_evidence_query_failed");
  assert.doesNotMatch(
    JSON.stringify(result),
    /postgres|password|customer|private/i
  );
});

test("database preflight distinguishes its bounded timeout without leaking work", async () => {
  const result = await runServiceHealthDatabasePreflight({
    reader: { read: () => new Promise(() => {}) },
    now: () => NOW,
    timeoutMs: 5,
  });

  assert.equal(result.code, "database_evidence_query_timeout");
});
