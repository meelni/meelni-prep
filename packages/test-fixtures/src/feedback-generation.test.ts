import assert from "node:assert/strict";
import test from "node:test";

import { FEEDBACK_GENERATION_FIXTURE } from "./feedback-generation";

test("feedback generation fixture preserves a unique retry identity", () => {
  assert.notEqual(
    FEEDBACK_GENERATION_FIXTURE.events.initial,
    FEEDBACK_GENERATION_FIXTURE.events.retry
  );
  assert.ok(
    FEEDBACK_GENERATION_FIXTURE.clock.retryRequestedAt >
      FEEDBACK_GENERATION_FIXTURE.clock.processingStartedAt
  );
});
