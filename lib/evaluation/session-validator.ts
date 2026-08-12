/**
 * Session Validation Utility Functions
 * P1-002: Validates session completeness and determines feedback eligibility
 *
 * This module provides validation logic for interview sessions to determine
 * if they meet the minimum requirements for feedback generation.
 */

import { db } from "@/lib/db";
import { transcriptTurn } from "@/lib/db/schema";
import { transcriptChronologicalOrder } from "@/lib/db/transcript-ordering";
import { eq } from "drizzle-orm";
import {
  classifyCandidateResponseEvidence,
  deriveCandidateAnswerBlocks,
  FEEDBACK_ELIGIBILITY_POLICY,
  prepareFeedbackTranscript,
  type AnswerBlockIntegrityBoundaryEvent,
  type AnswerBlockLedgerEvent,
  type CandidateAnswerBlock,
  type CandidateResponseEvidenceLevel,
  type SkippedFeedbackOutcomeReason,
} from "@meelni/core";

/**
 * Session validation tiers based on completeness
 */
export enum SessionTier {
  /** Broad evidence: at least five substantive candidate responses. */
  FULL = "full",
  /** Reviewable evidence: at least one substantive candidate response. */
  PARTIAL = "partial",
  /** No trustworthy substantive candidate answer. */
  INSUFFICIENT = "insufficient",
  /** No transcript turns were committed. */
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
  /** Reviewable responses for strict or qualitative-only feedback. */
  substantiveResponses: number;
  /** Substantive responses that also satisfy numerical-score coherence. */
  scoreableResponses: number;
  /** Durable freeze-time restriction when evidence must remain qualitative. */
  feedbackModeConstraint?: "evidence_limited_only";
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
  /** Closed, durable classification for non-reviewable evidence. */
  evidenceFailureReason?: SkippedFeedbackOutcomeReason | null;
}

export interface SessionValidationTurnInput {
  speaker: string;
  text: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  eventId?: string | null;
  contractVersion?: number | null;
  writerId?: string | null;
  writerGeneration?: number | null;
  sequence?: number | null;
  audioMs?: number | null;
  section?: string | null;
  deliveryState?: string | null;
}

export interface SessionValidationInterruptionInput {
  eventId: string;
  writerId: string;
  writerGeneration: number;
  sequence: number;
  speaker: "user" | "interviewer";
  occurredAt: Date;
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
}

export interface CalculateValidatedSessionOptions {
  interruptions?: readonly SessionValidationInterruptionInput[];
  sessionEndAt?: Date;
}

/**
 * Minimum thresholds for validation tiers
 */
const THRESHOLDS = {
  FULL: FEEDBACK_ELIGIBILITY_POLICY.full,
  PARTIAL: FEEDBACK_ELIGIBILITY_POLICY.partial,
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
    orderBy: transcriptChronologicalOrder(),
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

  const evidenceLevels = turns.flatMap((turn) =>
    turn.speaker === "user" && turn.text
      ? [classifyUserResponseEvidence(turn.text)]
      : []
  );
  const substantiveResponses = evidenceLevels.filter(
    (level) => level !== "insufficient"
  ).length;
  const scoreableResponses = evidenceLevels.filter(
    (level) => level === "scoreable"
  ).length;

  return {
    totalTurns,
    userTurns,
    totalWords,
    durationSeconds,
    substantiveResponses,
    scoreableResponses,
  };
}

const FILLER_WORDS = new Set([
  "actually",
  "ah",
  "anyway",
  "basically",
  "er",
  "first",
  "hmm",
  "honestly",
  "like",
  "literally",
  "maybe",
  "no",
  "okay",
  "perhaps",
  "possibly",
  "probably",
  "right",
  "second",
  "so",
  "third",
  "totally",
  "uh",
  "um",
  "whatever",
  "well",
  "yeah",
  "yes",
]);

function classifyUserResponseEvidence(
  text: string
): CandidateResponseEvidenceLevel {
  const words = tokenizeWords(text).map((word) =>
    word.toLocaleLowerCase("en-US")
  );
  if (words.length <= 10) return "insufficient";
  const uniqueWords = new Set(words);
  const contentWords = new Set(words.filter((word) => !FILLER_WORDS.has(word)));
  const alphabeticCharacters = (text.match(/\p{L}/gu) ?? []).length;
  return classifyCandidateResponseEvidence({
    text,
    passesQuantitativeGates:
      uniqueWords.size / words.length >= 0.35 &&
      contentWords.size >= 6 &&
      alphabeticCharacters >= 30,
  });
}

function tokenizeWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];
}

/**
 * Validate session completeness and determine feedback eligibility
 *
 * This function evaluates whether the frozen trustworthy transcript contains
 * substantive candidate evidence and whether that evidence is safe to score.
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
    orderBy: transcriptChronologicalOrder(),
  });

  return calculateValidatedSessionFromTurns(turns);
}

/**
 * Prepare the exact transcript set used for feedback before calculating its
 * tier. Persisted rows expose canonical fields; callers without those fields
 * retain the legacy statistics path for compatibility.
 */
