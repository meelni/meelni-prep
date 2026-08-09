import assert from "node:assert/strict";
import test from "node:test";

import { buildInterviewLivenessContradictionEvent } from "./interview-liveness-contradiction";

test("readiness contradiction telemetry is content-free and duration-classed", () => {
  const observed = buildInterviewLivenessContradictionEvent({
    phase: "observed",
    durationMs: 0,
    resolution: "pending",
  });
  const resolved = buildInterviewLivenessContradictionEvent({
    phase: "resolved",
    durationMs: 31_000,
    resolution: "canonical_ready",
  });

  assert.deepEqual(observed, {
    version: 1,
    phase: "observed",
    duration_ms: 0,
    duration_class: "pending",
    resolution: "pending",
  });
  assert.deepEqual(resolved, {
    version: 1,
    phase: "resolved",
    duration_ms: 31_000,
    duration_class: "under_2m",
    resolution: "canonical_ready",
  });
  assert.deepEqual(Object.keys(resolved).sort(), [
    "duration_class",
    "duration_ms",
    "phase",
    "resolution",
    "version",
  ]);
});
