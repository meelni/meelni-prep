import assert from "node:assert/strict";
import test from "node:test";

import { reportInterviewEndStage } from "./interview-end-stage";

test("interview-end timing accepts only bounded stage metadata", () => {
  let serialized = "";
  const event = reportInterviewEndStage(
    {
      stage: "feedback_dispatch",
      outcome: "succeeded",
      durationMs: 42.6,
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    },
    (value) => {
      serialized = value;
    }
  );

  assert.deepEqual(event, {
    event: "meelni_interview_end_stage",
    version: 1,
    occurredAt: event?.occurredAt,
    stage: "feedback_dispatch",
    outcome: "succeeded",
    durationMs: 43,
    correlationId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assert.ok(Number.isFinite(Date.parse(event?.occurredAt ?? "")));
  assert.doesNotMatch(serialized, /transcript|userId|provider/i);
});

test("invalid timing is rejected without logging", () => {
  let writes = 0;
  const event = reportInterviewEndStage(
    {
      stage: "accept",
      outcome: "succeeded",
      durationMs: Number.NaN,
    },
    () => {
      writes += 1;
    }
  );
  assert.equal(event, null);
  assert.equal(writes, 0);
});
