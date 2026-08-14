import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeedbackGenerationStageAttemptStore,
  type FeedbackGenerationStageAttemptRepository,
} from "./feedback-generation-stage-attempts";

const ATTEMPT = {
  sessionId: "session-fixture",
  generationEventId: "event-current",
  workflowAttempt: 1,
  operation: "claim" as const,
  stage: "claim" as const,
  providerAttempt: null,
  outcome: "succeeded" as const,
  retryable: false,
  startedAt: new Date("2026-08-14T06:00:00.000Z"),
  completedAt: new Date("2026-08-14T06:00:00.010Z"),
  durationMs: 10,
  remainingBudgetMs: 89_000,
  environmentClass: "test" as const,
};

test("stage attempt writes are exact-event fenced and replay idempotent", async () => {
  const inserted = new Map<string, unknown>();
  const records: unknown[] = [];
  const repository: FeedbackGenerationStageAttemptRepository = {
    async withFeedbackLock(sessionId, work) {
      assert.equal(sessionId, "session-fixture");
      return work(
        {
          feedbackId: "feedback-fixture",
          generationEventId: "event-current",
        },
        async (record) => {
          records.push(record);
          const key = [
            record.feedbackId,
            record.generationEventFence,
            record.workflowAttempt,
            record.operation,
            record.providerAttempt ?? "none",
          ].join(":");
          const existing = inserted.get(key);
          if (existing === undefined) {
            inserted.set(key, record);
            return "inserted";
          }
          return JSON.stringify(existing) === JSON.stringify(record)
            ? "duplicate"
            : "conflict";
        }
      );
    },
  };
  const store = createFeedbackGenerationStageAttemptStore(repository);

  assert.equal(await store.record(ATTEMPT), "inserted");
  assert.equal(await store.record(ATTEMPT), "duplicate");
  assert.equal(records.length, 2);
  assert.equal(JSON.stringify(records).includes("session-fixture"), false);
  assert.equal(JSON.stringify(records).includes("event-current"), false);

  assert.equal(
    await store.record({
      ...ATTEMPT,
      completedAt: new Date("2026-08-14T06:00:00.011Z"),
      durationMs: 11,
    }),
    "conflict"
  );
  assert.equal(records.length, 3);

  assert.equal(
    await store.record({
      ...ATTEMPT,
      generationEventId: "event-stale",
    }),
    "fenced"
  );
  assert.equal(records.length, 3);
});

test("a batch uses one raw-event fence but persists only hashed fences", async () => {
  let locks = 0;
  const records: unknown[] = [];
  const repository: FeedbackGenerationStageAttemptRepository = {
    async withFeedbackLock(_sessionId, work) {
      locks += 1;
      return work(
        {
          feedbackId: "feedback-fixture",
          generationEventId: "event-current",
        },
        async (record) => {
          records.push(record);
          return "inserted";
        }
      );
    },
  };
  const store = createFeedbackGenerationStageAttemptStore(repository);

  assert.deepEqual(
    await store.recordMany([
      ATTEMPT,
      { ...ATTEMPT, operation: "authorization" },
    ]),
    ["inserted", "inserted"]
  );
  assert.equal(locks, 1);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("session-fixture"), false);
  assert.equal(serialized.includes("event-current"), false);
  assert.match(serialized, /v1:[a-f0-9]{64}/);
});

test("stage attempt store rejects malformed metadata before locking", async () => {
  let locks = 0;
  const repository: FeedbackGenerationStageAttemptRepository = {
    async withFeedbackLock(_sessionId, work) {
      locks += 1;
      return work(
        {
          feedbackId: "feedback-fixture",
          generationEventId: "event-current",
        },
        async () => "inserted"
      );
    },
  };
  const store = createFeedbackGenerationStageAttemptStore(repository);

  assert.equal(
    await store.record({ ...ATTEMPT, durationMs: 90_001 }),
    "rejected"
  );
  assert.equal(locks, 0);
});
