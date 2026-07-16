import assert from "node:assert/strict";
import test from "node:test";

import { FEEDBACK_ELIGIBILITY_POLICY } from "./feedback-eligibility";

test("feedback eligibility exposes one canonical partial and full threshold policy", () => {
  assert.deepEqual(FEEDBACK_ELIGIBILITY_POLICY.partial, {
    minTurns: 5,
    minDurationMinutes: 5,
    minSubstantiveResponses: 3,
  });
  assert.deepEqual(FEEDBACK_ELIGIBILITY_POLICY.full, {
    minTurns: 20,
    minDurationMinutes: 20,
    minSubstantiveResponses: 5,
  });
});
