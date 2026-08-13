import assert from "node:assert/strict";
import test from "node:test";

import {
  hasCanonicalFrozenWriterCutoffCoverage,
  hasValidFrozenFeedbackEvaluationSnapshot,
} from "./transcripts";

const terminalSnapshot = {
  evidenceVersion: 1,
  evidenceState: "complete",
  cutoffAt: new Date("2026-08-12T20:00:03.000Z"),
  frozenAt: new Date("2026-08-12T20:00:04.000Z"),
  lifecycleState: "completed",
};

test("accepts only the complete canonical frozen-evidence tuple", () => {
  assert.equal(
    hasValidFrozenFeedbackEvaluationSnapshot(terminalSnapshot),
    true
  );
  assert.equal(
    hasValidFrozenFeedbackEvaluationSnapshot({
      ...terminalSnapshot,
      evidenceState: "partial",
      lifecycleState: "abandoned",
    }),
    true
  );

  for (const invalid of [
    { ...terminalSnapshot, evidenceVersion: null },
    { ...terminalSnapshot, evidenceState: null },
    { ...terminalSnapshot, evidenceState: "insufficient" },
    { ...terminalSnapshot, cutoffAt: null },
    { ...terminalSnapshot, frozenAt: null },
    {
      ...terminalSnapshot,
      frozenAt: new Date(terminalSnapshot.cutoffAt.getTime() - 1),
    },
    { ...terminalSnapshot, lifecycleState: "active" },
  ]) {
    assert.equal(hasValidFrozenFeedbackEvaluationSnapshot(invalid), false);
  }
});

test("requires canonical writer cutoffs for every frozen evidence source", () => {
  const cutoffAt = new Date("2026-08-12T20:00:03.000Z");
  const frozenAt = new Date("2026-08-12T20:00:04.000Z");
  const committedThroughAt = new Date("2026-08-12T20:00:02.000Z");
  const registeredWriters = [
    {
      generation: 1,
      contractVersion: 1,
      writerId: "synthetic-writer",
    },
  ];
  const cutoff = {
    writerGeneration: 1,
    contractVersion: 1,
    writerId: "synthetic-writer",
    committedSequence: 2,
    lastObservedSequence: 2,
    committedEventId: "synthetic-event-2",
    committedThroughAt,
    integrityState: "healthy" as const,
    settlementState: "settled" as const,
    frozenAt,
  };
  const rows = [
    {
      writerGeneration: 1,
      sequence: 2,
      eventId: "synthetic-event-2",
      endedAt: committedThroughAt,
    },
  ];
  const baseInput = {
    registeredWriters,
    cutoffs: [cutoff],
    rows,
    markers: [],
    snapshotState: "complete" as const,
    cutoffAt,
    frozenAt,
  };

  assert.equal(hasCanonicalFrozenWriterCutoffCoverage(baseInput), true);
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      rows: [
        ...rows,
        {
          writerGeneration: 2,
          sequence: 1,
          eventId: "unregistered-event",
          endedAt: committedThroughAt,
        },
      ],
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      cutoffs: [{ ...cutoff, frozenAt: new Date(frozenAt.getTime() + 1) }],
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      cutoffs: [{ ...cutoff, lastObservedSequence: 3 }],
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      cutoffs: [{ ...cutoff, settlementState: "missing" }],
      snapshotState: "partial",
    }),
    true
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      markers: [
        {
          writerGeneration: 1,
          sequence: 1,
          eventId: "synthetic-marker-1",
          occurredAt: new Date("2026-08-12T20:00:01.000Z"),
          speaker: "interviewer",
          reason: "no_provider_confirmed_prefix",
        },
      ],
      snapshotState: "partial",
    }),
    true
  );
  const uncommittedPreservingMarker = {
    writerGeneration: 1,
    sequence: 3,
    eventId: "synthetic-marker-3",
    occurredAt: cutoffAt,
    speaker: "interviewer" as const,
    reason: "no_provider_confirmed_prefix" as const,
  };
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      markers: [uncommittedPreservingMarker],
    }),
    true
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      markers: [uncommittedPreservingMarker],
      snapshotState: "partial",
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      registeredWriters: [
        ...registeredWriters,
        {
          generation: 2,
          contractVersion: 1,
          writerId: "silent-synthetic-writer",
        },
      ],
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      cutoffs: [
        {
          ...cutoff,
          committedThroughAt: new Date(cutoffAt.getTime() + 1),
        },
      ],
      rows: [
        {
          ...rows[0]!,
          endedAt: new Date(cutoffAt.getTime() + 1),
        },
      ],
    }),
    false
  );
  assert.equal(
    hasCanonicalFrozenWriterCutoffCoverage({
      ...baseInput,
      cutoffs: [{ ...cutoff, committedEventId: "wrong-event" }],
    }),
    false
  );
});
