/**
 * Session Validation Utility Functions
 * P1-002: Validates session completeness and determines feedback eligibility
 *
 * This module provides validation logic for interview sessions to determine
 * if they meet the minimum requirements for feedback generation.
 */

import { db } from "@/lib/db";
import { transcriptTurn } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { prepareFeedbackTranscript } from "@meelni/core";

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
    orderBy: [
      asc(transcriptTurn.startedAt),
      asc(transcriptTurn.writerId),
      asc(transcriptTurn.sequence),
      asc(transcriptTurn.eventId),
      asc(transcriptTurn.id),
    ],
  });

  return calculateValidatedSessionFromTurns(turns).stats;
}

export function calculateSessionStatsFromTurns(
  turns: Array<{
    speaker: string;
    text: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
  }>
): SessionStats {
  const totalTurns = turns.length;
  const userTurns = turns.filter((turn) => turn.speaker === "user").length;

  // Calculate total words (approximate from text length)
  const totalWords = turns.reduce((sum, turn) => {
    if (!turn.text) return sum;
    return sum + tokenizeWords(turn.text).length;
  }, 0);

  const startTimes = turns.flatMap((turn) =>
    turn.startedAt && Number.isFinite(turn.startedAt.getTime())
      ? [turn.startedAt.getTime()]
      : []
  );
  const endTimes = turns.flatMap((turn) =>
    turn.endedAt && Number.isFinite(turn.endedAt.getTime())
      ? [turn.endedAt.getTime()]
      : []
  );
  const durationSeconds =
    startTimes.length > 0 && endTimes.length > 0
      ? Math.max(
          0,
          Math.floor((Math.max(...endTimes) - Math.min(...startTimes)) / 1000)
        )
      : 0;

  // Count responses with enough length and lexical variety for honest scoring.
  const substantiveResponses = turns.filter((turn) => {
    if (turn.speaker !== "user" || !turn.text) return false;
    return isSubstantiveUserResponse(turn.text);
  }).length;

  return {
    totalTurns,
    userTurns,
    totalWords,
    durationSeconds,
    substantiveResponses,
  };
}

const FILLER_WORDS = new Set([
  "ah",
  "er",
  "hmm",
  "like",
  "no",
  "okay",
  "right",
  "so",
  "uh",
  "um",
  "well",
  "yeah",
  "yes",
]);

function isSubstantiveUserResponse(text: string): boolean {
  const words = tokenizeWords(text).map((word) =>
    word.toLocaleLowerCase("en-US")
  );
  if (words.length <= 10) return false;
  const uniqueWords = new Set(words);
  const contentWords = new Set(words.filter((word) => !FILLER_WORDS.has(word)));
  const alphabeticCharacters = (text.match(/\p{L}/gu) ?? []).length;
  return (
    uniqueWords.size / words.length >= 0.35 &&
    contentWords.size >= 6 &&
    alphabeticCharacters >= 30
  );
}

function tokenizeWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];
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
  const turns = await db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [
      asc(transcriptTurn.startedAt),
      asc(transcriptTurn.writerId),
      asc(transcriptTurn.sequence),
      asc(transcriptTurn.eventId),
      asc(transcriptTurn.id),
    ],
  });

  return calculateValidatedSessionFromTurns(turns);
}

/**
 * Prepare the exact transcript set used for feedback before calculating its
 * tier. Persisted rows expose canonical fields; callers without those fields
 * retain the legacy statistics path for compatibility.
 */
export function calculateValidatedSessionFromTurns(
  turns: Array<{
    speaker: string;
    text: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    eventId?: string | null;
    contractVersion?: number | null;
  }>
): SessionValidation {
  const hasCanonicalFields = turns.some(
    (turn) => "eventId" in turn || "contractVersion" in turn
  );
  if (!hasCanonicalFields) {
    return validateSessionStats(calculateSessionStatsFromTurns(turns));
  }

  const hasInvalidTiming = turns.some(
    (turn) =>
      !turn.startedAt ||
      !turn.endedAt ||
      !Number.isFinite(turn.startedAt.getTime()) ||
      !Number.isFinite(turn.endedAt.getTime()) ||
      turn.endedAt < turn.startedAt
  );

  const prepared = prepareFeedbackTranscript(
    turns.map((turn) => ({
      eventId: turn.eventId ?? null,
      speaker: turn.speaker,
      text: turn.text,
      contractVersion: turn.contractVersion ?? null,
    })),
    { requireContractV2: true }
  );
  const byEventId = new Map(
    turns.flatMap((turn) =>
      turn.eventId ? [[turn.eventId, turn] as const] : []
    )
  );
  const stats = calculateSessionStatsFromTurns(
    prepared.transcript.map((turn) => {
      const source = byEventId.get(turn.eventId);
      return {
        speaker: turn.speaker,
        text: turn.text,
        startedAt: source?.startedAt ?? null,
        endedAt: source?.endedAt ?? null,
      };
    })
  );
  const thresholdValidation = validateSessionStats(stats);
  if (prepared.eligible && !hasInvalidTiming) return thresholdValidation;

  return {
    tier: turns.length === 0 ? SessionTier.ABANDONED : SessionTier.INSUFFICIENT,
    isValid: false,
    stats,
    reasons: [
      ...prepared.reasons,
      ...(hasInvalidTiming ? ["Transcript timing data is corrupted"] : []),
      ...thresholdValidation.reasons,
    ],
    recommendations: [
      ...new Set([
        "Start a new interview so we can record enough trustworthy evidence",
        ...thresholdValidation.recommendations,
      ]),
    ],
  };
}

export function validateSessionStats(stats: SessionStats): SessionValidation {
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
