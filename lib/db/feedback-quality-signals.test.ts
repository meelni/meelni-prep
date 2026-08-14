import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  projectTrustedClosedAnswerBlocks,
  type DimensionCoverageProviderSelection,
  type FeedbackQualitySignalView,
} from "@meelni/core";
import { createAnswerBlockTurn } from "@meelni/test-fixtures";

import {
  deriveFeedbackQualityOutcomeFromSource,
  hydrateFeedbackQualitySignalRow,
} from "./feedback-quality-signals";

test("quality signal row hydration exposes only the owner-safe closed view", () => {
  const hydrated = hydrateFeedbackQualitySignalRow({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "00000000-0000-4000-8000-000000000003",
    feedbackId: "00000000-0000-4000-8000-000000000004",
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    reviewOutcome: "coaching_review",
    response: "not_helpful",
    reason: "score_withholding_unclear",
    revision: 2,
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    updatedAt: new Date("2026-08-13T12:01:00.000Z"),
  });
  assert.deepEqual(hydrated, {
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    outcome: "coaching_review",
    response: "not_helpful",
    reason: "score_withholding_unclear",
    revision: 2,
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:01:00.000Z",
  } satisfies FeedbackQualitySignalView);
  assert.equal("feedbackId" in hydrated!, false);
  assert.equal("sessionId" in hydrated!, false);
  assert.equal("userId" in hydrated!, false);
});

test("quality signal row hydration rejects incompatible reason combinations", () => {
  const hydrated = hydrateFeedbackQualitySignalRow({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "00000000-0000-4000-8000-000000000003",
    feedbackId: "00000000-0000-4000-8000-000000000004",
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    reviewOutcome: "coaching_review",
    response: "not_helpful",
    reason: "score_explanation_unclear",
    revision: 1,
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    updatedAt: new Date("2026-08-13T12:00:00.000Z"),
  });
  assert.equal(hydrated, null);
});

test("quality controls accept only a recomputed exact verified-prefix source", () => {
  const projection = projectTrustedClosedAnswerBlocks(
    [
      createAnswerBlockTurn({
        eventId: "quality-writer:1",
        writerId: "quality-writer",
        sequence: 1,
        speaker: "interviewer",
        text: "Which customer problem would you prioritize?",
        startedAtMs: 1_000,
        audioDurationMs: 500,
      }),
      createAnswerBlockTurn({
        eventId: "quality-writer:2",
        writerId: "quality-writer",
        sequence: 2,
        speaker: "user",
        text: "I would prioritize working parents because handoff failures create repeated weekly coordination pain.",
        startedAtMs: 2_000,
        audioDurationMs: 500,
      }),
      createAnswerBlockTurn({
        eventId: "quality-writer:3",
        writerId: "quality-writer",
        sequence: 3,
        speaker: "interviewer",
        text: "Which assumption would you test next?",
        startedAtMs: 3_000,
        audioDurationMs: 500,
      }),
      { kind: "session_end", occurredAtMs: 4_000 },
    ],
    {
      contractVersion: "frozen-answer-block-authority.v1",
      snapshotState: "partial",
      cutoffAtMs: 4_000,
      writers: [
        {
          contractVersion: 1,
          writerId: "quality-writer",
          writerGeneration: 1,
          committedSequence: 3,
          integrityState: "healthy",
          settlementState: "missing",
        },
      ],
    }
  );
  assert.equal(projection.status, "verified_prefix");
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    dimensions[dimension] = {
      score: dimension === "structure" ? 8 : null,
      evidence:
        dimension === "structure"
          ? ROUND_DIMENSION_COVERAGE_CONFIG.product_sense.structure.facets.map(
              (facet) => ({
                facetCode: facet.code,
                answerBlockRef: projection.trustedBlocks[0]!.answerBlockId,
              })
            )
          : [],
    };
  }
  const result = parseDimensionCoverageProviderSelection(
    {
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      roundType: "product_sense",
      dimensions,
    },
    {
      roundType: "product_sense",
      answerBlocks: projection.trustedBlocks,
      modelVersion: "quality-signal-v2-test",
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );
  assert.equal(result.schemaVersion, "feedback.dimension-coverage.v2");
  const source = {
    id: "feedback-v2",
    sessionId: "session-v2",
    structureScore: result.dimensions.structure.score,
    clarityScore: result.dimensions.clarity.score,
    insightScore: result.dimensions.insight.score,
    communicationScore: result.dimensions.communication.score,
    leadershipScore: result.dimensions.leadership.score,
    overallScore: result.overallScore,
    strengths: null,
    improvements: null,
    drills: [],
    summary: result.summary,
    rubricVersion: result.rubricVersion,
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    modelVersion: result.modelVersion,
    evaluationState: result.evaluationState,
    feedbackMode: result.mode,
    feedbackRoundType: result.roundType,
    dimensionCoverage: result.dimensions,
    verifiedPrefixScope: result.verifiedPrefixScope,
    createdAt: new Date("2026-08-14T12:00:00.000Z"),
  };
  const presentation = {
    evidenceTurns: [],
    answerBlocks: projection.trustedBlocks,
    expectedRoundType: "product_sense" as const,
    frozenEvidenceState: "partial" as const,
    verifiedPrefixProjection: projection,
  };

  assert.equal(
    deriveFeedbackQualityOutcomeFromSource(source, presentation),
    "partial_scorecard"
  );
  assert.equal(
    deriveFeedbackQualityOutcomeFromSource(
      {
        ...source,
        verifiedPrefixScope: {
          ...result.verifiedPrefixScope,
          excludedTailBlockCount: 999,
        },
      },
      presentation
    ),
    null
  );
});
