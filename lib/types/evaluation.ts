/**
 * Compatibility exports for the legacy evaluation type import path.
 *
 * Canonical rubric contracts now live in `@meelni/core`.
 */
export {
  SCORE_WEIGHTS,
  calculateOverallScore,
  clampScore,
  validateScores,
  type DrillSuggestion,
  type EvaluationResponse,
  type FeedbackDimension,
  type FeedbackItem,
  type RubricScores,
  type RoundType,
} from "@meelni/core";

/**
 * Legacy evaluation transcript shape used by older evaluation helpers.
 * Full persisted transcript contracts live in `@meelni/core` session exports.
 */
export interface TranscriptTurn {
  speaker: "user" | "interviewer";
  text: string;
  startedAt?: Date;
  endedAt?: Date;
}

export interface SessionData {
  id: string;
  userId: string;
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  mode: "voice_video" | "text";
  transcript: TranscriptTurn[];
}
