import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewStartStageEvent,
  classifyInterviewStartLatency,
  INTERVIEW_START_SLOS,
  reportInterviewStartStage,
} from "./interview-start-slo";

test("interview start SLO boundaries classify equality as breached", () => {
  assert.equal(
    classifyInterviewStartLatency("canonical_readiness", 9_999),
    "within_target"
  );
  assert.equal(
    classifyInterviewStartLatency("canonical_readiness", 10_000),
    "above_target"
  );
  assert.equal(
    classifyInterviewStartLatency("canonical_readiness", 25_000),
    "above_upper_bound"
  );
  assert.equal(classifyInterviewStartLatency("launch_request", -1), null);
});

test("server stage reporting emits only the closed content-free event", () => {
  const captured: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => captured.push(args);

  try {
    reportInterviewStartStage({
      stage: "livekit_dispatch_verification",
      outcome: "succeeded",
      durationMs: 321.4,
    });
  } finally {
    console.info = original;
  }

  assert.equal(captured.length, 1);
  const event = JSON.parse(String(captured[0]?.[0])) as Record<string, unknown>;
  assert.deepEqual(Object.keys(event).sort(), [
    "durationMs",
    "event",
    "latencyClass",
    "outcome",
    "sloTargetMs",
    "sloUpperBoundMs",
    "stage",
    "version",
  ]);
  assert.equal(event.stage, "livekit_dispatch_verification");
});

test("start stage events contain only closed operational fields", () => {
  const event = buildInterviewStartStageEvent({
    stage: "presence_reconciliation",
    outcome: "delayed",
    durationMs: 3_200.4,
  });

  assert.deepEqual(event, {
    event: "meelni_interview_start_stage",
    version: 1,
    stage: "presence_reconciliation",
    outcome: "delayed",
    durationMs: 3_200,
    sloTargetMs: INTERVIEW_START_SLOS.presence_reconciliation.targetMs,
    sloUpperBoundMs: INTERVIEW_START_SLOS.presence_reconciliation.upperBoundMs,
    latencyClass: "above_upper_bound",
  });
  assert.deepEqual(Object.keys(event ?? {}).sort(), [
    "durationMs",
    "event",
    "latencyClass",
    "outcome",
    "sloTargetMs",
    "sloUpperBoundMs",
    "stage",
    "version",
  ]);
});
