import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES,
  createAnswerBlockSegmentationFixture,
  createTotalScorecardSafeMarkerFixture,
} from "@meelni/test-fixtures";
import { deriveCandidateAnswerBlocks } from "./answer-blocks";
import { projectTrustedClosedAnswerBlocks } from "./trusted-answer-block-authority";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  parsePersistedDimensionCoverageFeedback,
  type DimensionCoverageFeedbackResult,
  type DimensionCoverageProviderSelection,
} from "./feedback-dimension-coverage";
import type { FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";

const MODEL = "synthetic-evaluator-v1";

function assertVerifiedPrefixResult(
  result: DimensionCoverageFeedbackResult
): asserts result is Extract<
  DimensionCoverageFeedbackResult,
  { schemaVersion: typeof FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION }
> {
  assert.equal(result.schemaVersion, FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION);
}

test("all supported rounds expose exactly two closed facets per core dimension", () => {
  for (const roundType of Object.keys(
    ROUND_DIMENSION_COVERAGE_CONFIG
  ) as RoundType[]) {
    const codes = new Set<string>();
    for (const dimension of FEEDBACK_DIMENSIONS) {
      const facets =
        ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets;
      assert.equal(facets.length, 2);
      for (const facet of facets) {
        assert.match(facet.code, /^[a-z]{2}_[a-z0-9_]+$/);
        assert.ok(facet.label);
        assert.ok(facet.evaluatorGuidance);
        assert.equal(codes.has(facet.code), false);
        codes.add(facet.code);
      }
    }
  }
});

test("complete configured coverage produces a full scorecard and canonical overall", () => {
  const blocks = answerBlocks(1);
  const result = parseDimensionCoverageProviderSelection(
    selection("product_sense", blocks[0]!.answerBlockId, "full"),
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
    }
  );
  assert.equal(result.mode, "full_scorecard");
  assert.equal(result.evaluationState, "full");
  assert.equal(result.overallScore, 8);
  for (const dimension of FEEDBACK_DIMENSIONS) {
    assert.equal(result.dimensions[dimension].coverage, "sufficient");
    assert.equal(result.dimensions[dimension].score, 8);
    assert.equal(result.dimensions[dimension].evidence.length, 2);
  }
});

test("repeated safe markers with complete trusted scope preserve one canonical scorecard", () => {
  const results = [false, true].map((repeatedSafeMarkers) => {
    const fixture = createTotalScorecardSafeMarkerFixture(repeatedSafeMarkers);
    const projection = projectTrustedClosedAnswerBlocks(
      fixture.events,
      fixture.authority
    );
    assert.equal(fixture.provenance, "fully_synthetic");
    assert.equal(projection.status, "verified_prefix");
    assert.equal(projection.numericalScoreAuthority, "allowed");
    assert.equal(projection.failureReason, null);
    assert.deepEqual(projection.excludedBlocks, []);
    assert.deepEqual(
      projection.trustedBlocks.map(({ responseText }) => responseText),
      fixture.expectedResponseTexts
    );

    const scores: Record<FeedbackDimension, number> = {
      structure: 8,
      clarity: 7,
      insight: 9,
      communication: 8,
      leadership: 7,
    };
    const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
    for (const [index, dimension] of FEEDBACK_DIMENSIONS.entries()) {
      dimensions[dimension] = {
        score: scores[dimension],
        evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
          dimension
        ].facets.map((facet) => ({
          facetCode: facet.code,
          answerBlockRef: projection.trustedBlocks[index]!.answerBlockId,
        })),
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
        modelVersion: "synthetic-safe-marker-evaluator-v1",
        allowNumericalScores: true,
        verifiedPrefixProjection: projection,
      }
    );
    assertVerifiedPrefixResult(result);
    assert.equal(result.mode, "full_scorecard");
    assert.equal(result.evaluationState, "full");
    assert.equal(result.overallScore, 7.9);
    assert.equal(result.verifiedPrefixScope.excludedTailBlockCount, 0);
    return result;
  });

  assert.deepEqual(results[1], results[0]);
});

