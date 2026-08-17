import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
  TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
  deriveCandidateAnswerBlocks,
  projectTrustedClosedAnswerBlocks,
  type AnswerBlockLedgerEvent,
  type FrozenAnswerBlockAuthorityV1,
} from "./index";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
  createAnswerBlockTurn,
} from "../../test-fixtures/src/answer-blocks";

test("trusted block identity uses the versioned canonical SHA-256 material", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the product decision.", 0),
    turn(2, "user", "I would begin with the repeated user problem.", 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const block = deriveCandidateAnswerBlocks(events).blocks[0]!;
  const material = JSON.stringify([
    TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
    block.ordinal,
    block.promptText,
    block.responseText,
    block.startedAtMs,
    block.endedAtMs,
    "settled_terminal_boundary",
  ]);

  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "complete" })
  );
  assert.equal(
    projection.trustedBlockIdentities[0]?.identity,
    `trusted-answer-block.v1:${createHash("sha256").update(material).digest("hex")}`
  );
});

test("trusted block identity SHA-256 matches Node crypto for long Unicode interview text", () => {
  const promptText =
    "¿Cómo priorizarías una experiencia para responsables de producto en São Paulo? 🧭";
  const responseText =
    "Primero hablaría con familias que coordinan cuidados cada semana; después validaría la gravedad, mediría traspasos confirmados y mantendría accesibilidad como guardrail. 用户の課題も比較します。";
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", promptText, 0),
    turn(2, "user", responseText, 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const block = deriveCandidateAnswerBlocks(events).blocks[0]!;
  const material = JSON.stringify([
    TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
    block.ordinal,
    block.promptText,
    block.responseText,
    block.startedAtMs,
    block.endedAtMs,
    "settled_terminal_boundary",
  ]);
  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "complete" })
  );

  assert.ok(Buffer.byteLength(material, "utf8") > 128);
  assert.equal(
    projection.trustedBlockIdentities[0]?.identity,
    `trusted-answer-block.v1:${createHash("sha256").update(material, "utf8").digest("hex")}`
  );
});

test("trusted identities and blocks are invariant across 1, 2, 5, or 10 event segmentation", () => {
  const projections = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const fixture = createAnswerBlockSegmentationFixture(segmentCount);
    return projectTrustedClosedAnswerBlocks(
      fixture.events,
      authority(fixture.events, { snapshotState: "complete" })
    );
  });

  for (const projection of projections) {
    assert.equal(projection.status, "complete");
    assert.equal(projection.failureReason, null);
    assert.deepEqual(
      projection.trustedBlocks.map(({ promptText, responseText }) => ({
        promptText,
        responseText,
      })),
      projections[0]!.trustedBlocks.map(({ promptText, responseText }) => ({
        promptText,
        responseText,
      }))
    );
    assert.deepEqual(
      projection.trustedBlockIdentities,
      projections[0]!.trustedBlockIdentities
    );
    assert.ok(
      projection.trustedBlockIdentities.every(
        ({ contractVersion, identity }) =>
          contractVersion === TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION &&
          /^trusted-answer-block\.v1:[a-f0-9]{64}$/u.test(identity)
      )
    );
    assert.equal(
      projection.trustedBlocks.length,
      projection.trustedBlockIdentities.length
    );
    assert.equal(
      projection.trustedBlocks.length,
      projection.closureAuthorities.length
    );
    assert.deepEqual(
      projection.trustedBlocks.map(({ answerBlockId }) => answerBlockId),
      projection.trustedBlockIdentities.map(
        ({ answerBlockId }) => answerBlockId
      )
    );
    assert.deepEqual(
      projection.trustedBlocks.map(({ answerBlockId }) => answerBlockId),
      projection.closureAuthorities.map(({ answerBlockId }) => answerBlockId)
    );
  }
});

