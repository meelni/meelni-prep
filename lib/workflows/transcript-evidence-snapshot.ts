import {
  SessionTier,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";

export type TranscriptEvidenceState =
  | "complete"
  | "partial"
  | "insufficient"
  | "degraded";

export interface RuntimeWriterEvidence {
  generation: number;
  contractVersion: number;
  writerId: string;
  lastObservedSequence: number;
  committedSequence: number;
  committedEventId: string | null;
  committedThroughAt: Date | null;
  integrityState: "healthy" | "degraded";
  settlementState: "settled" | "degraded" | null;
  settledAt: Date | null;
}

export interface FrozenWriterEvidence {
  writerGeneration: number;
  contractVersion: number;
  writerId: string;
  lastObservedSequence: number;
  committedSequence: number;
  committedEventId: string | null;
  committedThroughAt: Date | null;
  integrityState: "healthy" | "degraded";
  settlementState: "settled" | "missing" | "degraded";
}

export interface TranscriptEvidenceSnapshot {
  state: TranscriptEvidenceState;
  validation: SessionValidation;
  writers: FrozenWriterEvidence[];
  integrityReasons: string[];
}

/**
 * Freeze the largest database-proven, gap-free prefix available at the
 * terminal cutoff. Missing runtime settlement can reduce feedback to partial;
 * gaps, markers, or malformed writer boundaries fail closed.
 */
export function buildTranscriptEvidenceSnapshot(input: {
  cutoffAt: Date;
  interruptionCount: number;
  writers: RuntimeWriterEvidence[];
  baseValidation: SessionValidation;
}): TranscriptEvidenceSnapshot {
  const cutoffMs = input.cutoffAt.getTime();
  const writers = input.writers.map((writer) => ({
    writerGeneration: writer.generation,
    contractVersion: writer.contractVersion,
    writerId: writer.writerId,
    lastObservedSequence: writer.lastObservedSequence,
    committedSequence: writer.committedSequence,
    committedEventId: writer.committedEventId,
    committedThroughAt: writer.committedThroughAt,
    integrityState: writer.integrityState,
    settlementState: normalizeSettlementState(writer, cutoffMs),
  }));

  const integrityReasons = [
    ...(input.baseValidation.evidenceFailureReason ===
    "transcript_integrity_degraded"
      ? ["Canonical transcript validation failed"]
      : []),
    ...(writers.length === 0
      ? ["Voice runtime writer registration was not confirmed"]
      : []),
    ...writers.flatMap((writer) => writerIntegrityReasons(writer, cutoffMs)),
    ...(input.interruptionCount > 0
      ? [
          `Transcript integrity unavailable for ${input.interruptionCount} turn(s)`,
        ]
      : []),
  ];

  if (integrityReasons.length > 0) {
    return {
      state: "degraded",
      validation: invalidateForIntegrity(
        input.baseValidation,
        integrityReasons
      ),
      writers,
      integrityReasons,
    };
  }
  if (!input.baseValidation.isValid) {
    return {
      state: "insufficient",
      validation: input.baseValidation,
      writers,
      integrityReasons,
    };
  }
  if (writers.every((writer) => writer.settlementState === "settled")) {
    return {
      state: "complete",
      validation: input.baseValidation,
      writers,
      integrityReasons,
    };
  }
  return {
    state: "partial",
    validation: {
      ...input.baseValidation,
      tier: SessionTier.PARTIAL,
      recommendations: [],
    },
    writers,
    integrityReasons,
  };
}

function normalizeSettlementState(
  writer: RuntimeWriterEvidence,
  cutoffMs: number
): "settled" | "missing" | "degraded" {
  if (writer.settlementState === "degraded") return "degraded";
  if (
    writer.settlementState === "settled" &&
    writer.settledAt &&
    Number.isFinite(writer.settledAt.getTime()) &&
    writer.settledAt.getTime() <= cutoffMs
  ) {
    return "settled";
  }
  return "missing";
}

function writerIntegrityReasons(
  writer: FrozenWriterEvidence,
  cutoffMs: number
): string[] {
  const prefixBoundaryIsValid =
    Number.isSafeInteger(writer.committedSequence) &&
    Number.isSafeInteger(writer.lastObservedSequence) &&
    writer.committedSequence >= 0 &&
    writer.lastObservedSequence >= writer.committedSequence &&
    ((writer.committedSequence === 0 &&
      writer.committedEventId === null &&
      writer.committedThroughAt === null) ||
      (writer.committedSequence > 0 &&
        Boolean(writer.committedEventId) &&
        writer.committedThroughAt !== null &&
        Number.isFinite(writer.committedThroughAt.getTime()) &&
        writer.committedThroughAt.getTime() <= cutoffMs));
  return [
    ...(writer.integrityState === "degraded" ||
    writer.settlementState === "degraded"
      ? [
          `Voice runtime reported degraded transcript integrity for writer generation ${writer.writerGeneration}`,
        ]
      : []),
    ...(writer.lastObservedSequence !== writer.committedSequence
      ? [
          `Transcript writer generation ${writer.writerGeneration} has an uncommitted sequence gap`,
        ]
      : []),
    ...(!prefixBoundaryIsValid
      ? [
          `Transcript writer generation ${writer.writerGeneration} has an invalid committed boundary`,
        ]
      : []),
  ];
}

function invalidateForIntegrity(
  baseValidation: SessionValidation,
  reasons: string[]
): SessionValidation {
  return {
    ...baseValidation,
    isValid: false,
    reasons: [...reasons, ...baseValidation.reasons],
    recommendations: [],
    evidenceFailureReason: "transcript_integrity_degraded",
  };
}
