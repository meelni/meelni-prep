import {
  FOCUSED_PRACTICE_TEMPLATE_VERSION,
  type FocusedPracticeSourceQuestion,
  type RoundType,
} from "@meelni/core";
import {
  createDrillRecommendationGoldenFixtures,
  type DrillRecommendationGoldenFixture,
} from "./drill-recommendation";

export interface FocusedPracticePlanGoldenFixture {
  name: string;
  sourceQuestion: FocusedPracticeSourceQuestion;
  recommendationFixture: DrillRecommendationGoldenFixture;
  expected: {
    templateId: string;
    title: string;
  };
}

const SOURCE_QUESTIONS = {
  product_sense: {
    questionId: "fixture-question-product-sense",
    questionText:
      "Design a product that helps caregivers coordinate medical appointments.",
  },
  execution: {
    questionId: "fixture-question-execution",
    questionText:
      "How would you measure and improve activation for a merchant onboarding flow?",
  },
  behavioral: {
    questionId: "fixture-question-behavioral",
    questionText:
      "Tell me about a time you influenced a difficult cross-functional decision.",
  },
  strategy: {
    questionId: "fixture-question-strategy",
    questionText: "Should a collaboration product enter the education market?",
  },
} as const satisfies Record<RoundType, FocusedPracticeSourceQuestion>;

const EXPECTED_TITLES = {
  product_sense: "Deepen the user insight",
  execution: "Strengthen the Execution structure",
  behavioral: "Clarify ownership and influence",
  strategy: "Deepen the strategic insight",
} as const satisfies Record<RoundType, string>;

export function createFocusedPracticePlanGoldenFixtures(): FocusedPracticePlanGoldenFixture[] {
  return createDrillRecommendationGoldenFixtures().map(
    (recommendationFixture) => ({
      name: recommendationFixture.name,
      sourceQuestion: { ...SOURCE_QUESTIONS[recommendationFixture.roundType] },
      recommendationFixture,
      expected: {
        templateId: [
          "focused-practice",
          FOCUSED_PRACTICE_TEMPLATE_VERSION,
          recommendationFixture.roundType,
          recommendationFixture.expected.weakestDimension,
          recommendationFixture.expected.evidenceGap,
        ].join(":"),
        title: EXPECTED_TITLES[recommendationFixture.roundType],
      },
    })
  );
}
