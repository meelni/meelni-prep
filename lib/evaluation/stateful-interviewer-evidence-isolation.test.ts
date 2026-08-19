import assert from "node:assert/strict";
import test from "node:test";

import { parseInterviewBriefV2 } from "@meelni/agent";
import fixtures from "../../packages/test-fixtures/interviewer-contracts.json";
import { getDimensionCoveragePrompt } from "./dimension-coverage-prompt";
import { prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot } from "./session-validator";

test("operational traces cannot change trusted evidence or production evaluator input", () => {
  const project = (plannerTrace: unknown, toolTrace: unknown) => {
    const evidence = {
      snapshotValid: true,
      snapshotState: "complete" as const,
      turns: fixtures.canonical_transcript.map((turn) => ({
        speaker: turn.speaker as "user" | "interviewer",
        text: turn.text,
        startedAt: new Date(turn.started_at),
        endedAt: new Date(turn.ended_at),
        eventId: turn.event_id,
        contractVersion: turn.contract_version,
        writerId: turn.writer_id,
        writerGeneration: turn.writer_generation,
        sequence: turn.sequence,
        audioMs: turn.audio_duration_ms,
        section: turn.section,
        deliveryState: turn.delivery_state as
          | "delivered"
          | "partially_delivered",
      })),
      interruptions: [],
      sessionEndAt: new Date("2026-08-18T23:10:10.000Z"),
      sourceOverflow: false,
      authority: fixtures.frozen_evidence_authority as never,
      operationalTrace: { plannerTrace, toolTrace },
    };
    const prepared =
      prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
    return {
      evaluatorInput: getDimensionCoveragePrompt(
        "product_sense",
        prepared.blocks,
        prepared.projection.numericalScoreAuthority === "allowed"
      ),
      outcome: {
        eligible: prepared.eligible,
        failure: prepared.evidenceFailureReason,
        projection: prepared.projection,
      },
    };
  };

  const first = project(
    fixtures.director_recommendation,
    fixtures.tool_results
  );
  const second = project(
    { hidden_reasoning: "different and never evidence" },
    { privileged_payload: "still never evidence" }
  );
  assert.deepEqual(second, first);
});

test("the brief is privacy-bounded and preserves no coaching", () => {
  const brief = parseInterviewBriefV2(fixtures.brief);
  const keys = JSON.stringify(brief);
  for (const forbidden of [
    "candidate_identity",
    "email",
    "transcript",
    "director",
    "tool_result",
  ]) {
    assert.equal(keys.includes(forbidden), false);
  }
  assert.equal(brief.policy.coaching, "forbidden");
  assert.equal(brief.policy.hints, "forbidden");
  assert.equal(brief.policy.evaluation_timing, "post_interview_only");
  assert.deepEqual(brief.round_pack.forbidden_behaviors, [
    "coaching",
    "hinting",
    "mid_session_evaluation",
  ]);
});
