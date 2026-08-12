export type TranscriptWriterIntegrityState = "healthy" | "degraded";

export interface TranscriptWriterProgress {
  lastObservedSequence: number;
  committedSequence: number;
  committedEventId: string | null;
  committedThroughAt: Date | null;
  integrityState: TranscriptWriterIntegrityState;
}

export interface TranscriptWriterEvidenceFact {
  sequence: number;
  eventId: string;
  evidenceAt: Date;
  kind: "turn" | "marker";
  integrityImpact: "preserve" | "degrade";
}

/**
 * Advance only across a contiguous writer-local prefix. Callers may provide a
 * bounded suffix when a previously missing sequence arrives; already committed
 * facts do not need to be materialized again.
 */
export function deriveTranscriptWriterProgress(input: {
  current: TranscriptWriterProgress;
  evidence: TranscriptWriterEvidenceFact[];
}): TranscriptWriterProgress {
  const bySequence = new Map<number, TranscriptWriterEvidenceFact>();
  let integrityState = input.current.integrityState;
  let lastObservedSequence = input.current.lastObservedSequence;

  for (const fact of input.evidence) {
    if (
      !Number.isSafeInteger(fact.sequence) ||
      fact.sequence <= 0 ||
      !fact.eventId ||
      !Number.isFinite(fact.evidenceAt.getTime())
    ) {
      throw new Error("invalid_transcript_writer_evidence_fact");
    }
    lastObservedSequence = Math.max(lastObservedSequence, fact.sequence);
    if (fact.integrityImpact === "degrade") integrityState = "degraded";

    const existing = bySequence.get(fact.sequence);
    if (existing) {
      if (
        existing.eventId !== fact.eventId ||
        existing.kind !== fact.kind ||
        existing.integrityImpact !== fact.integrityImpact ||
        existing.evidenceAt.getTime() !== fact.evidenceAt.getTime()
      ) {
        integrityState = "degraded";
      }
      continue;
    }
    bySequence.set(fact.sequence, fact);
  }

  let committedSequence = input.current.committedSequence;
  let committedEventId = input.current.committedEventId;
  let committedThroughAt = input.current.committedThroughAt;
  while (true) {
    const next = bySequence.get(committedSequence + 1);
    if (!next) break;
    committedSequence = next.sequence;
    committedEventId = next.eventId;
    committedThroughAt = next.evidenceAt;
  }

  return {
    lastObservedSequence,
    committedSequence,
    committedEventId,
    committedThroughAt,
    integrityState,
  };
}

export function hasTranscriptWriterGap(
  progress: Pick<
    TranscriptWriterProgress,
    "lastObservedSequence" | "committedSequence"
  >
): boolean {
  return progress.lastObservedSequence !== progress.committedSequence;
}
