import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackV2Result,
} from "@meelni/core";

import { normalizeFeedbackV2Recommendations } from "./scorer";

function resultWithRecommendations(drills: string[]): FeedbackV2Result {
  const finding = {
    dimension: "structure" as const,
    observation: "The answer states a clear sequence.",
    transcriptRefs: ["candidate:1"],
    evidence: [{ turnRef: "candidate:1", quote: "First, I define the goal." }],
    nextStep: "Keep making the sequence explicit.",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: 0.9,
  };

  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: "fixture-model-v1",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "full",
    scores: {
      structure: 8,
      clarity: 8,
      insight: 8,
      communication: 8,
      leadership: 8,
    },
    overallScore: 8,
    strengths: [finding],
    improvements: [
      {
        ...finding,
        observation: "The answer does not name a decision threshold.",
        nextStep: "State the decision threshold before comparing options.",
      },
    ],
    drills,
    summary: "Grounded fixture feedback.",
  };
}

test("feedback v2 fails closed when normalization removes every recommendation", () => {
  assert.throws(
    () =>
      normalizeFeedbackV2Recommendations(
        resultWithRecommendations(["Do ten reps focused on metrics."])
      ),
    /requires at least one product-language-safe practice recommendation/
  );
});

test("feedback v2 retains valid recommendations when a mixed list is normalized", () => {
  const result = normalizeFeedbackV2Recommendations(
    resultWithRecommendations([
      "Do ten reps focused on metrics.",
      "State one outcome metric and one decision threshold.",
    ])
  );

  assert.deepEqual(result.drills, [
    "State one outcome metric and one decision threshold.",
  ]);
});
