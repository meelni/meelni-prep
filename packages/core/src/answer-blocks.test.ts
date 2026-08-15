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
      name: "candidate interruption marker",
      events: [
        first,
        { ...marker, speaker: "user" },
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
    if (
      fixture.name === "candidate interruption marker" ||
      fixture.name === "canonicalization failure"
    ) {
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

test("repeated interviewer no-prefix markers are transparent to prompt and answer continuity", () => {
  const events: AnswerBlockLedgerEvent[] = [
    createAnswerBlockTurn({
      sequence: 1,
      speaker: "interviewer",
      text: "How would you choose the first customer?",
      startedAtMs: 0,
      endedAtMs: 800,
      audioDurationMs: 800,
    }),
    {
      kind: "integrity_boundary",
      eventId: "synthetic-writer:2",
      writerId: "synthetic-writer",
      writerGeneration: 1,
      sequence: 2,
      speaker: "interviewer",
      occurredAtMs: 900,
      reason: "no_provider_confirmed_prefix",
    },
    createAnswerBlockTurn({
      sequence: 3,
      eventId: "synthetic-writer:3",
      text: "I would begin with caregivers who coordinate weekly handoffs.",
      startedAtMs: 1_000,
      endedAtMs: 1_800,
      audioDurationMs: 800,
    }),
    {
      kind: "integrity_boundary",
      eventId: "synthetic-writer:4",
      writerId: "synthetic-writer",
      writerGeneration: 1,
      sequence: 4,
      speaker: "interviewer",
      occurredAtMs: 1_900,
      reason: "no_provider_confirmed_prefix",
    },
    createAnswerBlockTurn({
      sequence: 5,
      eventId: "synthetic-writer:5",
      text: "Then I would validate whether the failure repeats before building.",
      startedAtMs: 2_000,
      endedAtMs: 2_800,
      audioDurationMs: 800,
    }),
    createAnswerBlockTurn({
      sequence: 6,
      eventId: "synthetic-writer:6",
      speaker: "interviewer",
      text: "What result would change your plan?",
      startedAtMs: 3_000,
      endedAtMs: 3_800,
      audioDurationMs: 800,
    }),
    { kind: "session_end", occurredAtMs: 4_000 },
  ];

  const derived = deriveCandidateAnswerBlocks(events);

  assert.equal(derived.eligible, true);
  assert.deepEqual(derived.issues, []);
  assert.deepEqual(
    derived.blocks.map(({ promptText, responseText, closedBy }) => ({
      promptText,
      responseText,
      closedBy,
    })),
    [
      {
        promptText: "How would you choose the first customer?",
        responseText:
          "I would begin with caregivers who coordinate weekly handoffs. Then I would validate whether the failure repeats before building.",
        closedBy: "interviewer_follow_up",
      },
    ]
  );
  assert.equal(
    derived.boundaries.some(({ kind }) => kind === "interruption_marker"),
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

test("replacement writers cannot hide same-speaker overlap or reversed timing", () => {
  const first = createAnswerBlockTurn({
    sequence: 1,
    startedAtMs: 1_000,
    endedAtMs: 2_000,
  });
  const replacement = {
    writerId: "replacement-writer",
    writerGeneration: 2,
    sequence: 1,
    eventId: "replacement-writer:1",
  } as const;
  for (const timing of [
    { startedAtMs: 1_900, endedAtMs: 2_900, audioDurationMs: 1_000 },
    { startedAtMs: 0, endedAtMs: 500, audioDurationMs: 500 },
  ]) {
    const derived = deriveCandidateAnswerBlocks([
      first,
      createAnswerBlockTurn({ ...replacement, ...timing }),
    ]);
    assert.equal(derived.eligible, false);
    assert.ok(derived.boundaries.some(({ kind }) => kind === "invalid_timing"));
  }
});

test("a forward sequence gap is an explicit fail-closed non-coalescing boundary", () => {
  const first = createAnswerBlockTurn({ sequence: 1, startedAtMs: 0 });
  const afterGap = createAnswerBlockTurn({
    sequence: 3,
    eventId: "synthetic-writer:3",
    startedAtMs: 1_300,
    endedAtMs: 2_300,
  });
  const derived = deriveCandidateAnswerBlocks([first, afterGap]);

  assert.equal(derived.eligible, false);
  assert.ok(derived.boundaries.some(({ kind }) => kind === "sequence_gap"));
  assert.deepEqual(
    derived.blocks.map((block) => block.response.length),
    [1, 1]
  );
});

test("semantic replay turns advance continuity without becoming evidence or citations", () => {
  const first = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    text: "I would begin with working parents who coordinate recurring tasks.",
    startedAtMs: 0,
    endedAtMs: 800,
    audioDurationMs: 800,
  });
  const replay = {
    ...createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      text: first.text,
      startedAtMs: 900,
      endedAtMs: 1_200,
      audioDurationMs: 300,
    }),
    kind: "semantic_replay" as const,
    replayOfEventId: first.eventId,
  };
  const secondReplay = {
    ...replay,
    sequence: 3,
    eventId: "synthetic-writer:3",
    startedAtMs: 1_300,
    endedAtMs: 1_600,
  };
  const second = createAnswerBlockTurn({
    sequence: 4,
    eventId: "synthetic-writer:4",
    text: "Then I would validate frequency and severity before prioritizing.",
    startedAtMs: 1_700,
    endedAtMs: 2_500,
    audioDurationMs: 800,
  });
  const derived = deriveCandidateAnswerBlocks([
    first,
    replay,
    secondReplay,
    second,
  ]);

  assert.equal(derived.eligible, true);
  assert.equal(derived.blocks.length, 1);
  assert.deepEqual(
    derived.blocks[0]!.response.map((turn) => turn.eventId),
    [first.eventId, second.eventId]
  );
  assert.equal(derived.blocks[0]!.responseText, `${first.text} ${second.text}`);
  assert.equal(
    derived.boundaries.some(({ kind }) => kind === "sequence_gap"),
    false
  );
});

test("an exact replay advances sequence without bridging accepted-evidence silence", () => {
  const first = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    text: "I would prioritize working parents because coordination breaks down each week.",
    startedAtMs: 0,
    endedAtMs: 1_000,
    audioDurationMs: 1_000,
  });
  const secondStartMs =
    first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + 2_001;
  const withoutReplaySecond = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    text: "I would validate severity with interviews and task diaries before building.",
    startedAtMs: secondStartMs,
    endedAtMs: secondStartMs + 1_000,
  });
  const replay = {
    ...createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      text: first.text,
      startedAtMs: first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + 500,
      endedAtMs: first.endedAtMs + ANSWER_BLOCK_MAX_CONTINUATION_GAP_MS + 1_000,
      audioDurationMs: 500,
    }),
    kind: "semantic_replay" as const,
    replayOfEventId: first.eventId,
  };
  const withReplaySecond = {
    ...withoutReplaySecond,
    sequence: 3,
    eventId: "synthetic-writer:3",
  };

  const withoutReplay = deriveCandidateAnswerBlocks([
    first,
    withoutReplaySecond,
  ]);
  const withReplay = deriveCandidateAnswerBlocks([
    first,
    replay,
    withReplaySecond,
  ]);

  for (const derived of [withoutReplay, withReplay]) {
    assert.equal(derived.eligible, true);
    assert.equal(derived.blocks.length, 2);
    assert.ok(
      derived.boundaries.some(
        (boundary) =>
          boundary.kind === "long_silence" &&
          boundary.afterEventId === first.eventId
      )
    );
  }
  assert.deepEqual(
    projectAnswerBlocksForReviewability(withReplay.blocks),
    projectAnswerBlocksForReviewability(withoutReplay.blocks)
  );
  assert.deepEqual(
    withReplay.blocks.flatMap((block) =>
      block.response.map(({ eventId }) => eventId)
    ),
    [first.eventId, withReplaySecond.eventId]
  );
  assert.deepEqual(
    withReplay.blocks.map(({ startedAtMs, endedAtMs }) => ({
      startedAtMs,
      endedAtMs,
    })),
    withoutReplay.blocks.map(({ startedAtMs, endedAtMs }) => ({
      startedAtMs,
      endedAtMs,
    }))
  );
});

