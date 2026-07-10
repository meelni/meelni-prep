import assert from "node:assert/strict";
import test from "node:test";

import { recordQuestionUsage } from "./questions";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const QUESTION_ID = "650e8400-e29b-41d4-a716-446655440000";

test("question usage ignores only duplicate evidence without raw logging", async () => {
  const writes: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args) => writes.push(args);

  try {
    await recordQuestionUsage(
      SESSION_ID,
      QUESTION_ID,
      failingDatabase({ code: "23505", detail: `${SESSION_ID}:${QUESTION_ID}` })
    );
    assert.deepEqual(writes, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test("question usage converts database failures into one stable error", async () => {
  const writes: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args) => writes.push(args);

  try {
    await assert.rejects(
      () =>
        recordQuestionUsage(
          SESSION_ID,
          QUESTION_ID,
          failingDatabase({
            code: "XX000",
            detail: `raw ${SESSION_ID}:${QUESTION_ID}`,
          })
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "question_usage_record_failed" &&
        error.cause === undefined
    );
    assert.deepEqual(writes, []);
  } finally {
    console.error = originalConsoleError;
  }
});

function failingDatabase(error: unknown) {
  return {
    insert: () => ({
      values: async () => {
        throw error;
      },
    }),
  } as never;
}
