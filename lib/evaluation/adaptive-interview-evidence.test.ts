import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  type CandidateAnswerBlock,
  type DimensionCoverageFeedbackResult,
  type DimensionCoverageProviderSelection,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";
import {
  createAdaptiveFeedbackRegressionFixtures,
  type AdaptiveFeedbackExpectedBlock,
  type AdaptiveFeedbackExpectedOutcome,
  type FeedbackGoldenPathFixture,
} from "@meelni/test-fixtures/adaptive-feedback";

import { getDimensionCoveragePrompt } from "./dimension-coverage-prompt";
import {
  prepareCandidateAnswerBlockEvidenceFromTurns,
  prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot,
} from "./session-validator";

test("adaptive transcript fixtures preserve deterministic answer attribution and accepted outcomes", () => {
  for (const fixture of createAdaptiveFeedbackRegressionFixtures()) {
    const current = projectScenario(fixture.current);
    const adaptive = projectScenario(fixture.adaptive);
    const currentAcceptedText = acceptedSpokenTextProjection(fixture.current);
    const adaptiveAcceptedText = acceptedSpokenTextProjection(fixture.adaptive);

    assert.equal(
      JSON.stringify(adaptiveAcceptedText) !==
        JSON.stringify(currentAcceptedText),
      fixture.acceptedDeliveredTranscriptChanged,
      `${fixture.id}:accepted-spoken-text-change`
    );

    assertProjection(
      current,
      fixture.expected.current,
      `${fixture.id}:current`
    );
    assertProjection(
      adaptive,
      fixture.expected.adaptive,
      `${fixture.id}:adaptive`
    );

    if (fixture.acceptedDeliveredTranscriptChanged) {
      assert.notDeepEqual(
        adaptive.ordinaryBlocks,
        current.ordinaryBlocks,
        fixture.id
      );
    } else {
      assert.deepEqual(
        adaptive.ordinaryBlocks,
        current.ordinaryBlocks,
        `${fixture.id}:ordinary-blocks`
      );
      assert.deepEqual(
        adaptive.evaluatorBlocks,
        current.evaluatorBlocks,
        `${fixture.id}:evaluator-blocks`
      );
      assert.equal(
        adaptive.evaluatorPrompt,
        current.evaluatorPrompt,
        `${fixture.id}:evaluator-prompt`
      );
      assert.equal(adaptive.outcome, current.outcome, `${fixture.id}:outcome`);
    }
  }
});

test("only canonical delivered text reaches evaluator input and exact evidence quotes", () => {
  for (const fixture of createAdaptiveFeedbackRegressionFixtures()) {
    for (const [variant, scenario] of [
      ["current", fixture.current],
      ["adaptive", fixture.adaptive],
    ] as const) {
      const projected = projectScenario(scenario);
      const canonicalTexts = new Set(
        scenario.events.map((event) => event.text)
      );

      for (const block of projected.evaluatorBlocksRaw) {
        for (const source of [...block.prompt, ...block.response]) {
          assert.equal(
            canonicalTexts.has(source.text),
            true,
            `${fixture.id}:${variant}:${source.eventId}`
          );
        }
      }
      if (projected.result) {
        for (const dimension of FEEDBACK_DIMENSIONS) {
          for (const evidence of projected.result.dimensions[dimension]
            .evidence) {
            assert.equal(
              projected.evaluatorBlocksRaw.some(
                (block) => block.responseText === evidence.evidenceText
              ),
              true,
              `${fixture.id}:${variant}:${dimension}`
            );
            assert.equal(canonicalTexts.has(evidence.evidenceText), true);
          }
        }
      }

      const publicEvaluationBytes = JSON.stringify({
        evaluatorPrompt: projected.evaluatorPrompt,
        result: projected.result,
      });
      for (const sentinel of fixture.runtimeOnly.sentinels) {
        assert.equal(
          publicEvaluationBytes.includes(sentinel),
          false,
          `${fixture.id}:${variant}:${sentinel}`
        );
      }
    }
  }
});

test("clarification, challenge, transition, interruption recovery, and close never merge or duplicate candidate evidence", () => {
  for (const fixture of createAdaptiveFeedbackRegressionFixtures()) {
    const adaptive = projectScenario(fixture.adaptive);
    const responseEvents = adaptive.evaluatorBlocksRaw.flatMap((block) =>
      block.response.map((source) => source.eventId)
    );
    assert.equal(
      new Set(responseEvents).size,
      responseEvents.length,
      `${fixture.id}:duplicate-response-provenance`
    );

    for (const block of adaptive.evaluatorBlocksRaw) {
      assert.ok(block.prompt.length > 0, `${fixture.id}:prompt-bound`);
      assert.ok(block.response.length > 0, `${fixture.id}:response-bound`);
      assert.ok(
        block.prompt.every((source) => source.speaker === "interviewer")
      );
      assert.ok(block.response.every((source) => source.speaker === "user"));
    }
  }
});

interface ProjectedScenario {
  eligible: boolean;
  outcome: AdaptiveFeedbackExpectedOutcome;
  projection: TrustedAnswerBlockProjection;
  ordinaryBlocksRaw: CandidateAnswerBlock[];
  evaluatorBlocksRaw: CandidateAnswerBlock[];
  ordinaryBlocks: AdaptiveFeedbackExpectedBlock[];
  evaluatorBlocks: AdaptiveFeedbackExpectedBlock[];
  evaluatorPrompt: string | null;
  result: DimensionCoverageFeedbackResult | null;
}