test("a terminal preserving interviewer marker protects only earlier closed blocks", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "How would you choose the first customer?", 0),
    turn(
      2,
      "user",
      "I would choose caregivers with weekly handoff failures.",
      1_000
    ),
    turn(3, "interviewer", "Which assumption would you test first?", 2_000),
    turn(
      4,
      "user",
      "I would test whether the failure repeats before building.",
      3_000
    ),
    marker(5, "interviewer", "no_provider_confirmed_prefix", 4_100),
    { kind: "session_end", occurredAtMs: 5_000 },
  ];
  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "partial", settlementState: "missing" })
  );

  assert.equal(projection.status, "verified_prefix");
  assert.equal(projection.numericalScoreAuthority, "withheld");
  assert.deepEqual(
    projection.trustedBlocks.map(({ answerBlockId }) => answerBlockId),
    ["answer-block:0001"]
  );
  assert.deepEqual(projection.excludedBlocks, [
    {
      answerBlockId: "answer-block:0002",
      reason: "unverified_terminal_tail",
    },
  ]);
  assert.equal(projection.closureAuthorities[0]?.kind, "interviewer_follow_up");
});

test("the preserving marker never manufactures closure for the affected tail", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the product decision.", 0),
    turn(2, "user", "I would begin with the repeated user problem.", 1_000),
    marker(3, "interviewer", "no_provider_confirmed_prefix", 2_100),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "partial", settlementState: "missing" })
  );

  assert.equal(projection.status, "no_trusted_blocks");
  assert.equal(projection.numericalScoreAuthority, "withheld");
  assert.deepEqual(projection.trustedBlocks, []);
  assert.deepEqual(projection.trustedBlockIdentities, []);
  assert.deepEqual(projection.closureAuthorities, []);
  assert.deepEqual(projection.excludedBlocks, [
    {
      answerBlockId: "answer-block:0001",
      reason: "unverified_terminal_tail",
    },
  ]);
});

test("a preserving marker before the preceding answer ends fails closed", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the product decision.", 0),
    turn(2, "user", "I would begin with the repeated user problem.", 1_000),
    marker(3, "interviewer", "no_provider_confirmed_prefix", 1_500),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "partial", settlementState: "missing" })
  );

  assert.equal(projection.status, "integrity_failure");
  assert.equal(projection.failureReason, "terminal_boundary_invalid");
  assert.deepEqual(projection.trustedBlocks, []);
  assert.deepEqual(projection.trustedBlockIdentities, []);
});

test("degraded writer integrity and degraded settlement authority fail closed", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the product decision.", 0),
    turn(2, "user", "I would begin with the repeated user problem.", 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const cases = [
    authority(events, {
      snapshotState: "complete",
      integrityState: "degraded",
    }),
    authority(events, {
      snapshotState: "partial",
      settlementState: "degraded",
    }),
  ];

  for (const writerAuthority of cases) {
    const projection = projectTrustedClosedAnswerBlocks(
      events,
      writerAuthority
    );
    assert.equal(projection.status, "integrity_failure");
    assert.equal(projection.failureReason, "writer_degraded");
    assert.deepEqual(projection.trustedBlocks, []);
    assert.deepEqual(projection.trustedBlockIdentities, []);
    assert.deepEqual(projection.closureAuthorities, []);
  }
});

test("a turn or marker beyond the frozen cutoff fails closed", () => {
  const prompt = turn(1, "interviewer", "Frame the product decision.", 0);
  const afterCutoffTurn = turn(
    2,
    "user",
    "This answer ends beyond the frozen cutoff.",
    2_500
  );
  const turnEvents: AnswerBlockLedgerEvent[] = [
    prompt,
    afterCutoffTurn,
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const markerEvents: AnswerBlockLedgerEvent[] = [
    prompt,
    turn(2, "user", "This answer is within the cutoff.", 1_000),
    marker(3, "interviewer", "no_provider_confirmed_prefix", 3_100),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];

  for (const events of [turnEvents, markerEvents]) {
    const projection = projectTrustedClosedAnswerBlocks(
      events,
      authority(events, { snapshotState: "complete" })
    );
    assert.equal(projection.status, "integrity_failure");
    assert.equal(projection.failureReason, "cutoff_conflict");
    assert.deepEqual(projection.trustedBlockIdentities, []);
  }
});

test("only fully settled terminal authority can close the final answer", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the product decision.", 0),
    turn(2, "user", "I would begin with the repeated user problem.", 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const complete = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "complete", settlementState: "settled" })
  );
  const partial = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "partial", settlementState: "missing" })
  );

  assert.equal(complete.status, "complete");
  assert.equal(
    complete.closureAuthorities[0]?.kind,
    "settled_terminal_boundary"
  );
  assert.equal(partial.status, "no_trusted_blocks");
  assert.equal(partial.excludedBlocks[0]?.reason, "unverified_terminal_tail");
});

