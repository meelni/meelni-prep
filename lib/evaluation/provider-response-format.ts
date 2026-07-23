import { createHash } from "node:crypto";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
} from "@meelni/core";

export const FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-provider-response-format.v1" as const;

const FEEDBACK_DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const;

/**
 * Provider-owned structural constraints. Transcript grounding and all other
 * semantic invariants remain enforced by the provider-neutral core parser.
 */
export function getFeedbackProviderResponseFormat(
  evaluationState: FeedbackEvaluationState
) {
  const stringValue = { type: "string" as const };
  const evidence = {
    type: "object" as const,
    properties: {
      turnRef: stringValue,
      quote: stringValue,
    },
    required: ["turnRef", "quote"] as const,
    additionalProperties: false,
  };
  const finding = {
    type: "object" as const,
    properties: {
      dimension: {
        type: "string" as const,
        enum: FEEDBACK_DIMENSIONS,
      },
      observation: stringValue,
      transcriptRefs: {
        type: "array" as const,
        items: stringValue,
      },
      evidence: {
        type: "array" as const,
        items: evidence,
      },
      nextStep: stringValue,
      rubricVersion: {
        type: "string" as const,
        enum: [FEEDBACK_RUBRIC_VERSION],
      },
      confidence: { type: "number" as const },
    },
    required: [
      "dimension",
      "observation",
      "transcriptRefs",
      "evidence",
      "nextStep",
      "rubricVersion",
      "confidence",
    ] as const,
    additionalProperties: false,
  };
  const score = { type: "integer" as const };

  return {
    type: "json_schema" as const,
    json_schema: {
      name: `meelni_feedback_v2_${evaluationState}`,
      description:
        "Evidence-grounded PM interview feedback using the feedback.v2 write contract.",
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          schemaVersion: {
            type: "string" as const,
            enum: [FEEDBACK_SCHEMA_VERSION],
          },
          promptVersion: {
            type: "string" as const,
            enum: [FEEDBACK_PROMPT_VERSION],
          },
          rubricVersion: {
            type: "string" as const,
            enum: [FEEDBACK_RUBRIC_VERSION],
          },
          evaluationState: {
            type: "string" as const,
            enum: [evaluationState],
          },
          scores: {
            type: "object" as const,
            properties: {
              structure: score,
              clarity: score,
              insight: score,
              communication: score,
              leadership: score,
            },
            required: FEEDBACK_DIMENSIONS,
            additionalProperties: false,
          },
          strengths: {
            type: "array" as const,
            items: finding,
            minItems: 2,
            maxItems: 2,
          },
          improvements: {
            type: "array" as const,
            items: finding,
            minItems: 2,
            maxItems: 2,
          },
          drills: {
            type: "array" as const,
            items: stringValue,
          },
          summary: stringValue,
        },
        required: [
          "schemaVersion",
          "promptVersion",
          "rubricVersion",
          "evaluationState",
          "scores",
          "strengths",
          "improvements",
          "drills",
          "summary",
        ] as const,
        additionalProperties: false,
      },
    },
  };
}

export function serializeFeedbackProviderResponseFormat(
  evaluationState: FeedbackEvaluationState
): string {
  return JSON.stringify(getFeedbackProviderResponseFormat(evaluationState));
}

export function getFeedbackProviderResponseFormatContractHash(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
        full: getFeedbackProviderResponseFormat("full"),
        partial: getFeedbackProviderResponseFormat("partial"),
      })
    )
    .digest("hex");
}
