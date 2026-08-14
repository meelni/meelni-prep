import { createHash } from "node:crypto";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  type CandidateAnswerBlock,
  type DimensionCoverageProviderSelection,
  type RoundType,
} from "@meelni/core";

export const DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION =
  "feedback.dimension-coverage.provider-selection.v2" as const;
export const DIMENSION_COVERAGE_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-dimension-coverage-provider-response-format.v2" as const;

const INVALID_PROVIDER_RESPONSE =
  "dimension_coverage_provider_response_invalid" as const;

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
    FEEDBACK_DIMENSIONS.map((dimension) => {
      const facets = config[dimension].facets;
      const facetCodes = facets.map((facet) => facet.code);
      return [
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
            evidenceByFacet: {
              type: "object" as const,
              description:
                "For each required facet key, copy one grounded answer-block alias or return null.",
              properties: Object.fromEntries(
                facets.map((facet) => [
                  facet.code,
                  {
                    description: `${facet.label}: ${facet.evaluatorGuidance} Return one exact answerBlockRef when grounded; otherwise return null.`,
                    anyOf: [
                      { type: "string" as const, enum: blockRefs },
                      { type: "null" as const },
                    ],
                  },
                ])
              ),
              required: facetCodes,
              additionalProperties: false,
            },
          },
          required: ["score", "evidenceByFacet"] as const,
          additionalProperties: false,
        },
      ];
    })
  );
  return {
    type: "json_schema" as const,
    json_schema: {
      name: `meelni_dimension_coverage_${roundType}_v2`,
      description:
        "Closed round-specific PM rubric selections grounded only in candidate answer-block aliases.",
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          schemaVersion: {
            type: "string" as const,
            enum: [DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION],
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

/** Normalize the provider-only facet slots into the stable core selection. */
export function normalizeDimensionCoverageProviderResponse(
  value: unknown,
  roundType: RoundType
): DimensionCoverageProviderSelection {
  const root = requireRecord(value);
  requireExactKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "roundType",
    "dimensions",
  ]);
  if (
    root.schemaVersion !==
      DIMENSION_COVERAGE_PROVIDER_SELECTION_SCHEMA_VERSION ||
    root.promptVersion !== FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION ||
    root.rubricVersion !== FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION ||
    root.roundType !== roundType
  ) {
    throw new Error(INVALID_PROVIDER_RESPONSE);
  }

  const rawDimensions = requireRecord(root.dimensions);
  requireExactKeys(rawDimensions, FEEDBACK_DIMENSIONS);
  const config = ROUND_DIMENSION_COVERAGE_CONFIG[roundType];
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];

  for (const dimension of FEEDBACK_DIMENSIONS) {
    const rawDimension = requireRecord(rawDimensions[dimension]);
    requireExactKeys(rawDimension, ["score", "evidenceByFacet"]);
    const score = rawDimension.score;
    if (
      score !== null &&
      (typeof score !== "number" ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > 10)
    ) {
      throw new Error(INVALID_PROVIDER_RESPONSE);
    }

    const rawEvidenceByFacet = requireRecord(rawDimension.evidenceByFacet);
    const facets = config[dimension].facets;
    requireExactKeys(
      rawEvidenceByFacet,
      facets.map((facet) => facet.code)
    );
    const evidence = facets.flatMap((facet) => {
      const answerBlockRef = rawEvidenceByFacet[facet.code];
      if (answerBlockRef === null) return [];
      if (typeof answerBlockRef !== "string") {
        throw new Error(INVALID_PROVIDER_RESPONSE);
      }
      return [{ facetCode: facet.code, answerBlockRef }];
    });
    dimensions[dimension] = { score, evidence };
  }

  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType,
    dimensions,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(INVALID_PROVIDER_RESPONSE);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): void {
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(INVALID_PROVIDER_RESPONSE);
  }
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
