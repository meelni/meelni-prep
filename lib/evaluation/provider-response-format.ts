import { createHash } from "node:crypto";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  EVIDENCE_LIMITED_ACTION_CODES,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES,
  EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
  type FeedbackEvaluationState,
} from "@meelni/core";

export const FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-provider-response-format.v9" as const;
export const FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION =
  "feedback-evidence-limited-provider-response-format.v4" as const;

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
  "Copy one meaningful exact case-sensitive substring from the cited candidate turn text. Do not paraphrase, summarize, normalize, add words, remove words, or cite text from another turn. Across the two strengths and two improvements, this quote must be unique: do not reuse this same quote, a substring/superstring variant, an overlapping quote from the same turn, or another quote from the same source sentence/line. Treat each quote as reserved evidence: after one finding uses a source sentence or line, no other finding may cite any trimmed, extended, nested, or overlapping text from that sentence or line." as const;

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
          "Exactly one evidence entry for this finding. This one quote is unavailable to the other strength/improvement findings; never duplicate, overlap, nest, extend, trim, or reuse another finding's quote, turnRef when avoidable, or source sentence/line. Reserve this quote's source sentence or line for this finding only.",
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

export function getEvidenceLimitedProviderResponseFormat(
  candidateTurnRefs: readonly string[] = ["turn_0001"]
) {
  const allowedTurnRefs =
    requireEvidenceLimitedProviderReferences(candidateTurnRefs);
  const selection = (signalCodes: readonly string[]) => ({
    type: "object" as const,
    properties: {
      signalCode: {
        type: "string" as const,
        enum: signalCodes,
      },
      actionCode: {
        type: "string" as const,
        enum: EVIDENCE_LIMITED_ACTION_CODES,
      },
      transcriptRef: {
        type: "string" as const,
        enum: allowedTurnRefs,
      },
    },
    required: ["signalCode", "actionCode", "transcriptRef"] as const,
    additionalProperties: false,
  });
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "meelni_feedback_evidence_limited_selection_v1",
      description:
        "Closed PM-rubric selections and trusted candidate-turn aliases. The provider returns no narrative, quote text, score, confidence, or numeric value.",
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          schemaVersion: {
            type: "string" as const,
            enum: [FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION],
          },
          promptVersion: {
            type: "string" as const,
            enum: [FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION],
          },
          rubricVersion: {
            type: "string" as const,
            enum: [FEEDBACK_RUBRIC_VERSION],
          },
          evaluationState: { type: "string" as const, enum: ["partial"] },
          strengths: {
            type: "array" as const,
            description:
              "Distinct strength selections only. Do not repeat a signalCode or actionCode, even with a different transcriptRef. Action codes must also remain unique across improvements.",
            items: selection(EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES),
            minItems: 1,
            maxItems: 2,
          },
          improvements: {
            type: "array" as const,
            description:
              "Distinct improvement selections only. Do not repeat a signalCode or actionCode, even with a different transcriptRef. Action codes must also remain unique across strengths.",
            items: selection(EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES),
            minItems: 1,
            maxItems: 2,
          },
        },
        required: [
          "schemaVersion",
          "promptVersion",
          "rubricVersion",
          "evaluationState",
          "strengths",
          "improvements",
        ] as const,
        additionalProperties: false,
      },
    },
  };
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

export function getEvidenceLimitedProviderResponseFormatContractHash(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION,
        format: getEvidenceLimitedProviderResponseFormat(["turn_0001"]),
      })
    )
    .digest("hex");
}

function requireEvidenceLimitedProviderReferences(
  candidateTurnRefs: readonly string[]
): readonly string[] {
  if (
    candidateTurnRefs.length < 1 ||
    candidateTurnRefs.length > 1_000 ||
    candidateTurnRefs.some(
      (reference) =>
        typeof reference !== "string" ||
        reference.length === 0 ||
        reference.length > 512
    ) ||
    new Set(candidateTurnRefs).size !== candidateTurnRefs.length
  ) {
    throw new Error("evidence_limited_provider_references_invalid");
  }
  return [...candidateTurnRefs];
}