function projectScenario(
  scenario: FeedbackGoldenPathFixture
): ProjectedScenario {
  const turns = scenario.events.map((event) => ({
    eventId: event.event_id,
    contractVersion: event.contract_version,
    writerId: event.writer_id,
    writerGeneration: event.writer_generation,
    sequence: event.sequence,
    speaker: event.speaker,
    text: event.text,
    startedAt: new Date(event.started_at),
    endedAt: new Date(event.ended_at),
    audioMs: event.audio_duration_ms,
    section: event.section,
    deliveryState: event.delivery_state,
  }));
  const interruptions = scenario.markers.map((marker) => ({
    eventId: marker.event_id,
    writerId: marker.writer_id,
    writerGeneration: marker.writer_generation,
    sequence: marker.sequence,
    speaker: marker.speaker,
    occurredAt: new Date(marker.occurred_at),
    reason: marker.reason,
  }));
  const sessionEndAt = new Date(scenario.settlement.settled_at);
  const snapshotState =
    scenario.ingestSettlement && scenario.markers.length === 0
      ? ("complete" as const)
      : ("partial" as const);
  const committedSequence = scenario.events.length + scenario.markers.length;
  const ordinary = prepareCandidateAnswerBlockEvidenceFromTurns(turns, {
    interruptions,
    sessionEndAt,
  });
  const trusted = prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot({
    snapshotValid: true,
    snapshotState,
    turns,
    interruptions,
    sessionEndAt,
    sourceOverflow: false,
    authority: {
      contractVersion: FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
      snapshotState,
      cutoffAtMs: sessionEndAt.getTime(),
      writers: [
        {
          contractVersion: 1,
          writerId: scenario.writerId,
          writerGeneration: 1,
          committedSequence,
          integrityState: "healthy",
          settlementState: scenario.ingestSettlement ? "settled" : "missing",
        },
      ],
    },
  });
  if (!trusted.eligible) {
    return {
      eligible: false,
      outcome: "unable_to_review",
      projection: trusted.projection,
      ordinaryBlocksRaw: ordinary.blocks,
      evaluatorBlocksRaw: [],
      ordinaryBlocks: summarizeBlocks(ordinary.blocks),
      evaluatorBlocks: [],
      evaluatorPrompt: null,
      result: null,
    };
  }

  const allowNumericalScores =
    trusted.projection.numericalScoreAuthority === "allowed";
  const selection = completeCoverageSelection(
    scenario.roundType,
    trusted.blocks[0]!.answerBlockId,
    allowNumericalScores
  );
  const result = parseDimensionCoverageProviderSelection(selection, {
    roundType: scenario.roundType,
    answerBlocks: trusted.blocks,
    modelVersion: "synthetic-adaptive-feedback-regression-v1",
    allowNumericalScores,
    ...(trusted.projection.status === "verified_prefix"
      ? { verifiedPrefixProjection: trusted.projection }
      : {}),
  });
  return {
    eligible: true,
    outcome: result.mode === "full_scorecard" ? "scorecard" : "coaching_review",
    projection: trusted.projection,
    ordinaryBlocksRaw: ordinary.blocks,
    evaluatorBlocksRaw: trusted.blocks,
    ordinaryBlocks: summarizeBlocks(ordinary.blocks),
    evaluatorBlocks: summarizeBlocks(trusted.blocks),
    evaluatorPrompt: getDimensionCoveragePrompt(
      scenario.roundType,
      trusted.blocks,
      allowNumericalScores
    ),
    result,
  };
}

function completeCoverageSelection(
  roundType: FeedbackGoldenPathFixture["roundType"],
  answerBlockRef: string,
  allowNumericalScores: boolean
): DimensionCoverageProviderSelection {
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    dimensions[dimension] = {
      score: allowNumericalScores ? 8 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG[roundType][
        dimension
      ].facets.map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType,
    dimensions,
  };
}

function summarizeBlocks(
  blocks: readonly CandidateAnswerBlock[]
): AdaptiveFeedbackExpectedBlock[] {
  return blocks.map((block) => ({
    promptText: block.promptText,
    responseText: block.responseText,
    section: block.response[0]!.section,
    closedBy: block.closedBy,
  }));
}

function acceptedSpokenTextProjection(
  scenario: FeedbackGoldenPathFixture
): Array<{ speaker: string; text: string; section: string }> {
  return scenario.events.map((event) => ({
    speaker: event.speaker,
    text: event.text,
    section: event.section,
  }));
}

function assertProjection(
  actual: ProjectedScenario,
  expected: {
    eligible: boolean;
    outcome: AdaptiveFeedbackExpectedOutcome;
    projectionStatus: TrustedAnswerBlockProjection["status"];
    ordinaryBlocks: AdaptiveFeedbackExpectedBlock[];
    evaluatorBlocks: AdaptiveFeedbackExpectedBlock[];
  },
  label: string
): void {
  assert.equal(actual.eligible, expected.eligible, `${label}:eligible`);
  assert.equal(actual.outcome, expected.outcome, `${label}:outcome`);
  assert.equal(
    actual.projection.status,
    expected.projectionStatus,
    `${label}:projection-status`
  );
  assert.deepEqual(
    actual.ordinaryBlocks,
    expected.ordinaryBlocks,
    `${label}:ordinary-blocks`
  );
  assert.deepEqual(
    actual.evaluatorBlocks,
    expected.evaluatorBlocks,
    `${label}:evaluator-blocks`
  );
}
