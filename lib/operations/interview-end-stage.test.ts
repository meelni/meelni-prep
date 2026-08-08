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
      slo: "feedback_dispatch",
    },
    (value) => {
      serialized = value;
    }
  );

  assert.deepEqual(event, {
    event: "meelni_interview_end_stage",
    version: 3,
    occurredAt: event?.occurredAt,
    stage: "feedback_dispatch",
    outcome: "succeeded",
    durationMs: 43,
    reason: null,
    correlationId: "550e8400-e29b-41d4-a716-446655440000",
    slo: "feedback_dispatch",
    sloTargetMs: 5_000,
    sloUpperBoundMs: 30_000,
    latencyClass: "within_target",
  });
  assert.ok(Number.isFinite(Date.parse(event?.occurredAt ?? "")));
  assert.doesNotMatch(serialized, /transcript|userId|provider/i);
});

test("interview-end timing accepts only privacy-safe reason codes", () => {
  const event = reportInterviewEndStage({
    stage: "runtime_settlement",
    outcome: "deferred",
    durationMs: 20_000,
    reason: "runtime_timeout",
  });

  assert.equal(event?.reason, "runtime_timeout");
  assert.equal(
    reportInterviewEndStage({
      stage: "runtime_settlement",
      outcome: "failed",
      durationMs: 1,
      reason: "customer transcript leaked" as never,
    }),
    null
  );
});

test("interview-end timing classifies upper-bound breaches without content", () => {
  const event = reportInterviewEndStage({
    stage: "feedback_generation",
    outcome: "succeeded",
    durationMs: 90_000,
    slo: "feedback_completion",
  });

  assert.equal(event?.latencyClass, "above_upper_bound");
  assert.equal(event?.sloTargetMs, 45_000);
  assert.equal(event?.sloUpperBoundMs, 90_000);
});

test("lifecycle reads emit against the interactive hard deadline", () => {
  const event = reportInterviewEndStage({
    stage: "lifecycle_read",
    outcome: "failed",
    durationMs: 8_000,
    reason: "feedback_read_failed",
    slo: "lifecycle_read",
  });

  assert.equal(event?.latencyClass, "above_upper_bound");
  assert.equal(event?.sloTargetMs, 5_000);
  assert.equal(event?.sloUpperBoundMs, 8_000);
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
  assert.equal(
    reportInterviewEndStage({
      stage: "accept",
      outcome: "succeeded",
      durationMs: 1,
      slo: "toString" as never,
    }),
    null
  );
});
