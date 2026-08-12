import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS,
  deriveCandidateAnswerBlocks,
  projectAnswerBlocksForReviewability,
  type AnswerBlockLedgerEvent,
} from "./answer-blocks";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
  createAnswerBlockTurn,
} from "../../test-fixtures/src/answer-blocks";

test("equivalent speech split into 1, 2, 5, or 10 events has invariant answer blocks", () => {
  const projections = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const fixture = createAnswerBlockSegmentationFixture(segmentCount);
    const derived = deriveCandidateAnswerBlocks(fixture.events);
    assert.equal(derived.eligible, true, String(segmentCount));
    assert.deepEqual(
      projectAnswerBlocksForReviewability(derived.blocks),
      fixture.expectedReviewability,
      String(segmentCount)
    );
    assert.deepEqual(
      derived.blocks.map((block) => block.response.length),
      [segmentCount, segmentCount]
    );
    assert.ok(derived.boundaries.some(({ kind }) => kind === "speaker_change"));
    return projectAnswerBlocksForReviewability(derived.blocks);
  });
  for (const projection of projections.slice(1)) {
    assert.deepEqual(projection, projections[0]);
  }
});

test("source refs, exact text bytes, timing, generation, role, and delivery remain frozen", () => {
  const text = "  I’d test café owners — then measure 20% retained use.  ";
  const source = createAnswerBlockTurn({
    eventId: "opaque:event/id",
    writerId: "writer-two",
    writerGeneration: 2,
    sequence: 7,
    text,
    startedAtMs: 2_000,
    endedAtMs: 3_250,
    audioDurationMs: 1_250,
    deliveryState: "partially_delivered",
  });
  const derived = deriveCandidateAnswerBlocks([
    source,
    { kind: "session_end", occurredAtMs: 3_250 },
  ]);
  const frozen = derived.blocks[0]!.response[0]!;

  assert.equal(frozen.eventId, source.eventId);
  assert.equal(frozen.writerId, source.writerId);
  assert.equal(frozen.writerGeneration, source.writerGeneration);
  assert.equal(frozen.sequence, source.sequence);
  assert.equal(frozen.speaker, source.speaker);
  assert.equal(frozen.text, text);
  assert.deepEqual(frozen.textUtf8Bytes, new TextEncoder().encode(text));
  assert.equal(frozen.startedAtMs, 2_000);
  assert.equal(frozen.endedAtMs, 3_250);
  assert.equal(frozen.audioDurationMs, 1_250);
  assert.equal(frozen.deliveryState, "partially_delivered");
  assert.equal(derived.blocks[0]!.responseText, text.trim());
});

test("every required boundary prevents candidate-fragment coalescing", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 0 });
  const second = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    text: "Then I would validate the riskiest assumption with a small cohort.",
    startedAtMs: 1_300,
    endedAtMs: 2_300,
  });
  const marker = {
    kind: "integrity_boundary" as const,
    eventId: "synthetic-writer:2",
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence: 2,
    speaker: "interviewer" as const,
    occurredAtMs: 1_200,
    reason: "no_provider_confirmed_prefix" as const,
  };
  const cases: Array<{
    name: string;
    events: AnswerBlockLedgerEvent[];
    boundary: string;
  }> = [
    {
      name: "interviewer follow-up",
      events: [
        first,
        createAnswerBlockTurn({
          sequence: 2,
          speaker: "interviewer",
          eventId: "synthetic-writer:2",
          text: "What would you test next?",
          startedAtMs: 1_300,
          endedAtMs: 2_300,
        }),
        createAnswerBlockTurn({
          ...second,
          sequence: 3,
          eventId: "synthetic-writer:3",
          startedAtMs: 2_600,
          endedAtMs: 3_600,
        }),
      ],
      boundary: "interviewer_follow_up",
    },
    {
      name: "interruption marker",
      events: [
        first,
        marker,
        { ...second, sequence: 3, eventId: "synthetic-writer:3" },
      ],
      boundary: "interruption_marker",
    },
    {
      name: "canonicalization failure",
      events: [
        first,
        { ...marker, reason: "canonicalization_failed" },
        { ...second, sequence: 3, eventId: "synthetic-writer:3" },
      ],
      boundary: "canonicalization_failure",
    },
    {
      name: "long silence",
      events: [
        first,
        {
          ...second,
          startedAtMs:
            first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + 1,
          endedAtMs:
            first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + 1_001,
        },
      ],
      boundary: "long_silence",
    },
    {
      name: "writer generation",
      events: [
        first,
        {
          ...second,
          writerId: "replacement-writer",
          writerGeneration: 2,
          sequence: 1,
          eventId: "replacement-writer:1",
        },
      ],
      boundary: "writer_generation",
    },
    {
      name: "session cutoff",
      events: [
        first,
        { kind: "cutoff", reason: "session_cutoff", occurredAtMs: 1_100 },
        second,
      ],
      boundary: "session_cutoff",
    },
    {
      name: "session end",
      events: [first, { kind: "session_end", occurredAtMs: 1_100 }, second],
      boundary: "session_end",
    },
  ];

  for (const fixture of cases) {
    const derived = deriveCandidateAnswerBlocks(fixture.events);
    assert.ok(
      derived.boundaries.some(({ kind }) => kind === fixture.boundary),
      fixture.name
    );
    assert.equal(derived.blocks[0]!.response.length, 1, fixture.name);
    if (fixture.name === "canonicalization failure") {
      assert.equal(derived.eligible, false, fixture.name);
    }
  }
});

