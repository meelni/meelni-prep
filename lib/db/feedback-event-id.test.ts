import assert from "node:assert/strict";
import test from "node:test";

import { feedbackGenerationEventId } from "./feedback-event-id";

test("feedback event IDs are stable within an attempt and unique across retries", () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440000";

  assert.equal(
    feedbackGenerationEventId(sessionId, 1),
    `feedback/generate.requested:${sessionId}:1`
  );
  assert.notEqual(
    feedbackGenerationEventId(sessionId, 1),
    feedbackGenerationEventId(sessionId, 2)
  );
});

test("feedback event IDs reject invalid attempt values", () => {
  assert.throws(() => feedbackGenerationEventId("session", -1));
  assert.throws(() => feedbackGenerationEventId("session", 1.5));
});
