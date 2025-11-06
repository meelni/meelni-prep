// Type definitions for feedback UI components
// Re-exports and extends types from evaluation.ts

import type {
  RubricScores,
  FeedbackItem,
  DrillSuggestion,
  EvaluationResponse,
  TranscriptTurn as EvalTranscriptTurn,
} from "./evaluation";

// Re-export evaluation types for use in feedback components
export type { RubricScores, FeedbackItem, DrillSuggestion, EvaluationResponse };

// Extended transcript type for UI display with additional properties
export interface TranscriptTurn extends Omit<EvalTranscriptTurn, "startedAt" | "endedAt"> {
  id: string;
  timestamp: string; // ISO 8601 format for display
  highlighted?: boolean; // For highlighting key moments referenced in feedback
}

// Rubric dimension descriptions for UI display
export const RUBRIC_DESCRIPTIONS: Record<keyof Omit<RubricScores, "overall">, string> = {
  structure: "Organized thinking with clear frameworks",
  clarity: "Clear communication and articulation",
  insight: "Deep analysis and creative solutions",
  communication: "Effective verbal and non-verbal skills",
  leadership: "Decision-making and strategic thinking",
};
