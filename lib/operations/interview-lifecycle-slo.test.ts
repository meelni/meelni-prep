import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInterviewLifecycleLatency,
  elapsedInterviewLifecycleMs,
  INTERVIEW_LIFECYCLE_SLOS,
} from "./interview-lifecycle-slo";

test("canonical interview lifecycle SLOs retain their product boundaries", () => {
  assert.deepEqual(INTERVIEW_LIFECYCLE_SLOS, {
    end_acceptance: { targetMs: 1_000, upperBoundMs: 3_000 },
    terminalization: { targetMs: 10_000, upperBoundMs: 30_000 },
    feedback_dispatch: { targetMs: 5_000, upperBoundMs: 30_000 },
    feedback_completion: { targetMs: 45_000, upperBoundMs: 90_000 },
    lifecycle_read: { targetMs: 5_000, upperBoundMs: 8_000 },
  });
});

test("latency classification is deterministic at both boundaries", () => {
  assert.equal(
    classifyInterviewLifecycleLatency("feedback_completion", 44_999),
    "within_target"
  );
  assert.equal(
    classifyInterviewLifecycleLatency("feedback_completion", 45_000),
    "above_target"
  );
  assert.equal(
    classifyInterviewLifecycleLatency("feedback_completion", 90_000),
    "above_upper_bound"
  );
  assert.equal(
    classifyInterviewLifecycleLatency("feedback_completion", Number.NaN),
    null
  );
});

test("elapsed lifecycle time is bounded and rejects malformed anchors", () => {
  const now = new Date("2026-08-08T00:01:00.000Z");
  assert.equal(
    elapsedInterviewLifecycleMs("2026-08-08T00:00:30.000Z", now),
    30_000
  );
  assert.equal(elapsedInterviewLifecycleMs("2026-08-08T00:02:00.000Z", now), 0);
  assert.equal(elapsedInterviewLifecycleMs("not-a-date", now), null);
});