test("candidate interruption markers fail closed while an interviewer no-prefix marker preserves integrity", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 0 });
  const marker = {
    kind: "integrity_boundary" as const,
    eventId: "synthetic-writer:2",
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence: 2,
    occurredAtMs: 1_200,
    reason: "no_provider_confirmed_prefix" as const,
  };

  assert.equal(
    deriveCandidateAnswerBlocks([first, { ...marker, speaker: "interviewer" }])
      .eligible,
    true
  );
  assert.equal(
    deriveCandidateAnswerBlocks([first, { ...marker, speaker: "user" }])
      .eligible,
    false
  );
});

test("the exact long-silence threshold coalesces and threshold plus one splits", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 0 });
  for (const [extraMs, expectedBlocks] of [
    [0, 1],
    [1, 2],
  ] as const) {
    const startedAtMs =
      first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + extraMs;
    const second = createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      startedAtMs,
      endedAtMs: startedAtMs + 1_000,
    });
    assert.equal(
      deriveCandidateAnswerBlocks([first, second]).blocks.length,
      expectedBlocks
    );
  }
});

test("same-speaker timing overlap fails closed while interviewer overlap remains a role boundary", () => {
  const candidate = createAnswerBlockTurn({
    sequence: 1,
    startedAtMs: 1_000,
    endedAtMs: 2_000,
  });
  const overlappingCandidate = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    startedAtMs: 1_900,
    endedAtMs: 2_900,
  });
  const candidateOverlap = deriveCandidateAnswerBlocks([
    candidate,
    overlappingCandidate,
  ]);
  assert.equal(candidateOverlap.eligible, false);
  assert.ok(
    candidateOverlap.boundaries.some(({ kind }) => kind === "invalid_timing")
  );
  assert.deepEqual(
    candidateOverlap.blocks.map((block) => block.response.length),
    [1, 1]
  );

  const overlappingInterviewer = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    speaker: "interviewer",
    text: "Let me stop you there. What would you test first?",
    startedAtMs: 1_900,
    endedAtMs: 2_900,
  });
  const roleOverlap = deriveCandidateAnswerBlocks([
    candidate,
    overlappingInterviewer,
  ]);
  assert.equal(roleOverlap.eligible, true);
  assert.ok(
    roleOverlap.boundaries.some(({ kind }) => kind === "interviewer_follow_up")
  );
});

test("a forward sequence gap is an explicit non-coalescing boundary", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 0 });
  const afterGap = createAnswerBlockTurn({
    sequence: 3,
    eventId: "synthetic-writer:3",
    startedAtMs: 1_300,
    endedAtMs: 2_300,
  });
  const derived = deriveCandidateAnswerBlocks([first, afterGap]);

  assert.ok(derived.boundaries.some(({ kind }) => kind === "sequence_gap"));
  assert.deepEqual(
    derived.blocks.map((block) => block.response.length),
    [1, 1]
  );
});

test("duplicate identities, reversed writer order, malformed timing, and post-end events fail closed", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 1_000 });
  const cases: AnswerBlockLedgerEvent[][] = [
    [first, { ...first }],
    [
      first,
      createAnswerBlockTurn({
        sequence: 1,
        eventId: "synthetic-writer:second",
        startedAtMs: 2_300,
        endedAtMs: 3_300,
      }),
    ],
    [
      first,
      createAnswerBlockTurn({
        sequence: 2,
        eventId: "synthetic-writer:2",
        startedAtMs: 0,
        endedAtMs: 500,
        audioDurationMs: 500,
      }),
    ],
    [
      first,
      { kind: "session_end", occurredAtMs: 2_100 },
      createAnswerBlockTurn({ sequence: 2, eventId: "synthetic-writer:2" }),
    ],
    [first, { kind: "cutoff", reason: "session_cutoff", occurredAtMs: 1_500 }],
  ];
  for (const events of cases) {
    assert.equal(deriveCandidateAnswerBlocks(events).eligible, false);
  }
});
