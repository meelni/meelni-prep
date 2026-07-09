import {
  getDefaultDuration,
  type DifficultyLevel,
  type RoundType,
} from "./interview";
import type { HintMode } from "./session";
import { normalizeQuestionRound } from "./question-taxonomy";

export interface SelectedRepQuestion {
  id: string;
  text: string;
  company: string | null;
  type: string;
}

export type RecommendedRepSource =
  | "fallback"
  | "selected_question"
  | "recent_feedback";

export interface RecommendedRep {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  question: SelectedRepQuestion | null;
  rationale: string;
  creditCost: 1;
  durationMinutes: number;
  hintMode: HintMode;
  source: RecommendedRepSource;
}

export interface BuildRecommendedRepInput {
  selectedQuestion?: SelectedRepQuestion | null;
  recentWeaknessRoundType?: RoundType | null;
}

export function mapQuestionTypeToRoundType(
  questionType: string
): RoundType | null {
  return normalizeQuestionRound(questionType);
}

export function buildRecommendedRep(
  input: BuildRecommendedRepInput = {}
): RecommendedRep {
  if (input.selectedQuestion) {
    const roundType =
      mapQuestionTypeToRoundType(input.selectedQuestion.type) ??
      "product_sense";

    return {
      roundType,
      difficulty: "intermediate",
      question: input.selectedQuestion,
      rationale:
        "Practice the selected question with the matching PM interview round.",
      creditCost: 1,
      durationMinutes: getDefaultDuration(roundType),
      hintMode: "off",
      source: "selected_question",
    };
  }

  if (input.recentWeaknessRoundType) {
    const roundType = input.recentWeaknessRoundType;

    return {
      roundType,
      difficulty: "intermediate",
      question: null,
      rationale:
        "Run another rep where your recent feedback showed the most room to improve.",
      creditCost: 1,
      durationMinutes: getDefaultDuration(roundType),
      hintMode: "off",
      source: "recent_feedback",
    };
  }

  return {
    roundType: "product_sense",
    difficulty: "intermediate",
    question: null,
    rationale:
      "Start with Product Sense, the broadest PM interview rep for sharpening problem framing and prioritization.",
    creditCost: 1,
    durationMinutes: getDefaultDuration("product_sense"),
    hintMode: "off",
    source: "fallback",
  };
}
