import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY,
  FEEDBACK_GENERATION_FAILED,
  classifyProviderInvocationFailure,
  getEvaluationFailureCode,
  getProviderRetryAfterMs,
} from "./scorer";

test("evaluation maps provider authentication status to a stable code", () => {
  const sentinel = "PRIVATE_PROVIDER_SENTINEL_do_not_persist";
  const error = Object.assign(new Error(sentinel), { status: 401 });

  const code = getEvaluationFailureCode(error);

  assert.equal(code, FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY);
  assert.equal(code.includes(sentinel), false);
});

test("evaluation maps arbitrary provider content to a generic stable code", () => {
  const sentinel = "PRIVATE_PROVIDER_SENTINEL_do_not_persist";

  assert.equal(
    getEvaluationFailureCode(new Error(sentinel)),
    FEEDBACK_GENERATION_FAILED
  );
});

test("provider classification retains bounded Retry-After without payloads", () => {
  const error = Object.assign(new Error("PRIVATE_PROVIDER_SENTINEL"), {
    status: 429,
    headers: { "retry-after": "2.5" },
  });

  assert.equal(getProviderRetryAfterMs(error), 2_500);
  assert.deepEqual(classifyProviderInvocationFailure(error), {
    kind: "provider_rate_limited",
    httpStatus: 429,
    retryAfterMs: 2_500,
  });
});
