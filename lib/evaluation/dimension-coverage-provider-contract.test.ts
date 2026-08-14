import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  deriveCandidateAnswerBlocks,
  parseDimensionCoverageProviderSelection,
  type CandidateAnswerBlock,
  type RoundType,
} from "@meelni/core";
import { getDimensionCoveragePrompt } from "./dimension-coverage-prompt";
import {
  DIMENSION_COVERAGE_PROVIDER_RESPONSE_FORMAT_VERSION,
  DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION,
  getDimensionCoverageProviderResponseFormat,
  getDimensionCoverageProviderResponseFormatContractHash,
  normalizeDimensionCoverageProviderResponse,
} from "./dimension-coverage-provider-format";

const ROUND_TYPES = [
  "product_sense",
  "execution",
  "behavioral",
  "strategy",
] as const satisfies readonly RoundType[];

test("provider contract is strict, closed, and hash-stable", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(1).events
  ).blocks;
  const format = getDimensionCoverageProviderResponseFormat(
    "product_sense",
    blocks,
    true
  );
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.equal(
    DIMENSION_COVERAGE_PROVIDER_RESPONSE_FORMAT_VERSION,
    "feedback-dimension-coverage-provider-response-format.v2"
  );
  assert.deepEqual(format.json_schema.schema.properties.schemaVersion.enum, [
    DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION,
  ]);
  assert.equal(format.json_schema.schema.additionalProperties, false);
  assert.equal(
    getDimensionCoverageProviderResponseFormatContractHash(),
    "cf5d0f184de89f4cb0e2054503b04b5656fec8dea60c2ce2e742cf4ee32ee04d"
  );
  const serialized = JSON.stringify(format);
  assert.doesNotMatch(
    serialized,
    /narrative|confidence|overallScore|eventId|quote/
  );
});

test("qualitative-only provider schema permits no numerical score", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(1).events
  ).blocks;
  const format = getDimensionCoverageProviderResponseFormat(
    "behavioral",
    blocks,
    false
  );
  const structure =
    format.json_schema.schema.properties.dimensions.properties.structure;
  assert.deepEqual(structure.properties.score, { type: "null" });
  const evidenceByFacet = structure.properties.evidenceByFacet;
  const facetCodes =
    ROUND_DIMENSION_COVERAGE_CONFIG.behavioral.structure.facets.map(
      (facet) => facet.code
    );
  assert.equal(evidenceByFacet.type, "object");
  assert.deepEqual(Object.keys(evidenceByFacet.properties), facetCodes);
  assert.deepEqual(evidenceByFacet.required, facetCodes);
  assert.equal(evidenceByFacet.additionalProperties, false);
  assert.equal("items" in evidenceByFacet, false);
  for (const facetCode of facetCodes) {
    assert.deepEqual(evidenceByFacet.properties[facetCode]!.anyOf, [
      {
        type: "string",
        enum: blocks.map((block) => block.answerBlockId),
      },
      { type: "null" },
    ]);
  }
});

test("every facet-slot combination normalizes into a parser-safe core selection", () => {
  const blocks = twoAnswerBlocks();
  const facetRefCases = [
    [null, null],
    [blocks[0]!.answerBlockId, null],
    [null, blocks[1]!.answerBlockId],
    [blocks[0]!.answerBlockId, blocks[0]!.answerBlockId],
    [blocks[0]!.answerBlockId, blocks[1]!.answerBlockId],
  ] as const;

  for (const roundType of ROUND_TYPES) {
    for (const allowNumericalScores of [true, false]) {
      for (const facetRefs of facetRefCases) {
        const normalized = normalizeDimensionCoverageProviderResponse(
          providerResponse(roundType, facetRefs, allowNumericalScores),
          roundType
        );
        const result = parseDimensionCoverageProviderSelection(normalized, {
          roundType,
          answerBlocks: blocks,
          modelVersion: "synthetic-provider-contract-v2",
          allowNumericalScores,
        });
        const selectedCount = facetRefs.filter((ref) => ref !== null).length;
        const expectedCoverage =
          selectedCount === 2
            ? "sufficient"
            : selectedCount === 1
              ? "partial"
              : "absent";
        for (const dimension of FEEDBACK_DIMENSIONS) {
          assert.equal(result.dimensions[dimension].coverage, expectedCoverage);
          assert.equal(
            new Set(
              normalized.dimensions[dimension].evidence.map(
                (entry) => entry.facetCode
              )
            ).size,
            normalized.dimensions[dimension].evidence.length
          );
        }
      }
    }
  }
});

test("legacy duplicate-facet arrays are rejected at the provider boundary", () => {
  const blocks = twoAnswerBlocks();
  const value = providerResponse(
    "behavioral",
    [blocks[0]!.answerBlockId, blocks[1]!.answerBlockId],
    false
  );
  const firstFacet =
    ROUND_DIMENSION_COVERAGE_CONFIG.behavioral.structure.facets[0];
  const malformed = {
    ...value,
    dimensions: {
      ...value.dimensions,
      structure: {
        score: null,
        evidence: [
          {
            facetCode: firstFacet.code,
            answerBlockRef: blocks[0]!.answerBlockId,
          },
          {
            facetCode: firstFacet.code,
            answerBlockRef: blocks[1]!.answerBlockId,
          },
        ],
      },
    },
  };
  assert.throws(
    () => normalizeDimensionCoverageProviderResponse(malformed, "behavioral"),
    /dimension_coverage_provider_response_invalid/
  );
});

test("equivalent segmentation produces identical provider prompt and schema", () => {
  const projections = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const blocks = deriveCandidateAnswerBlocks(
      createAnswerBlockSegmentationFixture(segmentCount).events
    ).blocks;
    return {
      prompt: getDimensionCoveragePrompt("execution", blocks, true),
      format: getDimensionCoverageProviderResponseFormat(
        "execution",
        blocks,
        true
      ),
    };
  });
  for (const projection of projections.slice(1)) {
    assert.deepEqual(projection, projections[0]);
  }
  assert.doesNotMatch(projections[0]!.prompt, /candidate-segment-/);
  assert.match(projections[0]!.prompt, /answer-block:0001/);
  assert.match(projections[0]!.prompt, /exactly one slot/);
});

function twoAnswerBlocks(): CandidateAnswerBlock[] {
  const first = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(1).events
  ).blocks[0]!;
  return [
    first,
    {
      ...first,
      answerBlockId: "answer-block:0002",
      responseText: `${first.responseText} Additional synthetic evidence.`,
    },
  ];
}

function providerResponse(
  roundType: RoundType,
  facetRefs: readonly [string | null, string | null],
  allowNumericalScores: boolean
) {
  const dimensions = Object.fromEntries(
    FEEDBACK_DIMENSIONS.map((dimension) => {
      const facets =
        ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets;
      return [
        dimension,
        {
          score:
            allowNumericalScores && facetRefs.every((ref) => ref !== null)
              ? 8
              : null,
          evidenceByFacet: Object.fromEntries(
            facets.map((facet, index) => [facet.code, facetRefs[index]])
          ),
        },
      ];
    })
  );
  return {
    schemaVersion: DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType,
    dimensions,
  };
}