export function calculateValidatedSessionFromTurns(
  turns: SessionValidationTurnInput[],
  options: CalculateValidatedSessionOptions = {}
): SessionValidation {
  const hasCanonicalFields = turns.some((turn) =>
    [
      turn.contractVersion,
      turn.eventId,
      turn.writerId,
      turn.writerGeneration,
      turn.sequence,
      turn.audioMs,
      turn.section,
      turn.deliveryState,
    ].some((value) => value != null)
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
      turn.endedAt <= turn.startedAt
  );

  const prepared = prepareFeedbackTranscript(
    turns.map((turn) => ({
      eventId: turn.eventId ?? null,
      speaker: turn.speaker,
      text: turn.text,
      contractVersion: turn.contractVersion ?? null,
      deliveryState: turn.deliveryState ?? null,
    })),
    { requireContractV2: true }
  );
  const byEventId = new Map(
    turns.flatMap((turn) =>
      turn.eventId ? [[turn.eventId, turn] as const] : []
    )
  );
  const answerBlockDerivation = deriveCandidateAnswerBlocks(
    orderAnswerBlockLedgerEvents([
      ...prepared.transcript.flatMap((turn) => {
        const source = byEventId.get(turn.eventId);
        return source ? toAnswerBlockTurn(source) : [];
      }),
      ...(options.interruptions ?? []).map(toAnswerBlockInterruption),
      ...(options.sessionEndAt &&
      Number.isFinite(options.sessionEndAt.getTime())
        ? [
            {
              kind: "session_end" as const,
              occurredAtMs: options.sessionEndAt.getTime(),
            },
          ]
        : []),
    ])
  );
  const preparedAnswerBlocks = answerBlockDerivation.blocks.map((block) =>
    prepareFeedbackTranscript([
      {
        eventId: block.answerBlockId,
        speaker: "user",
        text: block.responseText,
      },
    ])
  );
  const evidenceLevels = preparedAnswerBlocks.flatMap((preparedBlock) =>
    preparedBlock.transcript.map((turn) =>
      classifyUserResponseEvidence(turn.text)
    )
  );
  const stats: SessionStats = {
    ...calculateAnswerBlockSessionStats(answerBlockDerivation.blocks),
    substantiveResponses: evidenceLevels.filter(
      (level) => level !== "insufficient"
    ).length,
    scoreableResponses: evidenceLevels.filter((level) => level === "scoreable")
      .length,
  };
  const thresholdValidation = validateSessionStats(stats);
  if (
    prepared.eligible &&
    answerBlockDerivation.eligible &&
    preparedAnswerBlocks.every((preparedBlock) => preparedBlock.eligible) &&
    !hasInvalidTiming
  ) {
    return thresholdValidation;
  }

  const hasCorruptEvidence =
    hasInvalidTiming ||
    !answerBlockDerivation.eligible ||
    prepared.issues.some(
      (issue) =>
        issue.fatal &&
        (issue.code === "malformed_event" || issue.code === "prompt_injection")
    ) ||
    preparedAnswerBlocks.some((preparedBlock) =>
      preparedBlock.issues.some(
        (issue) =>
          issue.fatal &&
          (issue.code === "malformed_event" ||
            issue.code === "prompt_injection")
      )
    );

  return {
    tier: turns.length === 0 ? SessionTier.ABANDONED : SessionTier.INSUFFICIENT,
    isValid: false,
    stats,
    reasons: [
      hasCorruptEvidence
        ? "The saved transcript could not be verified"
        : "No reviewable candidate answer was recorded",
    ],
    recommendations: [],
    evidenceFailureReason: hasCorruptEvidence
      ? "transcript_integrity_degraded"
      : "no_reviewable_answer",
  };
}

function calculateAnswerBlockSessionStats(
  blocks: readonly CandidateAnswerBlock[]
): SessionStats {
  const promptGroups = new Map<string, CandidateAnswerBlock["prompt"]>();
  for (const block of blocks) {
    if (block.prompt.length === 0) continue;
    promptGroups.set(
      JSON.stringify(block.prompt.map((turn) => turn.eventId)),
      block.prompt
    );
  }
  const logicalTurns = [
    ...[...promptGroups.values()].map((prompt) => ({
      text: prompt.map((turn) => turn.text.trim()).join(" "),
      startedAtMs: prompt[0]!.startedAtMs,
      endedAtMs: prompt.at(-1)!.endedAtMs,
    })),
    ...blocks.map((block) => ({
      text: block.responseText,
      startedAtMs: block.startedAtMs,
      endedAtMs: block.endedAtMs,
    })),
  ];
  const startedAtMs = logicalTurns.map((turn) => turn.startedAtMs);
  const endedAtMs = logicalTurns.map((turn) => turn.endedAtMs);
  return {
    totalTurns: logicalTurns.length,
    userTurns: blocks.length,
    totalWords: logicalTurns.reduce(
      (sum, turn) => sum + tokenizeWords(turn.text).length,
      0
    ),
    durationSeconds:
      logicalTurns.length === 0
        ? 0
        : Math.max(
            0,
            Math.floor(
              (Math.max(...endedAtMs) - Math.min(...startedAtMs)) / 1000
            )
          ),
    substantiveResponses: 0,
    scoreableResponses: 0,
  };
}

