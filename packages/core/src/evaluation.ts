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

export const FEEDBACK_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "skipped",
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackScoreEvidence {
  status?: string | null;
  overallScore?: string | number | null;
}

export const SCORE_WEIGHTS = {
  structure: 0.25,
  clarity: 0.2,
  insight: 0.25,
  communication: 0.15,
  leadership: 0.15,
} as const satisfies Record<FeedbackDimension, number>;

export function calculateOverallScore(
  scores: Omit<RubricScores, "overall">
): number {
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

export function parseRubricScore(
  score: string | number | null | undefined
): number | null {
  if (
    score === null ||
    score === undefined ||
    (typeof score === "string" && score.trim() === "")
  ) {
    return null;
  }

  const parsed = typeof score === "number" ? score : Number(score);
  return Number.isFinite(parsed) && isScoreInRange(parsed) ? parsed : null;
}

export function getCompletedFeedbackScore(
  feedback: FeedbackScoreEvidence | null | undefined
): number | null {
  if (feedback?.status !== "completed") return null;
  return parseRubricScore(feedback.overallScore);
}

export function isCompletedScoredFeedback(
  feedback: FeedbackScoreEvidence | null | undefined
): boolean {
  return getCompletedFeedbackScore(feedback) !== null;
}

function isScoreInRange(score: number): boolean {
  return score >= 0 && score <= 10;
}