test("replay continuity rejects missing anchors, sequence gaps, timing conflicts, and cross-generation duplicates", () => {
  const first = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    startedAtMs: 1_000,
    endedAtMs: 2_000,
  });
  const replayBase = {
    ...createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      text: first.text,
      startedAtMs: 2_100,
      endedAtMs: 2_500,
      audioDurationMs: 400,
    }),
    kind: "semantic_replay" as const,
    replayOfEventId: first.eventId,
  };
  const replaySuccessor = createAnswerBlockTurn({
    sequence: 3,
    eventId: "synthetic-writer:3",
    text: "Then I would validate the riskiest assumption with a small cohort.",
    startedAtMs: 2_400,
    endedAtMs: 3_400,
  });
  const cases: AnswerBlockLedgerEvent[][] = [
    [first, { ...replayBase, replayOfEventId: "missing-anchor" }],
    [first, { ...replayBase, text: `${first.text} conflicting correction` }],
    [
      first,
      {
        ...replayBase,
        sequence: 3,
        eventId: "synthetic-writer:3",
      },
    ],
    [
      first,
      {
        ...replayBase,
        startedAtMs: 1_900,
        endedAtMs: 2_300,
      },
    ],
    [
      first,
      {
        ...replayBase,
        writerId: "replacement-writer",
        writerGeneration: 2,
        sequence: 1,
        eventId: "replacement-writer:1",
      },
    ],
    [first, replayBase, replaySuccessor],
  ];

  for (const [index, events] of cases.entries()) {
    const derived = deriveCandidateAnswerBlocks(events);
    assert.equal(derived.eligible, false, `case ${index}`);
    assert.ok(
      derived.issues.some(
        ({ code }) =>
          code === "invalid_replay_continuity" ||
          code === "invalid_ledger_order"
      )
    );
  }
});

