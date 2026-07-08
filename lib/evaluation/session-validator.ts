/**
 * Session Validation Utility Functions
 * P1-002: Validates session completeness and determines feedback eligibility
 *
 * This module provides validation logic for interview sessions to determine
 * if they meet the minimum requirements for feedback generation.
 */

import { db } from "@/lib/db";
import { transcriptTurn } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Session validation tiers based on completeness
 */
export enum SessionTier {
  /** Full session: ≥20 turns, ≥20 min, ≥5 substantive responses */
  FULL = "full",
  /** Partial session: ≥5 turns, ≥5 min, ≥3 substantive responses */
  PARTIAL = "partial",
  /** Insufficient data: < 5 turns or < 5 min */
  INSUFFICIENT = "insufficient",
  /** Abandoned: 0 turns (user never engaged) */
  ABANDONED = "abandoned",
}

/**
 * Session statistics calculated from transcript data
 */
export interface SessionStats {
  /** Total number of turns (user + interviewer) */
  totalTurns: number;
  /** Number of turns where user spoke */
  userTurns: number;
  /** Total word count across all turns */
  totalWords: number;
  /** Session duration in seconds */
  durationSeconds: number;
  /** Number of substantive user responses (>10 words) */
  substantiveResponses: number;
}

/**
 * Session validation result with detailed reasoning
 */
export interface SessionValidation {
  /** Validation tier (full/partial/insufficient/abandoned) */
  tier: SessionTier;
  /** Whether session is valid for feedback generation */
  isValid: boolean;
  /** Calculated session statistics */
  stats: SessionStats;
  /** List of reasons for rejection (if invalid) */
  reasons: string[];
  /** Recommendations for user */
  recommendations: string[];
}

/**
 * Minimum thresholds for validation tiers
 */
const THRESHOLDS = {
  FULL: {
    minTurns: 20,
    minDurationMinutes: 20,
    minSubstantiveResponses: 5,
  },
  PARTIAL: {
    minTurns: 5,
    minDurationMinutes: 5,
    minSubstantiveResponses: 3,
  },
  MINIMUM: {
    minTurns: 5,
    minDurationMinutes: 5,
  },
} as const;

/**
 * Calculate session statistics from transcript turns
 *
 * @param sessionId - UUID of the interview session
 * @returns Session statistics including turns, words, duration
 *
 * @example
 * ```typescript
 * const stats = await calculateSessionStats(sessionId);
 * console.log(`Session had ${stats.totalTurns} turns`);
 * ```
 */
export async function calculateSessionStats(
  sessionId: string
): Promise<SessionStats> {
  // Fetch all transcript turns for this session
  const turns = await db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [desc(transcriptTurn.startedAt)],
  });

  // Calculate statistics
  const totalTurns = turns.length;
  const userTurns = turns.filter((turn) => turn.speaker === "user").length;

  // Calculate total words (approximate from text length)
  const totalWords = turns.reduce((sum, turn) => {
    if (!turn.text) return sum;
    const words = turn.text.trim().split(/\s+/).length;
    return sum + words;
  }, 0);

  // Calculate duration from first to last turn
  let durationSeconds = 0;
  if (turns.length > 0) {
    const firstTurn = turns[turns.length - 1]; // oldest (sorted desc)
    const lastTurn = turns[0]; // newest

    if (firstTurn.startedAt && lastTurn.endedAt) {
      const startTime = new Date(firstTurn.startedAt).getTime();
      const endTime = new Date(lastTurn.endedAt).getTime();
      durationSeconds = Math.floor((endTime - startTime) / 1000);
    }
  }

  // Count substantive responses (user turns with >10 words)
  const substantiveResponses = turns.filter((turn) => {
    if (turn.speaker !== "user" || !turn.text) return false;
    const wordCount = turn.text.trim().split(/\s+/).length;
    return wordCount > 10;
  }).length;

  return {
    totalTurns,
    userTurns,
    totalWords,
    durationSeconds,
    substantiveResponses,
  };
}

/**
 * Validate session completeness and determine feedback eligibility
 *
 * This function evaluates whether a session meets the minimum requirements
 * for feedback generation based on turns, duration, and response quality.
 *
 * @param sessionId - UUID of the interview session
 * @returns Validation result with tier, validity, stats, and recommendations
 *
 * @example
 * ```typescript
 * const validation = await validateSessionCompleteness(sessionId);
 *
 * if (validation.isValid) {
 *   console.log(`Session qualifies for ${validation.tier} feedback`);
 * } else {
 *   console.log(`Rejected: ${validation.reasons.join(", ")}`);
 * }
 * ```
 */
