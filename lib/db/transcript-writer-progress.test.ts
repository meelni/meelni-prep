import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveTranscriptWriterProgress,
  hasTranscriptWriterGap,
  type TranscriptWriterProgress,
} from "./transcript-writer-progress";

const EMPTY: TranscriptWriterProgress = {
  lastObservedSequence: 0,
  committedSequence: 0,
  committedEventId: null,
  committedThroughAt: null,
  integrityState: "healthy",
};

function fact(
  sequence: number,
  kind: "turn" | "marker" = "turn",
  integrityImpact: "preserve" | "degrade" = kind === "marker"
    ? "degrade"
    : "preserve"
) {
  return {
    sequence,
    eventId: `${kind}-${sequence}`,
    evidenceAt: new Date(
      `2026-08-07T20:00:${String(sequence).padStart(2, "0")}.000Z`
    ),
    kind,
    integrityImpact,
  } as const;
}

test("advances an in-order committed writer watermark", () => {
  const progress = deriveTranscriptWriterProgress({
    current: EMPTY,
    evidence: [fact(1), fact(2)],
  });

  assert.equal(progress.lastObservedSequence, 2);
  assert.equal(progress.committedSequence, 2);
  assert.equal(progress.committedEventId, "turn-2");
  assert.equal(
    progress.committedThroughAt?.toISOString(),
    fact(2).evidenceAt.toISOString()
  );
  assert.equal(progress.integrityState, "healthy");
  assert.equal(hasTranscriptWriterGap(progress), false);
});

test("does not advance across an observed gap", () => {
  const progress = deriveTranscriptWriterProgress({
    current: EMPTY,
    evidence: [fact(2)],
  });

  assert.equal(progress.lastObservedSequence, 2);
  assert.equal(progress.committedSequence, 0);
  assert.equal(hasTranscriptWriterGap(progress), true);
});

test("filling a gap converges an already-persisted suffix", () => {
  const progress = deriveTranscriptWriterProgress({
    current: {
      ...EMPTY,
      lastObservedSequence: 3,
      committedSequence: 1,
      committedEventId: "turn-1",
      committedThroughAt: fact(1).evidenceAt,
    },
    evidence: [fact(2), fact(3)],
  });

  assert.equal(progress.committedSequence, 3);
  assert.equal(progress.committedEventId, "turn-3");
  assert.equal(hasTranscriptWriterGap(progress), false);
});

test("a committed marker permanently degrades writer integrity", () => {
  const progress = deriveTranscriptWriterProgress({
    current: EMPTY,
    evidence: [fact(1, "marker")],
  });

  assert.equal(progress.committedSequence, 1);
  assert.equal(progress.integrityState, "degraded");
});

test("a scoped interviewer marker advances without degrading candidate evidence", () => {
  const progress = deriveTranscriptWriterProgress({
    current: EMPTY,
    evidence: [fact(1, "marker", "preserve")],
  });

  assert.equal(progress.committedSequence, 1);
  assert.equal(progress.integrityState, "healthy");
});

test("conflicting facts for one writer sequence fail closed as degraded", () => {
  const progress = deriveTranscriptWriterProgress({
    current: EMPTY,
    evidence: [fact(1), fact(1, "marker")],
  });

  assert.equal(progress.committedSequence, 1);
  assert.equal(progress.integrityState, "degraded");
});
