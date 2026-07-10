import assert from "node:assert/strict";
import test from "node:test";

import { generateFeedback } from "./scorer";

test("feedback failures expose only stable errors and never write raw console output", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalConsoleError = console.error;
  const writes: unknown[][] = [];
  delete process.env.OPENAI_API_KEY;
  console.error = (...args) => writes.push(args);

  try {
    await assert.rejects(
      () =>
        generateFeedback("product_sense", [
          { speaker: "candidate", text: "safe fixture transcript" },
        ]),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "feedback_evaluation_key_missing" &&
        error.cause === undefined
    );
    assert.deepEqual(writes, []);
  } finally {
    console.error = originalConsoleError;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
