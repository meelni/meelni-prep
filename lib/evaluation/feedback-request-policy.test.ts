import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_MAX_COMPLETION_TOKENS,
  FEEDBACK_MAX_SDK_RETRIES,
  FEEDBACK_REQUEST_TIMEOUT_MS,
  getFeedbackProviderRequestFields,
} from "./scorer";

test("production feedback has a bounded provider latency and output budget", () => {
  assert.equal(FEEDBACK_MAX_SDK_RETRIES, 0);
  assert.equal(FEEDBACK_REQUEST_TIMEOUT_MS, 75_000);
  assert.deepEqual(getFeedbackProviderRequestFields(), {
    max_completion_tokens: FEEDBACK_MAX_COMPLETION_TOKENS,
  });
});

test("explicit evaluation budgets remain supported", () => {
  assert.deepEqual(getFeedbackProviderRequestFields(800), {
    max_completion_tokens: 800,
  });
});
