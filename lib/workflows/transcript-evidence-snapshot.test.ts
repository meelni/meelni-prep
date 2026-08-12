import assert from "node:assert/strict";
import test from "node:test";

import {
  SessionTier,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import {
  buildTranscriptEvidenceSnapshot,
  type RuntimeWriterEvidence,
} from "./transcript-evidence-snapshot";

const cutoffAt = new Date("2026-08-07T20:00:00.000Z");

function validation(isValid = true): SessionValidation {
  return {
    tier: isValid ? SessionTier.FULL : SessionTier.INSUFFICIENT,
    isValid,
    stats: {
      totalTurns: isValid ? 20 : 1,
      userTurns: isValid ? 10 : 1,
      totalWords: isValid ? 500 : 5,
      durationSeconds: isValid ? 1_200 : 10,
      substantiveResponses: isValid ? 5 : 0,
      scoreableResponses: isValid ? 5 : 0,
    },
    reasons: isValid ? [] : ["Not enough evidence"],
    recommendations: [],
  };
}

function writer(
  overrides: Partial<RuntimeWriterEvidence> = {}
): RuntimeWriterEvidence {
  return {
    generation: 1,
    contractVersion: 1,
    writerId: "writer-1",
    lastObservedSequence: 20,
    committedSequence: 20,
    committedEventId: "event-20",
    committedThroughAt: new Date("2026-08-07T19:59:59.000Z"),
    integrityState: "healthy",
    settlementState: "settled",
    settledAt: cutoffAt,
    ...overrides,
  };
}

test("complete evidence requires a healthy gap-free settled prefix", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [],
    writers: [writer()],
    baseValidation: validation(),
  });
  assert.equal(snapshot.state, "complete");
  assert.equal(snapshot.validation.tier, SessionTier.FULL);
  assert.equal(snapshot.writers[0]?.settlementState, "settled");
});

test("a healthy DB-proven prefix remains eligible as partial without settlement", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [],
    writers: [writer({ settlementState: null, settledAt: null })],
    baseValidation: validation(),
  });
  assert.equal(snapshot.state, "partial");
  assert.equal(snapshot.validation.isValid, true);
  assert.equal(snapshot.validation.tier, SessionTier.PARTIAL);
  assert.equal(snapshot.writers[0]?.settlementState, "missing");
});

test("a sequence gap fails closed even when the runtime reports settlement", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [],
    writers: [writer({ lastObservedSequence: 22 })],
    baseValidation: validation(),
  });
  assert.equal(snapshot.state, "degraded");
  assert.equal(snapshot.validation.isValid, false);
  assert.match(snapshot.validation.reasons[0] ?? "", /sequence gap/);
});

test("a healthy prefix with no substantive answer remains insufficient", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [],
    writers: [writer()],
    baseValidation: validation(false),
  });
  assert.equal(snapshot.state, "insufficient");
  assert.equal(snapshot.validation.isValid, false);
});

test("settlement from a fenced generation may precede the terminal cutoff", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [],
    writers: [
      writer({
        generation: 1,
        settledAt: new Date("2026-08-07T19:55:00.000Z"),
      }),
      writer({ generation: 2, writerId: "writer-2" }),
    ],
    baseValidation: validation(),
  });
  assert.equal(snapshot.state, "complete");
});

test("a textless interviewer interruption preserves an otherwise healthy partial prefix", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [
      {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
    ],
    writers: [writer({ settlementState: null, settledAt: null })],
    baseValidation: validation(),
  });

  assert.equal(snapshot.state, "partial");
  assert.equal(snapshot.validation.isValid, true);
});

test("candidate and canonicalization interruption markers remain fail-closed", () => {
  for (const interruption of [
    { speaker: "user", reason: "no_provider_confirmed_prefix" },
    { speaker: "interviewer", reason: "canonicalization_failed" },
  ] as const) {
    const snapshot = buildTranscriptEvidenceSnapshot({
      cutoffAt,
      interruptions: [interruption],
      writers: [writer()],
      baseValidation: validation(),
    });

    assert.equal(snapshot.state, "degraded");
    assert.equal(snapshot.validation.isValid, false);
  }
});
