import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_V2_EVALUATE_STEP_ID,
  FEEDBACK_V2_FETCH_TRANSCRIPT_STEP_ID,
  FEEDBACK_V2_SAVE_STEP_ID,
} from "./feedback-generation-step-contract";

test("feedback v2 uses durable step identities distinct from cached v1 output", () => {
  assert.equal(FEEDBACK_V2_FETCH_TRANSCRIPT_STEP_ID, "fetch-transcript-v2");
  assert.equal(FEEDBACK_V2_EVALUATE_STEP_ID, "evaluate-session-v2");
  assert.equal(FEEDBACK_V2_SAVE_STEP_ID, "save-feedback-v2");
  assert.notEqual(FEEDBACK_V2_FETCH_TRANSCRIPT_STEP_ID, "fetch-transcript");
  assert.notEqual(FEEDBACK_V2_EVALUATE_STEP_ID, "evaluate-session");
  assert.notEqual(FEEDBACK_V2_SAVE_STEP_ID, "save-feedback");
});
