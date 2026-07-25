import { createHash } from "node:crypto";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
} from "@meelni/core";

export const FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-provider-response-format.v5" as const;

const FEEDBACK_DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const;

const EXACT_TURN_REF_DESCRIPTION =
  "Copy one candidate turnRef alias exactly from transcriptRefs; never cite interviewer turns or invent aliases. Across the two strengths and two improvements, use four different primary evidence turnRefs unless the transcript has fewer than four candidate turns." as const;
const EXACT_QUOTE_DESCRIPTION =
  "Copy one meaningful exact case-sensitive substring from the cited candidate turn text. Do not paraphrase, summarize, normalize, add words, remove words, or cite text from another turn. Across the two strengths and two improvements, this quote must be unique: do not reuse this same quote, a substring/superstring variant, an overlapping quote from the same turn, or another quote from the same source sentence/line." as const;

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
    description:
      "One grounded evidence entry. Its turnRef must cite a candidate turn, and quote must be copied byte-for-byte from that same turn.",
    properties: {
      turnRef: {
        ...stringValue,
        description: EXACT_TURN_REF_DESCRIPTION,
      },
      quote: {
        ...stringValue,
        description: EXACT_QUOTE_DESCRIPTION,
      },
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
        description:
          "Use aliases for evidence-bearing candidate turns. Across all four findings, prefer different aliases. If reusing a turn, cite only quotes from source sentences/lines not used by any other finding.",
        items: stringValue,
      },
      evidence: {
        type: "array" as const,
        description:
          "Exactly one evidence entry for this finding. This one quote is unavailable to the other strength/improvement findings; never duplicate, overlap, nest, extend, trim, or reuse another finding's quote, turnRef when avoidable, or source sentence/line.",
        minItems: 1,
        maxItems: 1,
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