function toAnswerBlockTurn(
  turn: SessionValidationTurnInput
): AnswerBlockLedgerEvent[] {
  if (
    turn.contractVersion !== 2 ||
    !turn.eventId ||
    !turn.writerId ||
    !Number.isSafeInteger(turn.writerGeneration) ||
    (turn.writerGeneration ?? 0) <= 0 ||
    !Number.isSafeInteger(turn.sequence) ||
    (turn.sequence ?? 0) <= 0 ||
    (turn.speaker !== "user" && turn.speaker !== "interviewer") ||
    !turn.text ||
    !turn.startedAt ||
    !turn.endedAt ||
    !Number.isSafeInteger(turn.audioMs) ||
    (turn.audioMs ?? 0) <= 0 ||
    !turn.section ||
    (turn.deliveryState !== "delivered" &&
      turn.deliveryState !== "partially_delivered")
  ) {
    return [
      {
        kind: "turn",
        contractVersion: 2,
        eventId: turn.eventId ?? "",
        writerId: turn.writerId ?? "",
        writerGeneration: turn.writerGeneration ?? 0,
        sequence: turn.sequence ?? 0,
        speaker: turn.speaker === "interviewer" ? "interviewer" : "user",
        text: turn.text ?? "",
        isFinal: true,
        startedAtMs: turn.startedAt?.getTime() ?? Number.NaN,
        endedAtMs: turn.endedAt?.getTime() ?? Number.NaN,
        audioDurationMs: turn.audioMs ?? 0,
        section: turn.section ?? "",
        deliveryState:
          turn.deliveryState === "partially_delivered"
            ? "partially_delivered"
            : "delivered",
      },
    ];
  }
  return [
    {
      kind: "turn",
      contractVersion: 2,
      eventId: turn.eventId,
      writerId: turn.writerId,
      writerGeneration: turn.writerGeneration!,
      sequence: turn.sequence!,
      speaker: turn.speaker,
      text: turn.text,
      isFinal: true,
      startedAtMs: turn.startedAt.getTime(),
      endedAtMs: turn.endedAt.getTime(),
      audioDurationMs: turn.audioMs!,
      section: turn.section,
      deliveryState: turn.deliveryState,
    },
  ];
}

function toAnswerBlockInterruption(
  marker: SessionValidationInterruptionInput
): AnswerBlockIntegrityBoundaryEvent {
  return {
    kind: "integrity_boundary",
    eventId: marker.eventId,
    writerId: marker.writerId,
    writerGeneration: marker.writerGeneration,
    sequence: marker.sequence,
    speaker: marker.speaker,
    occurredAtMs: marker.occurredAt.getTime(),
    reason: marker.reason,
  };
}

function orderAnswerBlockLedgerEvents(
  events: AnswerBlockLedgerEvent[]
): AnswerBlockLedgerEvent[] {
  return events.sort((left, right) => {
    if (
      "writerGeneration" in left &&
      "writerGeneration" in right &&
      left.writerGeneration === right.writerGeneration &&
      left.writerId === right.writerId
    ) {
      return left.sequence - right.sequence;
    }
    return (
      answerBlockEventTime(left) - answerBlockEventTime(right) ||
      answerBlockEventRank(left) - answerBlockEventRank(right) ||
      ("writerGeneration" in left ? left.writerGeneration : 0) -
        ("writerGeneration" in right ? right.writerGeneration : 0) ||
      ("writerId" in left ? left.writerId : "").localeCompare(
        "writerId" in right ? right.writerId : ""
      ) ||
      ("sequence" in left ? left.sequence : 0) -
        ("sequence" in right ? right.sequence : 0)
    );
  });
}

function answerBlockEventTime(event: AnswerBlockLedgerEvent): number {
  return event.kind === "turn" ? event.startedAtMs : event.occurredAtMs;
}

function answerBlockEventRank(event: AnswerBlockLedgerEvent): number {
  if (event.kind === "turn") return 0;
  if (event.kind === "integrity_boundary") return 1;
  return 2;
}

export function validateSessionStats(stats: SessionStats): SessionValidation {
  if (stats.totalTurns === 0) {
    return {
      tier: SessionTier.ABANDONED,
      isValid: false,
      stats,
      reasons: ["No reviewable candidate answer was recorded"],
      recommendations: [],
      evidenceFailureReason: "no_reviewable_answer",
    };
  }

  if (stats.substantiveResponses < THRESHOLDS.PARTIAL.minSubstantiveResponses) {
    return {
      tier: SessionTier.INSUFFICIENT,
      isValid: false,
      stats,
      reasons: ["No reviewable candidate answer was recorded"],
      recommendations: [],
      evidenceFailureReason: "no_reviewable_answer",
    };
  }

  const isFull =
    stats.scoreableResponses >= THRESHOLDS.FULL.minScoreableResponses;

  const tier = isFull ? SessionTier.FULL : SessionTier.PARTIAL;

  return {
    tier,
    isValid: true,
    stats,
    reasons: [],
    recommendations: [],
    evidenceFailureReason: null,
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