export async function validateSessionCompleteness(
  sessionId: string
): Promise<SessionValidation> {
  // Calculate session statistics
  const stats = await calculateSessionStats(sessionId);

  // Check for abandoned session (0 turns)
  if (stats.totalTurns === 0) {
    return {
      tier: SessionTier.ABANDONED,
      isValid: false,
      stats,
      reasons: ["Session abandoned: No conversation turns recorded"],
      recommendations: [
        "Start a new interview session",
        "Ensure your microphone is working",
        "Wait for the agent to join before speaking",
      ],
    };
  }

  // Check for insufficient data
  const durationMinutes = Math.floor(stats.durationSeconds / 60);
  const reasons: string[] = [];
  const recommendations: string[] = [];

  if (stats.totalTurns < THRESHOLDS.MINIMUM.minTurns) {
    reasons.push(
      `Too few turns: ${stats.totalTurns} < ${THRESHOLDS.MINIMUM.minTurns} required`
    );
  }

  if (durationMinutes < THRESHOLDS.MINIMUM.minDurationMinutes) {
    reasons.push(
      `Too short: ${durationMinutes} min < ${THRESHOLDS.MINIMUM.minDurationMinutes} min required`
    );
  }

  // Check if user spoke at all
  if (stats.userTurns === 0) {
    reasons.push("User never spoke during session");
    recommendations.push(
      "Ensure your microphone is unmuted",
      "Speak clearly when answering questions"
    );
  }

  // Check for insufficient substantive responses
  if (stats.substantiveResponses < THRESHOLDS.PARTIAL.minSubstantiveResponses) {
    reasons.push(
      `Not enough substantive responses: ${stats.substantiveResponses} < ${THRESHOLDS.PARTIAL.minSubstantiveResponses} required`
    );
    recommendations.push(
      "Provide detailed answers (aim for 50-100 words per response)",
      "Explain your reasoning and thought process"
    );
  }

  // If insufficient, return early
  if (reasons.length > 0) {
    recommendations.unshift(
      "Aim for at least 10 minutes and 5 substantive exchanges for feedback"
    );

    return {
      tier: SessionTier.INSUFFICIENT,
      isValid: false,
      stats,
      reasons,
      recommendations,
    };
  }

  // Determine tier (full vs partial)
  const isFull =
    stats.totalTurns >= THRESHOLDS.FULL.minTurns &&
    durationMinutes >= THRESHOLDS.FULL.minDurationMinutes &&
    stats.substantiveResponses >= THRESHOLDS.FULL.minSubstantiveResponses;

  const tier = isFull ? SessionTier.FULL : SessionTier.PARTIAL;

  return {
    tier,
    isValid: true,
    stats,
    reasons: [],
    recommendations:
      tier === SessionTier.PARTIAL
        ? [
            "For comprehensive feedback, aim for 20+ minutes and 20+ exchanges",
            "This session qualifies for basic feedback",
          ]
        : ["Excellent session length - you'll receive detailed feedback"],
  };
}

/**
 * Check if a session meets minimum requirements for feedback
 *
 * Simplified version of validateSessionCompleteness that only returns boolean.
 *
 * @param sessionId - UUID of the interview session
 * @returns True if session is valid for feedback
 *
 * @example
 * ```typescript
 * if (await isSessionValid(sessionId)) {
 *   await generateFeedback(sessionId);
 * }
 * ```
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const validation = await validateSessionCompleteness(sessionId);
  return validation.isValid;
}

/**
 * Get human-readable validation summary
 *
 * @param validation - Session validation result
 * @returns Formatted summary string
 *
 * @example
 * ```typescript
 * const validation = await validateSessionCompleteness(sessionId);
 * console.log(getValidationSummary(validation));
 * // Output: "Session qualifies for full feedback (25 turns, 23 min)"
 * ```
 */
export function getValidationSummary(validation: SessionValidation): string {
  const { tier, stats } = validation;
  const durationMin = Math.floor(stats.durationSeconds / 60);

  if (!validation.isValid) {
    return `Session ${tier}: ${validation.reasons[0]} (${stats.totalTurns} turns, ${durationMin} min)`;
  }

  return `Session qualifies for ${tier} feedback (${stats.totalTurns} turns, ${durationMin} min)`;
}
