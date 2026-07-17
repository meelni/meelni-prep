import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
} from "@meelni/core";

export type FeedbackV2FixtureRound =
  | "product_sense"
  | "execution"
  | "behavioral"
  | "strategy";

export interface FeedbackV2GoldenFixture {
  roundType: FeedbackV2FixtureRound;
  evaluationState: FeedbackEvaluationState;
  modelVersion: string;
  transcript: FeedbackTranscriptTurn[];
  response: Record<string, unknown>;
}

const roundEvidence: Record<
  FeedbackV2FixtureRound,
  { text: string; quote: string; dimension: string; observation: string }
> = {
  product_sense: {
    text: "I will focus on new parents, map their late-night support needs, and measure weekly successful connections.",
    quote: "focus on new parents, map their late-night support needs",
    dimension: "insight",
    observation: "The answer chooses a specific user and need.",
  },
  execution: {
    text: "The north-star metric is retained weekly creators, with publishing latency as a guardrail.",
    quote:
      "north-star metric is retained weekly creators, with publishing latency as a guardrail",
    dimension: "structure",
    observation: "The answer separates an outcome metric from a guardrail.",
  },
  behavioral: {
    text: "I aligned design and engineering on the decision, documented the trade-off, and reduced launch delay by two weeks.",
    quote: "documented the trade-off, and reduced launch delay by two weeks",
    dimension: "leadership",
    observation:
      "The story documents a trade-off and a measurable two-week result.",
  },
  strategy: {
    text: "I would enter the mid-market first because distribution is reachable and the incumbent underserves integrations.",
    quote: "enter the mid-market first because distribution is reachable",
    dimension: "insight",
    observation:
      "The recommendation connects the mid-market entry choice to reachable distribution.",
  },
};

function buildFixture(
  roundType: FeedbackV2FixtureRound,
  evaluationState: FeedbackEvaluationState = "full"
): FeedbackV2GoldenFixture {
  const evidence = roundEvidence[roundType];
  const firstRef = `${roundType}:writer:1`;
  const secondRef = `${roundType}:writer:2`;
  return {
    roundType,
    evaluationState,
    modelVersion: "fixture-model-v1",
    transcript: [
      { eventId: firstRef, speaker: "user", text: evidence.text },
      {
        eventId: secondRef,
        speaker: "user",
        text: "I would next compare two options, but I have not defined the decision threshold yet.",
      },
    ],
    response: {
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      promptVersion: FEEDBACK_PROMPT_VERSION,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      evaluationState,
      scores: {
        structure: 7,
        clarity: 8,
        insight: 8,
        communication: 7,
        leadership: 7,
      },
      strengths: [
        {
          dimension: evidence.dimension,
          observation: evidence.observation,
          transcriptRefs: [firstRef],
          evidence: [{ turnRef: firstRef, quote: evidence.quote }],
          nextStep: "Use the same specificity throughout the answer.",
          rubricVersion: FEEDBACK_RUBRIC_VERSION,
          confidence: evaluationState === "partial" ? 0.65 : 0.9,
        },
      ],
      improvements: [
        {
          dimension: "structure",
          observation: "The comparison does not define a decision threshold.",
          transcriptRefs: [secondRef],
          evidence: [
            { turnRef: secondRef, quote: "not defined the decision threshold" },
          ],
          nextStep: "State the decision threshold before comparing options.",
          rubricVersion: FEEDBACK_RUBRIC_VERSION,
          confidence: evaluationState === "partial" ? 0.6 : 0.85,
        },
      ],
      drills: [
        "Set one outcome, one guardrail, and one threshold in 60 seconds.",
      ],
      summary:
        evaluationState === "partial"
          ? "The available portion shows specific reasoning; conclusions are limited to the recorded evidence."
          : "The answer is specific and reasoned, with an opportunity to define decision thresholds earlier.",
    },
  };
}

export function createFeedbackV2GoldenFixtures(): FeedbackV2GoldenFixture[] {
  return [
    buildFixture("product_sense"),
    buildFixture("execution"),
    buildFixture("behavioral", "partial"),
    buildFixture("strategy"),
  ];
}
