import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const sav496Incident = JSON.parse(
  readFileSync(
    new URL(
      "../../packages/test-fixtures/runtime-settlement-sav496.json",
      import.meta.url
    ),
    "utf8"
  )
) as {
  contractVersion: string;
  durationSeconds: number;
  writerGeneration: number;
  committedSequence: number;
  lastObservedSequence: number;
  totalTurns: number;
  candidateTurns: number;
  substantiveCandidateResponses: number;
  scoreableCandidateResponses: number;
  preservingInterviewerMarkers: number;
  lateRuntimeSettledConflicts: number;
  expectedUnresolvedSettlementState: string;
  expectedFeedbackMode: string;
};

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
  assert.equal(
    snapshot.validation.stats.feedbackModeConstraint,
    "evidence_limited_only"
  );
  assert.equal(snapshot.writers[0]?.settlementState, "missing");
});

test("SAV-496 sanitized Production shape stays reviewable when terminal settlement is unresolved", () => {
  assert.equal(
    sav496Incident.contractVersion,
    "sav-496-runtime-settlement-regression.v1"
  );
  assert.equal(sav496Incident.lateRuntimeSettledConflicts, 1);
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: Array.from(
      { length: sav496Incident.preservingInterviewerMarkers },
      () => ({
        speaker: "interviewer" as const,
        reason: "no_provider_confirmed_prefix" as const,
      })
    ),
    writers: [
      writer({
        generation: sav496Incident.writerGeneration,
        committedSequence: sav496Incident.committedSequence,
        lastObservedSequence: sav496Incident.lastObservedSequence,
        committedEventId: "synthetic-sequence-28",
        settlementState: null,
        settledAt: null,
      }),
    ],
    baseValidation: {
      tier: SessionTier.FULL,
      isValid: true,
      stats: {
        totalTurns: sav496Incident.totalTurns,
        userTurns: sav496Incident.candidateTurns,
        totalWords: 1_191,
        durationSeconds: sav496Incident.durationSeconds,
        substantiveResponses: sav496Incident.substantiveCandidateResponses,
        scoreableResponses: sav496Incident.scoreableCandidateResponses,
      },
      reasons: [],
      recommendations: [],
    },
  });

  assert.equal(snapshot.state, "partial");
  assert.equal(snapshot.validation.isValid, true);
  assert.equal(
    snapshot.writers[0]?.settlementState,
    sav496Incident.expectedUnresolvedSettlementState
  );
  assert.equal(
    snapshot.validation.stats.feedbackModeConstraint,
    sav496Incident.expectedFeedbackMode
  );
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
  assert.equal(
    snapshot.validation.stats.feedbackModeConstraint,
    "evidence_limited_only"
  );
});

test("a settled textless interviewer interruption remains qualitative-only", () => {
  const snapshot = buildTranscriptEvidenceSnapshot({
    cutoffAt,
    interruptions: [
      {
        speaker: "interviewer",
        reason: "no_provider_confirmed_prefix",
      },
    ],
    writers: [writer()],
    baseValidation: validation(),
  });

  assert.equal(snapshot.state, "partial");
  assert.equal(snapshot.validation.tier, SessionTier.PARTIAL);
  assert.equal(snapshot.validation.stats.scoreableResponses, 5);
  assert.equal(
    snapshot.validation.stats.feedbackModeConstraint,
    "evidence_limited_only"
  );
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
