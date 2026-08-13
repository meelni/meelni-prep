import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";
import { deriveCandidateAnswerBlocks } from "./answer-blocks";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  parsePersistedDimensionCoverageFeedback,
  type DimensionCoverageFeedbackResult,
  type DimensionCoverageProviderSelection,
} from "./feedback-dimension-coverage";
import type { FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";

const MODEL = "synthetic-evaluator-v1";

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

test("partial scorecards score only sufficient dimensions and never overall", () => {
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
  assert.equal(result.mode, "partial_scorecard");
  assert.equal(result.overallScore, null);
  assert.equal(result.dimensions.structure.coverage, "sufficient");
  assert.equal(result.dimensions.structure.score, 7);
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