test("candidate markers, canonicalization failures, gaps, and writer drift fail closed", () => {
  const prompt = turn(1, "interviewer", "Frame the decision.", 0);
  const answer = turn(
    2,
    "user",
    "I would start with the riskiest assumption.",
    1_000
  );
  const cases: Array<{
    name: string;
    events: AnswerBlockLedgerEvent[];
    expectedReason: string;
    authority?: FrozenAnswerBlockAuthorityV1;
  }> = [
    {
      name: "candidate marker",
      events: [
        prompt,
        answer,
        marker(3, "user", "no_provider_confirmed_prefix", 2_100),
        { kind: "session_end", occurredAtMs: 3_000 },
      ],
      expectedReason: "canonicalization_failure",
    },
    {
      name: "canonicalization failure",
      events: [
        prompt,
        answer,
        marker(3, "interviewer", "canonicalization_failed", 2_100),
        { kind: "session_end", occurredAtMs: 3_000 },
      ],
      expectedReason: "canonicalization_failure",
    },
    {
      name: "gap",
      events: [
        prompt,
        { ...answer, sequence: 3, eventId: "synthetic-writer:3" },
        { kind: "session_end", occurredAtMs: 3_000 },
      ],
      expectedReason: "sequence_gap",
    },
    {
      name: "writer drift",
      events: [
        prompt,
        {
          ...answer,
          eventId: "replacement-writer:1",
          writerId: "replacement-writer",
          writerGeneration: 2,
          sequence: 1,
        },
        { kind: "session_end", occurredAtMs: 3_000 },
      ],
      expectedReason: "writer_drift",
    },
  ];

  for (const entry of cases) {
    const projection = projectTrustedClosedAnswerBlocks(
      entry.events,
      entry.authority ?? authority(entry.events, { snapshotState: "complete" })
    );
    assert.equal(projection.status, "integrity_failure", entry.name);
    assert.equal(projection.failureReason, entry.expectedReason, entry.name);
    assert.deepEqual(projection.trustedBlocks, [], entry.name);
  }
});

test("repeated preserving markers remain transparent and retain only independently closed blocks", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the decision.", 0),
    turn(2, "user", "I would start with the riskiest assumption.", 1_000),
    marker(3, "interviewer", "no_provider_confirmed_prefix", 2_100),
    turn(4, "user", "Then I would validate it with five customers.", 2_200),
    marker(5, "interviewer", "no_provider_confirmed_prefix", 3_100),
    turn(6, "interviewer", "What result would change your plan?", 3_200),
    marker(7, "interviewer", "no_provider_confirmed_prefix", 4_100),
    turn(
      8,
      "user",
      "A weak repeat rate would make me narrow the segment.",
      4_200
    ),
    marker(9, "interviewer", "no_provider_confirmed_prefix", 5_100),
    { kind: "session_end", occurredAtMs: 6_000 },
  ];
  const projection = projectTrustedClosedAnswerBlocks(
    events,
    authority(events, { snapshotState: "partial", settlementState: "missing" })
  );

  assert.equal(projection.status, "verified_prefix");
  assert.equal(projection.failureReason, null);
  assert.deepEqual(
    projection.trustedBlocks.map(({ responseText }) => responseText),
    [
      "I would start with the riskiest assumption. Then I would validate it with five customers.",
    ]
  );
  assert.deepEqual(projection.excludedBlocks, [
    {
      answerBlockId: "answer-block:0002",
      reason: "unverified_terminal_tail",
    },
  ]);
});

