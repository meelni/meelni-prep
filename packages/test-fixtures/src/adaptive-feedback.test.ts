import assert from "node:assert/strict";
import test from "node:test";

import {
  isTranscriptEvent,
  isTranscriptInterruptionMarker,
  isTranscriptRuntimeSettlement,
  isTranscriptRuntimeWriterRegistration,
} from "@meelni/agent";

import { createAdaptiveFeedbackRegressionFixtures } from "./adaptive-feedback";

test("adaptive feedback fixtures are synthetic, canonical, and requirement-complete", () => {
  const fixtures = createAdaptiveFeedbackRegressionFixtures();
  const coverage = new Set(fixtures.flatMap((fixture) => fixture.covers));

  for (const required of [
    "clarification",
    "challenge",
    "transition",
    "interruption_with_verified_prefix",
    "interruption_without_verified_prefix",
    "deadline_warning",
    "deadline_close",
    "graceful_explicit_close",
    "aborted_output",
    "generated_but_not_delivered_prompt",
    "repeated_related_probe",
    "malformed_metadata",
    "cross_question_boundary",
    "cross_round_boundary",
    "cross_section_boundary",
    "verified_prefix_partial",
  ]) {
    assert.equal(coverage.has(required), true, required);
  }

  assert.deepEqual(
    new Set(
      fixtures.flatMap((fixture) => [
        fixture.expected.current.outcome,
        fixture.expected.adaptive.outcome,
      ])
    ),
    new Set(["scorecard", "coaching_review", "unable_to_review"])
  );

  for (const fixture of fixtures) {
    assert.equal(fixture.provenance, "fully_synthetic", fixture.id);
    for (const scenario of [fixture.current, fixture.adaptive]) {
      assert.equal(
        isTranscriptRuntimeWriterRegistration(scenario.writerRegistration),
        true,
        scenario.id
      );
      assert.ok(scenario.events.every(isTranscriptEvent), scenario.id);
      assert.ok(
        scenario.markers.every(isTranscriptInterruptionMarker),
        scenario.id
      );
      assert.equal(
        isTranscriptRuntimeSettlement(scenario.settlement),
        true,
        scenario.id
      );
    }
  }
});

test("runtime-only adaptive payloads cannot masquerade as canonical evidence", () => {
  for (const fixture of createAdaptiveFeedbackRegressionFixtures()) {
    for (const payload of fixture.runtimeOnly.transcriptAdjacentPayloads) {
      assert.equal(isTranscriptEvent(payload), false, fixture.id);
      assert.equal(isTranscriptInterruptionMarker(payload), false, fixture.id);
    }
    const canonicalBytes = JSON.stringify({
      current: [fixture.current.events, fixture.current.markers],
      adaptive: [fixture.adaptive.events, fixture.adaptive.markers],
    });
    for (const sentinel of fixture.runtimeOnly.sentinels) {
      assert.equal(canonicalBytes.includes(sentinel), false, sentinel);
    }
  }
});