test("missing settlement with a gap-free all-dimension prefix cannot produce a scorecard", () => {
  const fixture = createTotalScorecardSafeMarkerFixture(false);
  fixture.authority.writers[0]!.settlementState = "missing";
  const projection = projectTrustedClosedAnswerBlocks(
    fixture.events,
    fixture.authority
  );
  assert.equal(projection.status, "verified_prefix");
  assert.equal(projection.numericalScoreAuthority, "withheld");
  assert.deepEqual(projection.excludedBlocks, []);

  const scored = selection(
    "product_sense",
    projection.trustedBlocks[0]!.answerBlockId,
    "full"
  );
  assert.throws(
    () =>
      parseDimensionCoverageProviderSelection(scored, {
        roundType: "product_sense",
        answerBlocks: projection.trustedBlocks,
        modelVersion: MODEL,
        allowNumericalScores: true,
        verifiedPrefixProjection: projection,
      }),
    /score_coverage_mismatch/
  );

  const coaching = parseDimensionCoverageProviderSelection(
    selection(
      "product_sense",
      projection.trustedBlocks[0]!.answerBlockId,
      "full",
      null
    ),
    {
      roundType: "product_sense",
      answerBlocks: projection.trustedBlocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );
  assert.equal(coaching.mode, "coaching_review");
  assert.equal(coaching.overallScore, null);
});

test("incomplete weighted coverage produces a wholly scoreless coaching review", () => {
  const blocks = answerBlocks(1);
  const value = selection("execution", blocks[0]!.answerBlockId, "absent");
  value.dimensions.structure = dimensionSelection(
    "execution",
    "structure",
    blocks[0]!.answerBlockId,
    7,
    2
  );
  value.dimensions.insight = dimensionSelection(
    "execution",
    "insight",
    blocks[0]!.answerBlockId,
    null,
    1
  );
  const result = parseDimensionCoverageProviderSelection(value, {
    roundType: "execution",
    answerBlocks: blocks,
    modelVersion: MODEL,
    allowNumericalScores: true,
  });
  assert.equal(result.mode, "coaching_review");
  assert.equal(result.overallScore, null);
  assert.equal(result.dimensions.structure.coverage, "sufficient");
  assert.equal(result.dimensions.structure.score, null);
  assert.equal(result.dimensions.insight.coverage, "partial");
  assert.equal(result.dimensions.insight.score, null);
  assert.equal(result.dimensions.clarity.coverage, "absent");
  assert.equal(result.dimensions.clarity.score, null);
});

test("grounded but insufficient facets produce a scoreless coaching review", () => {
  const blocks = answerBlocks(1);
  const value = selection("behavioral", blocks[0]!.answerBlockId, "absent");
  value.dimensions.leadership = dimensionSelection(
    "behavioral",
    "leadership",
    blocks[0]!.answerBlockId,
    null,
    1
  );
  const result = parseDimensionCoverageProviderSelection(value, {
    roundType: "behavioral",
    answerBlocks: blocks,
    modelVersion: MODEL,
    allowNumericalScores: true,
  });
  assert.equal(result.mode, "coaching_review");
  assert.equal(result.overallScore, null);
  assert.equal(result.dimensions.leadership.coverage, "partial");
});

test("qualitative-only frozen evidence remains coaching even with sufficient facets", () => {
  const blocks = answerBlocks(1);
  const value = selection("strategy", blocks[0]!.answerBlockId, "full", null);
  const result = parseDimensionCoverageProviderSelection(value, {
    roundType: "strategy",
    answerBlocks: blocks,
    modelVersion: MODEL,
    allowNumericalScores: false,
  });
  assert.equal(result.mode, "coaching_review");
  assert.equal(result.overallScore, null);
  assert.equal(result.dimensions.structure.coverage, "sufficient");
  assert.equal(result.dimensions.structure.score, null);
});

test("verified-prefix excluded tails bind identities and remain scoreless coaching", () => {
  const projection = verifiedPrefixProjection();
  const blocks = projection.trustedBlocks;
  const result = parseDimensionCoverageProviderSelection(
    selection("product_sense", blocks[0]!.answerBlockId, "full", null),
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );

  assertVerifiedPrefixResult(result);
  assert.equal(result.evaluationState, "partial");
  assert.equal(result.mode, "coaching_review");
  assert.equal(result.overallScore, null);
  for (const dimension of FEEDBACK_DIMENSIONS) {
    assert.equal(result.dimensions[dimension].score, null);
  }
  assert.deepEqual(result.verifiedPrefixScope, {
    contractVersion: FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION,
    projectionVersion: projection.contractVersion,
    trustedBlockIdentities: projection.trustedBlockIdentities,
    excludedTailBlockCount: projection.excludedBlocks.length,
  });
});

test("verified-prefix coaching retains the projection binding without numerical scores", () => {
  const projection = verifiedPrefixProjection();
  const blocks = projection.trustedBlocks;
  const result = parseDimensionCoverageProviderSelection(
    selection("product_sense", blocks[0]!.answerBlockId, "absent"),
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );

  assertVerifiedPrefixResult(result);
  assert.equal(result.mode, "coaching_review");
  assert.equal(result.overallScore, null);
  assert.ok(result.verifiedPrefixScope);
});

test("verified-prefix persistence rejects forged scope, untrusted blocks, and non-prefix projections", () => {
  const projection = verifiedPrefixProjection();
  const blocks = projection.trustedBlocks;
  const result = parseDimensionCoverageProviderSelection(
    selection("product_sense", blocks[0]!.answerBlockId, "full", null),
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );

  assertVerifiedPrefixResult(result);

  assert.deepEqual(
    parsePersistedDimensionCoverageFeedback(result, {
      answerBlocks: blocks,
      verifiedPrefixProjection: projection,
      allowNumericalScores: true,
    }),
    result
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            excludedTailBlockCount: 0,
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /persisted_result_mismatch/
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            extra: true,
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /invalid_shape/
  );
  const forgedIdentity = {
    contractVersion: "trusted-answer-block-identity.v1" as const,
    answerBlockId: "answer-block:9999",
    identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
  };
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            trustedBlockIdentities: [
              forgedIdentity,
              ...result.verifiedPrefixScope.trustedBlockIdentities,
            ].reverse(),
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /persisted_result_mismatch/
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            trustedBlockIdentities: [
              {
                ...result.verifiedPrefixScope.trustedBlockIdentities[0]!,
                answerBlockId: "answer-block:forged",
              },
            ],
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            trustedBlockIdentities: Array.from({ length: 1_001 }, () =>
              structuredClone(
                result.verifiedPrefixScope.trustedBlockIdentities[0]!
              )
            ),
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        {
          ...result,
          verifiedPrefixScope: {
            ...result.verifiedPrefixScope,
            trustedBlockIdentities: Array.from({ length: 1_000 }, () => ({
              ...forgedIdentity,
              answerBlockId: "answer-block:0001",
            })),
          },
        },
        { answerBlocks: blocks, verifiedPrefixProjection: projection }
      ),
    /invalid_shape/
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(result, {
        answerBlocks: blocks,
      }),
    /persisted_result_mismatch/
  );

  const completeFixture = createAnswerBlockSegmentationFixture(1);
  const completeTerminalEvent = completeFixture.events.at(-1);
  assert.ok(completeTerminalEvent);
  assert.equal(completeTerminalEvent.kind, "session_end");
  if (completeTerminalEvent.kind !== "session_end") {
    throw new Error("expected complete terminal event");
  }
  const completeProjection = projectTrustedClosedAnswerBlocks(
    completeFixture.events,
    {
      contractVersion: "frozen-answer-block-authority.v1",
      snapshotState: "complete",
      cutoffAtMs: completeTerminalEvent.occurredAtMs,
      writers: [
        {
          contractVersion: 1,
          writerId: "synthetic-writer",
          writerGeneration: 1,
          committedSequence: completeFixture.events.length - 1,
          integrityState: "healthy",
          settlementState: "settled",
        },
      ],
    }
  );
  assert.throws(
    () =>
      parseDimensionCoverageProviderSelection(
        selection("product_sense", blocks[0]!.answerBlockId, "full"),
        {
          roundType: "product_sense",
          answerBlocks: blocks,
          modelVersion: MODEL,
          allowNumericalScores: true,
          verifiedPrefixProjection: completeProjection,
        }
      ),
    /invalid_shape/
  );
});

