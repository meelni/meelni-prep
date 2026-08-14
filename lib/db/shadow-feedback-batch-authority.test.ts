import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  projectTrustedClosedAnswerBlocks,
  type DimensionCoverageProviderSelection,
  type FeedbackDimension,
  type FrozenAnswerBlockAuthorityV1,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";
import { createAnswerBlockSegmentationFixture } from "@meelni/test-fixtures";

import { normalizeShadowFeedbackBatchAuthority } from "./shadow-feedback-batch-authority";

const SESSION_ID = "44700000-0000-4000-8000-000000000447";
const FREEZE_ANCHOR_MS = Date.parse("2026-08-14T10:00:00.000Z");
const MODEL_VERSION = "synthetic-provider-model-that-must-not-escape.v1";

test("completed validated feedback becomes exact content-free batch authority", () => {
  const projection = trustedProjection();
  const result = validatedFeedback(projection);
  const authority = normalizeShadowFeedbackBatchAuthority(feedbackRow(result), {
    sessionId: SESSION_ID,
    projection,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  });

  assert.ok(authority);
  assert.equal(authority.contractVersion, "feedback.shadow-batch-authority.v1");
  assert.equal(authority.sessionId, SESSION_ID);
  assert.equal(authority.completedAtMs, FREEZE_ANCHOR_MS + 5_000);
  assert.equal(authority.mode, "full_scorecard");
  for (const dimension of FEEDBACK_DIMENSIONS) {
    assert.equal(authority.dimensions[dimension].score, 8);
    assert.equal(authority.dimensions[dimension].facets.length, 2);
    assert.ok(
      authority.dimensions[dimension].facets.every(({ facetCode }) =>
        ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[dimension].facets.some(
          ({ code }) => code === facetCode
        )
      )
    );
  }

  const serialized = JSON.stringify(authority);
  for (const forbidden of [
    result.summary,
    projection.trustedBlocks[0]!.responseText,
    result.promptVersion,
    result.rubricVersion,
    result.schemaVersion,
    result.modelVersion,
    "evidenceText",
    "facetLabel",
    "provider",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("non-completed, malformed, stale, and invalid-timing rows fail closed", () => {
  const projection = trustedProjection();
  const result = validatedFeedback(projection);
  const row = feedbackRow(result);
  const input = {
    sessionId: SESSION_ID,
    projection,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  };

  const staleProjection: TrustedAnswerBlockProjection = {
    ...projection,
    trustedBlocks: projection.trustedBlocks.map((block, index) =>
      index === 0
        ? { ...block, responseText: `${block.responseText} stale` }
        : block
    ),
  };
  const cases = [
    { row: { ...row, status: "pending" }, input },
    { row: { ...row, dimensionCoverage: { malformed: true } }, input },
    { row, input: { ...input, projection: staleProjection } },
    {
      row: {
        ...row,
        processingStartedAt: new Date(FREEZE_ANCHOR_MS - 10_000),
        processingDurationMs: 1_000,
      },
      input,
    },
  ];
  for (const candidate of cases) {
    assert.equal(
      normalizeShadowFeedbackBatchAuthority(
        candidate.row as Parameters<
          typeof normalizeShadowFeedbackBatchAuthority
        >[0],
        candidate.input
      ),
      null
    );
  }
});

function trustedProjection(): TrustedAnswerBlockProjection {
  const fixture = createAnswerBlockSegmentationFixture(1);
  const sequenced = fixture.events.filter(
    (
      event
    ): event is Extract<
      (typeof fixture.events)[number],
      { sequence: number }
    > => "sequence" in event
  );
  const terminal = fixture.events.at(-1)!;
  const authority: FrozenAnswerBlockAuthorityV1 = {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState: "complete",
    cutoffAtMs:
      terminal.kind === "session_end" || terminal.kind === "cutoff"
        ? terminal.occurredAtMs
        : 0,
    writers: [
      {
        contractVersion: 1,
        writerId: sequenced[0]!.writerId,
        writerGeneration: sequenced[0]!.writerGeneration,
        committedSequence: sequenced.length,
        integrityState: "healthy",
        settlementState: "settled",
      },
    ],
  };
  const projection = projectTrustedClosedAnswerBlocks(
    fixture.events,
    authority
  );
  assert.equal(projection.status, "complete");
  return projection;
}

function validatedFeedback(projection: TrustedAnswerBlockProjection) {
  const answerBlockRef = projection.trustedBlocks[0]!.answerBlockId;
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    dimensions[dimension] = dimensionSelection(dimension, answerBlockRef);
  }
  return parseDimensionCoverageProviderSelection(
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
      modelVersion: MODEL_VERSION,
      allowNumericalScores: true,
    }
  );
}

function dimensionSelection(
  dimension: FeedbackDimension,
  answerBlockRef: string
) {
  return {
    score: 8,
    evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
      dimension
    ].facets.map(({ code }) => ({ facetCode: code, answerBlockRef })),
  };
}

function feedbackRow(result: ReturnType<typeof validatedFeedback>) {
  return {
    sessionId: SESSION_ID,
    status: "completed",
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    rubricVersion: result.rubricVersion,
    modelVersion: result.modelVersion,
    feedbackRoundType: result.roundType,
    evaluationState: result.evaluationState,
    feedbackMode: result.mode,
    dimensionCoverage: result.dimensions,
    verifiedPrefixScope: null,
    overallScore: String(result.overallScore),
    summary: result.summary,
    processingStartedAt: new Date(FREEZE_ANCHOR_MS + 1_000),
    processingDurationMs: 4_000,
  } as Parameters<typeof normalizeShadowFeedbackBatchAuthority>[0];
}
