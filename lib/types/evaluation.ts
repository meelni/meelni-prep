/**
 * Type definitions for the evaluation system
 * Used for scoring interview sessions and generating feedback
 */

export interface RubricScores {
  structure: number; // 0-10: Use of frameworks (STAR, 5-step, etc.)
  clarity: number; // 0-10: Clear explanations, avoids jargon
  insight: number; // 0-10: Data-driven thinking, metrics mentioned
  communication: number; // 0-10: Concise, organized, good pacing
  leadership: number; // 0-10: Initiative, ownership, trade-offs
  overall: number; // Weighted average
}

export interface FeedbackItem {
  dimension: "structure" | "clarity" | "insight" | "communication" | "leadership";
  text: string;
  evidence_quote?: string; // For strengths
  example?: string; // For improvements
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

/**
 * Score weights for calculating overall score
 * These match the product requirements
 */
export const SCORE_WEIGHTS = {
  structure: 0.25, // 25%
  clarity: 0.20, // 20%
  insight: 0.25, // 25%
  communication: 0.15, // 15%
  leadership: 0.15, // 15%
} as const;

/**
 * Calculate weighted overall score from individual dimension scores
 */
export function calculateOverallScore(scores: Omit<RubricScores, "overall">): number {
  const weighted =
    scores.structure * SCORE_WEIGHTS.structure +
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.insight * SCORE_WEIGHTS.insight +
    scores.communication * SCORE_WEIGHTS.communication +
    scores.leadership * SCORE_WEIGHTS.leadership;

  // Round to 1 decimal place
  return Math.round(weighted * 10) / 10;
}

/**
 * Validate that scores are within the 0-10 range
 */
export function validateScores(scores: RubricScores): boolean {
  return (
    scores.structure >= 0 && scores.structure <= 10 &&
    scores.clarity >= 0 && scores.clarity <= 10 &&
    scores.insight >= 0 && scores.insight <= 10 &&
    scores.communication >= 0 && scores.communication <= 10 &&
    scores.leadership >= 0 && scores.leadership <= 10 &&
    scores.overall >= 0 && scores.overall <= 10
  );
}

/**
 * Clamp a score to the 0-10 range
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(10, score));
}