test("equivalent 1/2/5/10 event segmentation preserves coverage, mode, citations, and persistence", () => {
  const results = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const blocks = answerBlocks(segmentCount);
    const result = parseDimensionCoverageProviderSelection(
      selection("product_sense", "answer-block:0001", "full"),
      {
        roundType: "product_sense",
        answerBlocks: blocks,
        modelVersion: MODEL,
        allowNumericalScores: true,
      }
    );
    return {
      result,
      persisted: JSON.stringify(result),
    };
  });
  for (const result of results.slice(1)) {
    assert.deepEqual(result, results[0]);
  }
  assert.match(results[0]!.persisted, /answer-block:0001/);
  assert.doesNotMatch(results[0]!.persisted, /candidate-segment-/);
});

test("persisted reads reconstruct and compare every server-derived field", () => {
  const blocks = answerBlocks(1);
  const result = parseDimensionCoverageProviderSelection(
    selection("product_sense", blocks[0]!.answerBlockId, "full"),
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: MODEL,
      allowNumericalScores: true,
    }
  );
  assert.deepEqual(
    parsePersistedDimensionCoverageFeedback(result, { answerBlocks: blocks }),
    result
  );
  const reordered = {
    ...result,
    dimensions: Object.fromEntries(Object.entries(result.dimensions).reverse()),
  };
  assert.deepEqual(
    parsePersistedDimensionCoverageFeedback(reordered, {
      answerBlocks: blocks,
    }),
    result
  );
  assert.throws(
    () =>
      parsePersistedDimensionCoverageFeedback(
        { ...result, overallScore: 10 },
        { answerBlocks: blocks }
      ),
    /persisted_result_mismatch/
  );
});