test("exact semantic replay preserves authority while conflicting replay fails closed", () => {
  const prompt = turn(1, "interviewer", "Frame the decision.", 0);
  const answer = turn(
    2,
    "user",
    "I would test the riskiest assumption first.",
    1_000
  );
  const replay = {
    ...turn(3, "user", answer.text, 2_100),
    kind: "semantic_replay" as const,
    replayOfEventId: answer.eventId,
  };
  const followUp = turn(
    4,
    "interviewer",
    "What result changes your plan?",
    3_100
  );
  const terminal = { kind: "session_end" as const, occurredAtMs: 5_000 };
  const exactEvents = [prompt, answer, replay, followUp, terminal];
  const exact = projectTrustedClosedAnswerBlocks(
    exactEvents,
    authority(exactEvents, { snapshotState: "complete" })
  );
  const conflictEvents = [
    prompt,
    answer,
    { ...replay, text: `${answer.text} conflicting` },
    followUp,
    terminal,
  ];
  const conflict = projectTrustedClosedAnswerBlocks(
    conflictEvents,
    authority(conflictEvents, { snapshotState: "complete" })
  );

  assert.equal(exact.status, "complete");
  assert.deepEqual(
    exact.trustedBlocks[0]?.response.map(({ eventId }) => eventId),
    [answer.eventId]
  );
  assert.equal(conflict.status, "integrity_failure");
  assert.equal(conflict.failureReason, "replay_conflict");
});

test("unknown authority versions fail closed without changing historical block derivation", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the decision.", 0),
    turn(2, "user", "I would start with the riskiest assumption.", 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const before = deriveCandidateAnswerBlocks(events);
  const projection = projectTrustedClosedAnswerBlocks(events, {
    ...authority(events, { snapshotState: "complete" }),
    contractVersion: "frozen-answer-block-authority.v0",
  });
  const after = deriveCandidateAnswerBlocks(events);

  assert.equal(projection.status, "integrity_failure");
  assert.equal(projection.failureReason, "authority_contract_unsupported");
  assert.deepEqual(after, before);
});

test("writer authority rejects whitespace-only and overlong writer IDs", () => {
  const events: AnswerBlockLedgerEvent[] = [
    turn(1, "interviewer", "Frame the decision.", 0),
    turn(2, "user", "I would start with the riskiest assumption.", 1_000),
    { kind: "session_end", occurredAtMs: 3_000 },
  ];
  const base = authority(events, { snapshotState: "complete" });

  for (const writerId of ["   ", "w".repeat(257)]) {
    const projection = projectTrustedClosedAnswerBlocks(events, {
      ...base,
      writers: [{ ...base.writers[0], writerId }],
    });
    assert.equal(projection.status, "integrity_failure");
    assert.equal(projection.failureReason, "authority_malformed");
    assert.deepEqual(projection.trustedBlockIdentities, []);
  }
});

function authority(
  events: readonly AnswerBlockLedgerEvent[],
  overrides: {
    snapshotState: "complete" | "partial";
    settlementState?: "settled" | "missing" | "degraded";
    integrityState?: "healthy" | "degraded";
  }
): FrozenAnswerBlockAuthorityV1 {
  const sequenced = events.filter((event) => "sequence" in event);
  return {
    contractVersion: FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION,
    snapshotState: overrides.snapshotState,
    cutoffAtMs:
      events.findLast(
        (event) => event.kind === "session_end" || event.kind === "cutoff"
      )?.occurredAtMs ?? 0,
    writers: [
      {
        contractVersion: 1,
        writerId: "synthetic-writer",
        writerGeneration: 1,
        committedSequence: sequenced.length,
        integrityState: overrides.integrityState ?? "healthy",
        settlementState:
          overrides.settlementState ??
          (overrides.snapshotState === "complete" ? "settled" : "missing"),
      },
    ],
  };
}

function turn(
  sequence: number,
  speaker: "user" | "interviewer",
  text: string,
  startedAtMs: number
) {
  return createAnswerBlockTurn({
    sequence,
    eventId: `synthetic-writer:${sequence}`,
    speaker,
    text,
    startedAtMs,
    endedAtMs: startedAtMs + 800,
    audioDurationMs: 800,
  });
}

function marker(
  sequence: number,
  speaker: "user" | "interviewer",
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed",
  occurredAtMs: number
) {
  return {
    kind: "integrity_boundary" as const,
    eventId: `synthetic-writer:${sequence}`,
    writerId: "synthetic-writer",
    writerGeneration: 1,
    sequence,
    speaker,
    occurredAtMs,
    reason,
  };
}