test("an intervening role turn cannot hide same-speaker replay overlap", () => {
  const anchor = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    startedAtMs: 0,
    endedAtMs: 10_000,
    audioDurationMs: 10_000,
  });
  const followUp = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    speaker: "interviewer",
    text: "Which assumption would you validate first?",
    startedAtMs: 2_000,
    endedAtMs: 3_000,
    audioDurationMs: 1_000,
  });
  const replay = {
    ...createAnswerBlockTurn({
      sequence: 3,
      eventId: "synthetic-writer:3",
      text: anchor.text,
      startedAtMs: 4_000,
      endedAtMs: 5_000,
      audioDurationMs: 1_000,
    }),
    kind: "semantic_replay" as const,
    replayOfEventId: anchor.eventId,
  };

  const derived = deriveCandidateAnswerBlocks([anchor, followUp, replay]);

  assert.equal(derived.eligible, false);
  assert.ok(
    derived.issues.some(
      ({ code, eventId }) =>
        code === "invalid_ledger_order" && eventId === replay.eventId
    )
  );
  assert.ok(
    derived.boundaries.some(
      ({ kind, afterEventId, beforeEventId }) =>
        kind === "invalid_timing" &&
        afterEventId === anchor.eventId &&
        beforeEventId === replay.eventId
    )
  );
});

