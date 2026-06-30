import assert from "node:assert/strict";
import test from "node:test";

import { getFeedbackEvaluationModel } from "./model-config";

test("feedback evaluation defaults to a current OpenAI model", () => {
  assert.equal(getFeedbackEvaluationModel({}), "gpt-5.1");
});

test("feedback evaluation model can be overridden by environment", () => {
  assert.equal(
    getFeedbackEvaluationModel({ OPENAI_FEEDBACK_MODEL: "gpt-4.1" }),
    "gpt-4.1"
  );
});
