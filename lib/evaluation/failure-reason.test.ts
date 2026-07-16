import assert from "node:assert/strict";
import test from "node:test";

import { getEvaluationFailureReason } from "./failure-reason";

test("evaluation failure reason identifies missing OpenAI key through error cause", () => {
  const error = new Error("Failed to generate feedback", {
    cause: new Error("OPENAI_API_KEY environment variable is required"),
  });

  assert.equal(
    getEvaluationFailureReason(error),
    "OpenAI API key is missing or not loaded. Set OPENAI_API_KEY and retry feedback generation."
  );
});

test("evaluation failure reason recognizes the stable missing-configuration code", () => {
  assert.equal(
    getEvaluationFailureReason(
      new Error("feedback_configuration_missing_openai_key")
    ),
    "OpenAI API key is missing or not loaded. Set OPENAI_API_KEY and retry feedback generation."
  );
});

test("evaluation failure reason recognizes the stable invalid-key code", () => {
  assert.equal(
    getEvaluationFailureReason(
      new Error("feedback_configuration_invalid_openai_key")
    ),
    "OpenAI API key was rejected. Rotate OPENAI_API_KEY and retry feedback generation."
  );
});

test("evaluation failure reason keeps generic provider failures sanitized", () => {
  assert.equal(
    getEvaluationFailureReason(new Error("Unexpected provider response")),
    "Feedback evaluation failed. Check worker logs and retry."
  );
});
