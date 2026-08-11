import assert from "node:assert/strict";
import test from "node:test";

import { FEEDBACK_ELIGIBILITY_POLICY } from "./feedback-eligibility";

test("feedback eligibility depends on substantive evidence breadth only", () => {
  assert.deepEqual(FEEDBACK_ELIGIBILITY_POLICY.partial, {
    minSubstantiveResponses: 1,
  });
  assert.deepEqual(FEEDBACK_ELIGIBILITY_POLICY.full, {
    minSubstantiveResponses: 5,
  });
});
