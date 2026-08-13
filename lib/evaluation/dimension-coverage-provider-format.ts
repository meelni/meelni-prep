import { createHash } from "node:crypto";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  type CandidateAnswerBlock,
  type RoundType,
} from "@meelni/core";

export const DIMENSION_COVERAGE_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-dimension-coverage-provider-response-format.v1" as const;

export function getDimensionCoverageProviderResponseFormat(
  roundType: RoundType,
  answerBlocks: readonly CandidateAnswerBlock[],
  allowNumericalScores: boolean
) {
  const blockRefs = answerBlocks.map((block) => block.answerBlockId);
  if (
    blockRefs.length === 0 ||
    blockRefs.length > 1_000 ||
    new Set(blockRefs).size !== blockRefs.length
  ) {
    throw new Error("dimension_coverage_provider_block_refs_invalid");
  }
  const config = ROUND_DIMENSION_COVERAGE_CONFIG[roundType];
  const dimensionProperties = Object.fromEntries(
    FEEDBACK_DIMENSIONS.map((dimension) => [
      dimension,
      {
        type: "object" as const,
        properties: {
          score: allowNumericalScores
            ? {
                anyOf: [
                  { type: "integer" as const, minimum: 0, maximum: 10 },
                  { type: "null" as const },
                ],
              }
            : { type: "null" as const },
          evidence: {
            type: "array" as const,
            minItems: 0,
            maxItems: 2,
            items: {
              type: "object" as const,
              properties: {
                facetCode: {
                  type: "string" as const,
                  enum: config[dimension].facets.map((facet) => facet.code),
                },
                answerBlockRef: {
                  type: "string" as const,
                  enum: blockRefs,
                },
              },
              required: ["facetCode", "answerBlockRef"] as const,
              additionalProperties: false,
            },
          },
        },
        required: ["score", "evidence"] as const,
        additionalProperties: false,
      },
    ])
  );
  return {
    type: "json_schema" as const,
    json_schema: {
      name: `meelni_dimension_coverage_${roundType}`,
      description:
        "Closed round-specific PM rubric selections grounded only in candidate answer-block aliases.",
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          schemaVersion: {
            type: "string" as const,
            enum: [FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION],
          },
          promptVersion: {
            type: "string" as const,
            enum: [FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION],
          },
          rubricVersion: {
            type: "string" as const,
            enum: [FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION],
          },
          roundType: { type: "string" as const, enum: [roundType] },
          dimensions: {
            type: "object" as const,
            properties: dimensionProperties,
            required: FEEDBACK_DIMENSIONS,
            additionalProperties: false,
          },
        },
        required: [
          "schemaVersion",
          "promptVersion",
          "rubricVersion",
          "roundType",
          "dimensions",
        ] as const,
        additionalProperties: false,
      },
    },
  };
}

export function getDimensionCoverageProviderResponseFormatContractHash(): string {
  const syntheticBlock = {
    answerBlockId: "answer-block:0001",
  } as CandidateAnswerBlock;
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: DIMENSION_COVERAGE_PROVIDER_RESPONSE_FORMAT_VERSION,
        formats: Object.fromEntries(
          (
            ["product_sense", "execution", "behavioral", "strategy"] as const
          ).flatMap((roundType) => [
            [
              `${roundType}:scored`,
              getDimensionCoverageProviderResponseFormat(
                roundType,
                [syntheticBlock],
                true
              ),
            ],
            [
              `${roundType}:coaching`,
              getDimensionCoverageProviderResponseFormat(
                roundType,
                [syntheticBlock],
                false
              ),
            ],
          ])
        ),
      })
    )
    .digest("hex");
}
