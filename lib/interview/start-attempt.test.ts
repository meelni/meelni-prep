import assert from "node:assert/strict";
import test from "node:test";

import {
  clearInterviewStartAttempt,
  getOrCreateInterviewStartAttempt,
  INTERVIEW_START_ATTEMPT_MAX_AGE_MS,
  INTERVIEW_START_ATTEMPT_MAX_RECORDS,
  INTERVIEW_START_ATTEMPT_STORAGE_KEY,
  isDefinitiveInterviewStartFailure,
  parseInterviewStartSessionId,
} from "./start-attempt";

const ATTEMPT_A = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_B = "10000000-0000-4000-8000-000000000002";
const NOW = 1_000_000;

test("keeps one stable attempt across equivalent intents and reloads", () => {
  const storage = createStorage();
  const first = getOrCreateInterviewStartAttempt(
    { roundType: "product_sense", config: { duration: 30, speed: 1 } },
    storage,
    () => ATTEMPT_A,
    () => NOW
  );
  const replay = getOrCreateInterviewStartAttempt(
    { config: { speed: 1, duration: 30 }, roundType: "product_sense" },
    storage,
    () => ATTEMPT_B,
    () => NOW
  );

  assert.equal(first, ATTEMPT_A);
  assert.equal(replay, ATTEMPT_A);
});

test("keeps ambiguous intents independently until their attempt succeeds", () => {
  const storage = createStorage();
  const ids = [ATTEMPT_A, ATTEMPT_B];
  const first = getOrCreateInterviewStartAttempt(
    { roundType: "product_sense" },
    storage,
    () => ids.shift()!,
    () => NOW
  );
  const second = getOrCreateInterviewStartAttempt(
    { roundType: "strategy" },
    storage,
    () => ids.shift()!,
    () => NOW + 1
  );

  clearInterviewStartAttempt(first, storage, () => NOW + 1);

  assert.equal(second, ATTEMPT_B);
  assert.deepEqual(
    JSON.parse(storage.getItem(INTERVIEW_START_ATTEMPT_STORAGE_KEY)!),
    [
      {
        intent: '{"roundType":"strategy"}',
        startAttemptId: ATTEMPT_B,
        createdAt: NOW + 1,
      },
    ]
  );
});

test("ages out abandoned attempts while retaining a recoverable current intent", () => {
  const storage = createStorage();
  const first = getOrCreateInterviewStartAttempt(
    { roundType: "product_sense" },
    storage,
    () => ATTEMPT_A,
    () => NOW
  );
  const atBoundary = getOrCreateInterviewStartAttempt(
    { roundType: "product_sense" },
    storage,
    () => ATTEMPT_B,
    () => NOW + INTERVIEW_START_ATTEMPT_MAX_AGE_MS
  );
  const afterExpiry = getOrCreateInterviewStartAttempt(
    { roundType: "product_sense" },
    storage,
    () => ATTEMPT_B,
    () => NOW + INTERVIEW_START_ATTEMPT_MAX_AGE_MS + 1
  );

  assert.equal(atBoundary, first);
  assert.equal(afterExpiry, ATTEMPT_B);
  assert.deepEqual(
    JSON.parse(storage.getItem(INTERVIEW_START_ATTEMPT_STORAGE_KEY)!),
    [
      {
        intent: '{"roundType":"product_sense"}',
        startAttemptId: ATTEMPT_B,
        createdAt: NOW + INTERVIEW_START_ATTEMPT_MAX_AGE_MS + 1,
      },
    ]
  );
});

test("bounds stored attempts to the newest recoverable intents", () => {
  const storage = createStorage();

  for (
    let index = 0;
    index < INTERVIEW_START_ATTEMPT_MAX_RECORDS + 2;
    index += 1
  ) {
    getOrCreateInterviewStartAttempt(
      { roundType: `round-${index}` },
      storage,
      () => `10000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      () => NOW + index
    );
  }

  const records = JSON.parse(
    storage.getItem(INTERVIEW_START_ATTEMPT_STORAGE_KEY)!
  ) as Array<{ intent: string }>;
  assert.equal(records.length, INTERVIEW_START_ATTEMPT_MAX_RECORDS);
  assert.equal(records[0]?.intent, '{"roundType":"round-6"}');
  assert.equal(records.at(-1)?.intent, '{"roundType":"round-2"}');
});

test("accepts only UUID session IDs from successful start responses", () => {
  assert.equal(
    parseInterviewStartSessionId({ sessionId: ATTEMPT_A }),
    ATTEMPT_A
  );
  assert.equal(parseInterviewStartSessionId({ sessionId: "not-a-uuid" }), null);
  assert.equal(parseInterviewStartSessionId({}), null);
  assert.equal(parseInterviewStartSessionId(null), null);
});

test("only classifies non-retryable client errors as definitive", () => {
  assert.equal(isDefinitiveInterviewStartFailure(402, {}), true);
  assert.equal(
    isDefinitiveInterviewStartFailure(409, { retryable: true }),
    false
  );
  assert.equal(isDefinitiveInterviewStartFailure(429, {}), false);
  assert.equal(isDefinitiveInterviewStartFailure(503, {}), false);
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}
