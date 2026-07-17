import assert from "node:assert/strict";
import test from "node:test";

import { decodeFeedbackResponseOrThrow } from "./feedback-response";

test("component response boundary rejects unknown and malformed lifecycle payloads", () => {
  for (const payload of [
    null,
    {},
    { status: "invented", retryable: false },
    { status: "pending", retryable: "sometimes" },
    { status: "completed", retryable: false, feedback: null },
  ]) {
    assert.throws(
      () => decodeFeedbackResponseOrThrow(payload),
      /unsupported response/
    );
  }
});

test("component response boundary returns a decoded lifecycle response", () => {
  assert.deepEqual(
    decodeFeedbackResponseOrThrow({ status: "processing", retryable: true }),
    { status: "processing", retryable: true }
  );
});