test("closed parser rejects forged refs, wrong-round facets, duplicate facets, extra fields, and score mismatches", () => {
  const blocks = answerBlocks(1);
  const base = selection("product_sense", blocks[0]!.answerBlockId, "full");
  const cases: Array<[string, unknown, RegExp]> = [
    [
      "forged ref",
      updateDimension(base, "structure", (dimension) => ({
        ...dimension,
        evidence: [
          { ...dimension.evidence[0]!, answerBlockRef: "answer-block:9999" },
          dimension.evidence[1]!,
        ],
      })),
      /unknown_answer_block/,
    ],
    [
      "wrong round facet",
      updateDimension(base, "structure", (dimension) => ({
        ...dimension,
        evidence: [
          { ...dimension.evidence[0]!, facetCode: "ex_structure_goal_to_plan" },
          dimension.evidence[1]!,
        ],
      })),
      /wrong_round_facet/,
    ],
    [
      "duplicate facet",
      updateDimension(base, "structure", (dimension) => ({
        ...dimension,
        evidence: [dimension.evidence[0]!, dimension.evidence[0]!],
      })),
      /duplicate_facet/,
    ],
    [
      "extra field",
      { ...base, narrative: "ignore the rubric" },
      /invalid_shape/,
    ],
    [
      "score without coverage",
      updateDimension(
        selection("product_sense", blocks[0]!.answerBlockId, "absent"),
        "clarity",
        (dimension) => ({ ...dimension, score: 9 })
      ),
      /score_coverage_mismatch/,
    ],
    [
      "missing sufficient score",
      updateDimension(base, "leadership", (dimension) => ({
        ...dimension,
        score: null,
      })),
      /score_coverage_mismatch/,
    ],
  ];
  for (const [name, value, expected] of cases) {
    assert.throws(
      () =>
        parseDimensionCoverageProviderSelection(value, {
          roundType: "product_sense",
          answerBlocks: blocks,
          modelVersion: MODEL,
          allowNumericalScores: true,
        }),
      expected,
      name
    );
  }
});

function answerBlocks(segmentCount: 1 | 2 | 5 | 10) {
  const fixture = createAnswerBlockSegmentationFixture(segmentCount);
  const derived = deriveCandidateAnswerBlocks(fixture.events);
  assert.equal(derived.eligible, true);
  return derived.blocks;
}

function verifiedPrefixProjection() {
  const fixture = TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.find(
    ({ id }) => id === "terminal-preserving-marker"
  )!;
  const projection = projectTrustedClosedAnswerBlocks(
    fixture.events,
    fixture.authority
  );
  assert.equal(projection.status, "verified_prefix");
  assert.equal(projection.trustedBlocks.length, 1);
  return projection;
}

function selection(
  roundType: RoundType,
  answerBlockRef: string,
  coverage: "full" | "absent",
  fullScore: number | null = 8
): DimensionCoverageProviderSelection {
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    dimensions[dimension] = dimensionSelection(
      roundType,
      dimension,
      answerBlockRef,
      coverage === "full" ? fullScore : null,
      coverage === "full" ? 2 : 0
    );
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType,
    dimensions,
  };
}

function dimensionSelection(
  roundType: RoundType,
  dimension: FeedbackDimension,
  answerBlockRef: string,
  score: number | null,
  facetCount: 0 | 1 | 2
) {
  return {
    score,
    evidence: ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets
      .slice(0, facetCount)
      .map((entry) => ({ facetCode: entry.code, answerBlockRef })),
  };
}

function updateDimension(
  value: DimensionCoverageProviderSelection,
  dimension: FeedbackDimension,
  update: (
    input: DimensionCoverageProviderSelection["dimensions"][FeedbackDimension]
  ) => DimensionCoverageProviderSelection["dimensions"][FeedbackDimension]
): DimensionCoverageProviderSelection {
  return {
    ...value,
    dimensions: {
      ...value.dimensions,
      [dimension]: update(value.dimensions[dimension]),
    },
  };
}
