export type FeedbackDimension =
  | "structure"
  | "clarity"
  | "insight"
  | "communication"
  | "leadership";

export interface RubricScores {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
  overall: number;
}

export interface FeedbackItem {
  dimension: FeedbackDimension;
  text: string;
  evidence_quote?: string;
  example?: string;
}

export interface DrillSuggestion {
  title: string;
  description: string;
  tips: string[];
}

export interface EvaluationResponse {
  session_id: string;
  scores: RubricScores;
  strengths: FeedbackItem[];
  improvements: FeedbackItem[];
  drills: DrillSuggestion[];
  summary: string;
}

export const SCORE_WEIGHTS = {
  structure: 0.25,
  clarity: 0.2,
  insight: 0.25,
  communication: 0.15,
  leadership: 0.15
} as const satisfies Record<FeedbackDimension, number>;

export function calculateOverallScore(scores: Omit<RubricScores, "overall">): number {
  const weighted =
    scores.structure * SCORE_WEIGHTS.structure +
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.insight * SCORE_WEIGHTS.insight +
    scores.communication * SCORE_WEIGHTS.communication +
    scores.leadership * SCORE_WEIGHTS.leadership;

  return Math.round(weighted * 10) / 10;
}

export function validateScores(scores: RubricScores): boolean {
  return (
    isScoreInRange(scores.structure) &&
    isScoreInRange(scores.clarity) &&
    isScoreInRange(scores.insight) &&
    isScoreInRange(scores.communication) &&
    isScoreInRange(scores.leadership) &&
    isScoreInRange(scores.overall)
  );
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(10, score));
}

function isScoreInRange(score: number): boolean {
  return score >= 0 && score <= 10;
}
