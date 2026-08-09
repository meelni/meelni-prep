import {
  DRILL_TEMPLATE_VERSION,
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type DrillRecommendationSourceState,
  type FeedbackDimension,
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
  type RoundType,
} from "@meelni/core";

export interface DrillRecommendationGoldenFixture {
  name: string;
  roundType: RoundType;
  evaluationState: FeedbackEvaluationState;
  modelVersion: string;
  transcript: FeedbackTranscriptTurn[];
  response: Record<string, unknown>;
  expected: {
    drillId: string;
    weakestDimension: FeedbackDimension;
    evidenceGap: "grounded_full" | "grounded_partial";
  };
}

export interface DrillRecommendationStateFixture {
  sourceState: Exclude<DrillRecommendationSourceState, "completed">;
  expectedReason:
    | "feedback_pending"
    | "feedback_processing"
    | "feedback_failed"
    | "feedback_skipped"
    | "feedback_insufficient"
    | "feedback_abandoned";
}

const roundCases: Array<{
  roundType: RoundType;
  weakestDimension: FeedbackDimension;
  weakText: string;
  weakQuote: string;
  observation: string;
  nextStep: string;
}> = [
  {
    roundType: "product_sense",
    weakestDimension: "insight",
    weakText:
      "I did not identify a specific audience or a specific user need before choosing the product direction.",
    weakQuote:
      "did not identify a specific audience or a specific user need before choosing the product direction",
    observation:
      "The answer does not identify a specific audience or a specific user need.",
    nextStep: "Choose one user and name the unmet need before ideating.",
  },
  {
    roundType: "execution",
    weakestDimension: "structure",
    weakText:
      "My metric list lacks a primary outcome and a decision hierarchy, so I have not chosen which signal should drive the decision.",
    weakQuote: "metric list lacks a primary outcome and a decision hierarchy",
    observation:
      "The metric list lacks a primary outcome and decision hierarchy.",
    nextStep:
      "Name one outcome metric, its guardrails, and a decision threshold.",
  },
  {
    roundType: "behavioral",
    weakestDimension: "leadership",
    weakText:
      "The team made the decision and the launch moved forward, but the story does not identify my ownership or influence.",
    weakQuote: "story does not identify my ownership or influence",
    observation:
      "The story does not identify the candidate's ownership or influence.",
    nextStep: "State the decision you owned and the measurable result.",
  },
  {
    roundType: "strategy",
    weakestDimension: "insight",
    weakText:
      "My recommendation lacks differentiated market evidence and a reversal condition.",
    weakQuote:
      "recommendation lacks differentiated market evidence and a reversal condition",
    observation:
      "The recommendation lacks differentiated market evidence and a reversal condition.",
    nextStep:
      "Compare strategic options and name the evidence that would reverse the choice.",
  },
];

export function createDrillRecommendationGoldenFixtures(): DrillRecommendationGoldenFixture[] {
  return roundCases.map((fixture, index) => {
    const evaluationState: FeedbackEvaluationState =
      fixture.roundType === "strategy" ? "partial" : "full";
    const strongRef = `${fixture.roundType}:strong`;
    const weakRef = `${fixture.roundType}:gap`;
    const evidenceGap =
      evaluationState === "full" ? "grounded_full" : "grounded_partial";
    return {
      name: `${fixture.roundType}-${fixture.weakestDimension}`,
      roundType: fixture.roundType,
      evaluationState,
      modelVersion: "fixture-model-v2",
      transcript: [
        {
          eventId: strongRef,
          speaker: "user",
          text: "I would state a clear recommendation and name one measurable outcome.",
        },
        { eventId: weakRef, speaker: "user", text: fixture.weakText },
      ],
      response: {
        schemaVersion: FEEDBACK_SCHEMA_VERSION,
        promptVersion: FEEDBACK_PROMPT_VERSION,
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        evaluationState,
        scores: scoresWithWeakest(fixture.weakestDimension, 4 + index),
        strengths: [
          {
            dimension: "clarity",
            observation: "The answer states a clear recommendation.",
            transcriptRefs: [strongRef],
            evidence: [
              { turnRef: strongRef, quote: "state a clear recommendation" },
            ],
            nextStep: "Keep the recommendation explicit in future answers.",
            rubricVersion: FEEDBACK_RUBRIC_VERSION,
            confidence: evaluationState === "partial" ? 0.65 : 0.9,
          },
        ],
        improvements: [
          {
            dimension: fixture.weakestDimension,
            observation: fixture.observation,
            transcriptRefs: [weakRef],
            evidence: [{ turnRef: weakRef, quote: fixture.weakQuote }],
            nextStep: fixture.nextStep,
            rubricVersion: FEEDBACK_RUBRIC_VERSION,
            confidence: evaluationState === "partial" ? 0.6 : 0.85,
          },
        ],
        drills: ["Provider text is not used as the deterministic drill ID."],
        summary: `The answer states a clear recommendation. ${fixture.observation}`,
      },
      expected: {
        drillId: [
          "pm-drill",
          DRILL_TEMPLATE_VERSION,
          fixture.roundType,
          fixture.weakestDimension,
          evidenceGap,
        ].join(":"),
        weakestDimension: fixture.weakestDimension,
        evidenceGap,
      },
    };
  });
}

export const DRILL_RECOMMENDATION_STATE_FIXTURES: DrillRecommendationStateFixture[] =
  [
    { sourceState: "pending", expectedReason: "feedback_pending" },
    { sourceState: "processing", expectedReason: "feedback_processing" },
    { sourceState: "failed", expectedReason: "feedback_failed" },
    { sourceState: "skipped", expectedReason: "feedback_skipped" },
    { sourceState: "insufficient", expectedReason: "feedback_insufficient" },
    { sourceState: "abandoned", expectedReason: "feedback_abandoned" },
  ];

function scoresWithWeakest(
  dimension: FeedbackDimension,
  weakestScore: number
): Record<FeedbackDimension, number> {
  return {
    structure: dimension === "structure" ? weakestScore : 8,
    clarity: dimension === "clarity" ? weakestScore : 8,
    insight: dimension === "insight" ? weakestScore : 8,
    communication: dimension === "communication" ? weakestScore : 8,
    leadership: dimension === "leadership" ? weakestScore : 8,
  };
}