test("session end and cutoff validate every interleaved role cursor", () => {
  const candidate = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    startedAtMs: 0,
    endedAtMs: 10_000,
    audioDurationMs: 10_000,
  });
  const interviewer = createAnswerBlockTurn({
    sequence: 2,
    eventId: "synthetic-writer:2",
    speaker: "interviewer",
    text: "Which assumption would you validate first?",
    startedAtMs: 2_000,
    endedAtMs: 3_000,
    audioDurationMs: 1_000,
  });
  const terminals: AnswerBlockLedgerEvent[] = [
    { kind: "session_end", occurredAtMs: 5_000 },
    { kind: "cutoff", reason: "session_cutoff", occurredAtMs: 5_000 },
  ];

  for (const terminal of terminals) {
    const derived = deriveCandidateAnswerBlocks([
      candidate,
      interviewer,
      terminal,
    ]);
    assert.equal(derived.eligible, false, terminal.kind);
    assert.ok(
      derived.issues.some(
        ({ code, eventId }) =>
          code === "invalid_ledger_order" && eventId === candidate.eventId
      ),
      terminal.kind
    );
    assert.ok(
      derived.boundaries.some(
        ({ kind, afterEventId }) =>
          kind === "invalid_timing" && afterEventId === candidate.eventId
      ),
      terminal.kind
    );
  }
});

test("a non-exact replay-family omission fails closed as an explicit non-bridging boundary", () => {
  const first = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    startedAtMs: 0,
    endedAtMs: 800,
    audioDurationMs: 800,
  });
  const conflictingReplay = {
    ...createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      text: `${first.text} option two`,
      startedAtMs: 900,
      endedAtMs: 1_200,
      audioDurationMs: 300,
    }),
    kind: "semantic_replay_boundary" as const,
  };
  const second = createAnswerBlockTurn({
    sequence: 3,
    eventId: "synthetic-writer:3",
    startedAtMs: 1_300,
    endedAtMs: 2_100,
    audioDurationMs: 800,
  });
  const derived = deriveCandidateAnswerBlocks([
    first,
    conflictingReplay,
    second,
  ]);

  assert.equal(derived.eligible, false);
  assert.deepEqual(
    derived.blocks.map((block) => block.response.map(({ eventId }) => eventId)),
    [[first.eventId], [second.eventId]]
  );
  assert.ok(derived.boundaries.some(({ kind }) => kind === "semantic_replay"));
  assert.ok(
    derived.issues.some(({ code }) => code === "invalid_replay_continuity")
  );
});

test("an omitted interviewer replay family degrades only when later candidate evidence could bind to it", () => {
  const prompt = createAnswerBlockTurn({
    sequence: 1,
    eventId: "synthetic-writer:1",
    speaker: "interviewer",
    startedAtMs: 0,
    endedAtMs: 800,
    audioDurationMs: 800,
  });
  const omittedPrompt = {
    ...createAnswerBlockTurn({
      sequence: 2,
      eventId: "synthetic-writer:2",
      speaker: "interviewer",
      text: `${prompt.text} option three`,
      startedAtMs: 900,
      endedAtMs: 1_200,
      audioDurationMs: 300,
    }),
    kind: "semantic_replay_boundary" as const,
  };
  const candidate = createAnswerBlockTurn({
    sequence: 3,
    eventId: "synthetic-writer:3",
    startedAtMs: 1_300,
    endedAtMs: 2_100,
    audioDurationMs: 800,
  });

  const interviewerOnly = deriveCandidateAnswerBlocks([
    prompt,
    omittedPrompt,
    { kind: "session_end", occurredAtMs: 1_300 },
  ]);
  assert.equal(interviewerOnly.eligible, true);
  assert.equal(interviewerOnly.blocks.length, 0);

  const candidateBound = deriveCandidateAnswerBlocks([
    prompt,
    omittedPrompt,
    candidate,
  ]);
  assert.equal(candidateBound.eligible, false);
  assert.ok(
    candidateBound.issues.some(
      (issue) =>
        issue.code === "invalid_replay_continuity" &&
        issue.eventId === omittedPrompt.eventId
    )
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
