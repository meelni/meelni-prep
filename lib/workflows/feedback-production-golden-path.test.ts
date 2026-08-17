import assert from "node:assert/strict";
import test from "node:test";

import { createFeedbackGoldenPathFixtures } from "@meelni/test-fixtures";

import {
  FEEDBACK_PRODUCTION_SCENARIO_STAGES,
  runFeedbackProductionScenario,
} from "./feedback-production-scenario";

test("provider-free production-shaped feedback lifecycle converges across all fixtures", async () => {
  const outcomes = new Map<string, string>();
  const rubricRoutes = new Set<string>();

  for (const fixture of createFeedbackGoldenPathFixtures()) {
    const first = await runFeedbackProductionScenario(fixture);
    const replayedFromScratch = await runFeedbackProductionScenario(fixture);

    assert.deepEqual(replayedFromScratch, first, fixture.id);
    assert.deepEqual(first.replay.writerRegistration, "existing");
    assert.deepEqual(first.replay.interviewEnd, "existing");
    rubricRoutes.add(fixture.roundType);

    if (fixture.expectedOutcome === "feedback_generated") {
      assert.equal(first.lifecycle.status, "completed", fixture.id);
      if (first.lifecycle.status === "completed") {
        assert.notEqual(first.lifecycle.feedback.kind, "invalid", fixture.id);
      }
      assert.deepEqual(first.stages, FEEDBACK_PRODUCTION_SCENARIO_STAGES);
      assert.equal(first.replay.dispatch, "already_sent");
      assert.equal(first.replay.generation, "already_terminal");
      assert.equal(first.replay.lateFailureApplied, false);
      assert.equal(first.replay.persistenceWrites, 1);
      assert.ok(first.durableStepRoundTrips.length > 0, fixture.id);
      outcomes.set(fixture.id, "feedback_generated");
    } else {
      assert.equal(first.lifecycle.status, "skipped", fixture.id);
      assert.deepEqual(first.stages, [
        "writer_registration",
        "transcript_ingest",
        "marker_ingest",
        "settlement_ingest",
        "end_frozen_evidence",
        "api_view_model",
      ]);
      assert.equal(first.replay.dispatch, "not_required");
      assert.equal(first.replay.generation, "not_required");
      assert.equal(first.replay.persistenceWrites, 0);
      outcomes.set(fixture.id, fixture.expectedOutcome);
    }
  }

  assert.equal(outcomes.get("short-rich"), "feedback_generated");
  assert.equal(outcomes.get("long-silent"), "no_reviewable_answer");
  assert.equal(outcomes.get("no-answer"), "no_reviewable_answer");
  assert.equal(
    outcomes.get("turn-marker-6m14"),
    "transcript_integrity_degraded"
  );
  assert.equal(outcomes.get("corrupt"), "transcript_integrity_degraded");
  assert.equal(outcomes.get("spoken-evidence-limited"), "feedback_generated");
  assert.deepEqual(
    rubricRoutes,
    new Set(["product_sense", "behavioral", "strategy", "execution"])
  );
});

test("durable steps JSON-round-trip sparse and malformed terminal results", async () => {
  const fixture = createFeedbackGoldenPathFixtures().find(
    (candidate) => candidate.id === "normal-product-sense"
  );
  assert.ok(fixture);

  const sparse = await runFeedbackProductionScenario(fixture, {
    evaluatorCoverage: "sparse",
  });
  assert.equal(sparse.lifecycle.status, "completed");
  assert.ok(
    sparse.durableStepRoundTrips.includes("evaluate-feedback-attempt-1")
  );

  const malformed = await runFeedbackProductionScenario(fixture, {
    persistedResultMutation: "unknown_schema_version",
  });
  assert.equal(malformed.lifecycle.status, "completed");
  if (malformed.lifecycle.status === "completed") {
    assert.equal(malformed.lifecycle.feedback.kind, "invalid");
  }
});
