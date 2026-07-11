import {
  getDefaultDuration,
  type DifficultyLevel,
  type RoundType,
} from "./interview";
import type { HintMode } from "./session";
import { normalizeQuestionRound } from "./question-taxonomy";

export interface SelectedInterviewQuestion {
  id: string;
  text: string;
  company: string | null;
  type: string;
}

export type InterviewRecommendationSource =
  | "fallback"
  | "launch_context"
  | "selected_question"
  | "recent_feedback";

export interface InterviewRecommendation {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  question: SelectedInterviewQuestion | null;
  rationale: string;
  creditCost: 1;
  durationMinutes: number;
  hintMode: HintMode;
  source: InterviewRecommendationSource;
}

export interface BuildInterviewRecommendationInput {
  selectedQuestion?: SelectedInterviewQuestion | null;
  recentWeaknessRoundType?: RoundType | null;
  requestedRoundType?: RoundType | null;
  requestedDifficulty?: DifficultyLevel | null;
  focus?: string | null;
  company?: string | null;
}

export function mapQuestionTypeToRoundType(
  questionType: string
): RoundType | null {
  return normalizeQuestionRound(questionType);
}

export function buildInterviewRecommendation(
  input: BuildInterviewRecommendationInput = {}
): InterviewRecommendation {
  if (input.selectedQuestion) {
    const roundType =
      mapQuestionTypeToRoundType(input.selectedQuestion.type) ??
      "product_sense";

    return {
      roundType,
      difficulty: input.requestedDifficulty ?? "intermediate",
      question: input.selectedQuestion,
      rationale:
        "Practice the selected question with the matching PM interview round.",
      creditCost: 1,
      durationMinutes: getDefaultDuration(roundType),
      hintMode: "off",
      source: "selected_question",
    };
  }

  if (
    input.requestedRoundType ||
    input.requestedDifficulty ||
    input.focus ||
    input.company
  ) {
    const roundType = input.requestedRoundType ?? "product_sense";

    return {
      roundType,
      difficulty: input.requestedDifficulty ?? "intermediate",
      question: null,
      rationale:
        "Start a mock interview using the practice context you selected.",
      creditCost: 1,
      durationMinutes: getDefaultDuration(roundType),
      hintMode: "off",
      source: "launch_context",
    };
  }

  if (input.recentWeaknessRoundType) {
    const roundType = input.recentWeaknessRoundType;

    return {
      roundType,
      difficulty: "intermediate",
      question: null,
      rationale:
        "Practice another mock interview where your recent feedback showed the most room to improve.",
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
      "Start with Product Sense, a broad PM interview format for sharpening problem framing and prioritization.",
    creditCost: 1,
    durationMinutes: getDefaultDuration("product_sense"),
    hintMode: "off",
    source: "fallback",
  };
}
