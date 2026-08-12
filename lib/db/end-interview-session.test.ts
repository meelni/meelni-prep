import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTranscriptIntegrityValidation,
  classifyTranscriptEvidence,
  finalizeInterviewSession,
  resolveInterviewTerminalReason,
  shouldPreservePostUsableDisconnectCharge,
  shouldRefineProvisionalTerminalReason,
  type EndInterviewSessionDatabase,
} from "./end-interview-session";
import { SessionTier } from "@/lib/evaluation/session-validator";

test("valid durable signal preserves the command's terminal reason", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "user_end"),
    "user_end"
  );
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "time_limit"),
    "time_limit"
  );
});

test("insufficient durable signal wins before a deadline claim is committed", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "time_limit"),
    "insufficient_signal"
  );
});

test("a missing settlement after a usable disconnect remains a user charge", () => {
  const usableAt = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    shouldPreservePostUsableDisconnectCharge({
      requestedTerminalReason: "disconnect_timeout",
      usableAt,
      missingRuntimeSettlement: true,
      degradingInterruptionCount: 0,
    }),
    true
  );
  assert.equal(
    shouldPreservePostUsableDisconnectCharge({
      requestedTerminalReason: "disconnect_timeout",
      usableAt,
      missingRuntimeSettlement: true,
      degradingInterruptionCount: 1,
    }),
    false
  );
  assert.equal(
    shouldPreservePostUsableDisconnectCharge({
      requestedTerminalReason: "user_end",
      usableAt,
      missingRuntimeSettlement: true,
      degradingInterruptionCount: 0,
    }),
    false
  );
});

test("invalid-session recovery preserves provider failure without transcript signal", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "provider_failure"),
    "provider_failure"
  );
});

test("matching invalid provisional claims refine to insufficient signal", () => {
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: false,
      source: "hard_deadline",
    }),
    true
  );
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "disconnect_timeout",
      isValid: false,
      source: "reconnect_timeout",
    }),
    true
  );
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "user_end",
      isValid: false,
      source: "user_end",
    }),
    true
  );

  for (const [terminalReason, source] of [
    ["provider_failure", "invalid_session_recovery"],
    ["disconnect_timeout", "hard_deadline"],
    ["time_limit", "reconnect_timeout"],
    ["insufficient_signal", "reconnect_timeout"],
  ] as const) {
    assert.equal(
      shouldRefineProvisionalTerminalReason({
        state: "ending",
        terminalReason,
        isValid: false,
        source,
      }),
      false
    );
  }

  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: true,
      source: "hard_deadline",
    }),
    false
  );
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "completed",
      terminalReason: "time_limit",
      isValid: false,
      source: "hard_deadline",
    }),
    false
  );
});

test("runtime settlement and degrading interruptions own final feedback eligibility", () => {
  const baseValidation = {
    isValid: true,
    tier: SessionTier.PARTIAL,
    stats: {
      totalTurns: 6,
      userTurns: 3,
      totalWords: 90,
      durationSeconds: 360,
      substantiveResponses: 3,
      scoreableResponses: 3,
    },
    reasons: [],
    recommendations: [],
  };

  for (const input of [
    { runtimeWriterStates: [], interruptions: [] },
    {
      runtimeWriterStates: [{ generation: 1, state: "degraded" as const }],
      interruptions: [],
    },
    {
      runtimeWriterStates: [{ generation: 1, state: "settled" as const }],
      interruptions: [
        {
          speaker: "user" as const,
          reason: "no_provider_confirmed_prefix" as const,
        },
      ],
    },
  ]) {
    const result = applyTranscriptIntegrityValidation({
      baseValidation,
      ...input,
    });
    assert.equal(result.isValid, false);
    assert.equal(result.reasons.length > 0, true);
  }

  assert.deepEqual(
    applyTranscriptIntegrityValidation({
      baseValidation,
      runtimeWriterStates: [{ generation: 1, state: "settled" }],
      interruptions: [],
    }),
    baseValidation
  );

  const replacementMissing = applyTranscriptIntegrityValidation({
    baseValidation,
    interruptions: [],
    runtimeWriterStates: [
      { generation: 1, state: null },
      { generation: 2, state: "settled" },
    ],
  });
  assert.equal(replacementMissing.isValid, false);
  assert.match(replacementMissing.reasons[0] ?? "", /1 writer generation/);

  const replacementDegraded = applyTranscriptIntegrityValidation({
    baseValidation,
    interruptions: [],
    runtimeWriterStates: [
      { generation: 1, state: "degraded" },
      { generation: 2, state: "settled" },
    ],
  });
  assert.equal(replacementDegraded.isValid, false);

  assert.deepEqual(
    applyTranscriptIntegrityValidation({
      baseValidation,
      interruptions: [],
      runtimeWriterStates: [
        { generation: 1, state: "settled" },
        { generation: 2, state: "settled" },
      ],
    }),
    baseValidation
  );

  assert.deepEqual(
    applyTranscriptIntegrityValidation({
      baseValidation,
      interruptions: [
        {
          speaker: "interviewer",
          reason: "no_provider_confirmed_prefix",
        },
      ],
      runtimeWriterStates: [{ generation: 1, state: "settled" }],
    }),
    baseValidation
  );
});

test("terminalization exposes a copy-independent transcript evidence classification", () => {
  assert.equal(
    classifyTranscriptEvidence({
      interruptions: [],
      runtimeWriterStates: [{ generation: 1, state: "settled" }],
    }),
    "available"
  );
  assert.equal(
    classifyTranscriptEvidence({
      interruptions: [],
      runtimeWriterStates: [{ generation: 1, state: "degraded" }],
    }),
    "degraded"
  );
  assert.equal(
    classifyTranscriptEvidence({
      interruptions: [
        {
          speaker: "interviewer",
          reason: "no_provider_confirmed_prefix",
        },
      ],
      runtimeWriterStates: [{ generation: 1, state: "settled" }],
    }),
    "available"
  );
  for (const input of [
    { interruptions: [], runtimeWriterStates: [] },
    {
      interruptions: [],
      runtimeWriterStates: [{ generation: 1, state: null }],
    },
    {
      interruptions: [
        {
          speaker: "user" as const,
          reason: "no_provider_confirmed_prefix" as const,
        },
      ],
      runtimeWriterStates: [{ generation: 1, state: "settled" as const }],
    },
  ]) {
    assert.equal(classifyTranscriptEvidence(input), "missing");
  }
});

test("durable turns do not synthesize canonical activation during terminalization", async () => {
  const transitions: string[] = [];
  const candidateAnswers = [
    "I would start with enterprise administrators, validate the security workflow through interviews, and measure successful policy completion before expanding.",
    "The primary user problem is slow access approval, so I would compare time to approval and weekly retained teams against the current baseline.",
    "My first experiment would target ten design partners, instrument each approval step, and use completion rate plus qualitative friction to decide whether to iterate.",
    "I would prioritize the smallest workflow that removes the security bottleneck, while explicitly deferring reporting features until the core behavior is repeatable.",
    "The main risk is that buyers care about compliance but end users avoid the workflow, so I would test both purchase intent and sustained employee adoption.",
  ];
  const validTurns = Array.from({ length: 20 }, (_, index) => ({
    contractVersion: 2,
    eventId: `writer-1:${index + 1}`,
    writerGeneration: 1,
    sequence: index + 1,
    speaker: index % 2 === 0 ? "user" : "interviewer",
    text:
      index % 2 === 0
        ? candidateAnswers[(index / 2) % candidateAnswers.length]
        : "Tell me more about the evidence and tradeoffs behind that decision.",
    startedAt: new Date(Date.UTC(2026, 6, 10, 7, index)),
    endedAt: new Date(Date.UTC(2026, 6, 10, 7, index, 30)),
  }));
  let lifecycle = {
    state: "connecting",
    version: 2,
    terminalReason: null as string | null,
    activatedAt: null as Date | null,
    endingAt: null as Date | null,
    endedAt: null as Date | null,
  };
  const stored = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    userId: "650e8400-e29b-41d4-a716-446655440000",
    livekitRoomName: "interview-session",
    reconnectDeadlineAt: null,
    lifecycleState: lifecycle.state,
    lifecycleVersion: lifecycle.version,
    terminalReason: lifecycle.terminalReason,
    activatedAt: lifecycle.activatedAt,
    endingAt: lifecycle.endingAt,
    endedAt: lifecycle.endedAt,
  };
  let selectCall = 0;
  const database = {
    async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        select() {
          selectCall += 1;
          return {
            from() {
              if (selectCall === 1) {
                return {
                  where() {
                    return {
                      limit() {
                        return {
                          async for() {
                            return [{ ...stored }];
                          },
                        };
                      },
                    };
                  },
                };
              }
              const rows =
                selectCall === 2
                  ? validTurns
                  : selectCall === 3
                    ? []
                    : selectCall === 4
                      ? [
                          {
                            generation: 1,
                            contractVersion: 1,
                            writerId: "writer-1",
                            lastObservedSequence: 20,
                            committedSequence: 20,
                            committedEventId: "writer-1:20",
                            committedThroughAt: validTurns[19]?.endedAt,
                            integrityState: "healthy",
                            settlementState: "settled",
                            settledAt: new Date("2026-07-10T08:00:00.000Z"),
                          },
                        ]
                      : [];
              const chain = {
                leftJoin() {
                  return chain;
                },
                where() {
                  if (selectCall === 2) {
                    return {
                      orderBy() {
                        return Promise.resolve(rows);
                      },
                    };
                  }
                  return Promise.resolve(rows);
                },
              };
              return chain;
            },
          };
        },
        update() {
          return {
            set(values: Record<string, unknown>) {
              return {
                where() {
                  return {
                    async returning() {
                      const nextState = values.lifecycleState;
                      if (typeof nextState !== "string") return [];
                      transitions.push(nextState);
                      lifecycle = {
                        state: nextState,
                        version: lifecycle.version + 1,
                        terminalReason:
                          (values.terminalReason as string | null) ?? null,
                        activatedAt: lifecycle.activatedAt,
                        endingAt:
                          nextState === "ending"
                            ? new Date("2026-07-10T08:00:00.000Z")
                            : lifecycle.endingAt,
                        endedAt:
                          nextState === "completed" ||
                          nextState === "abandoned" ||
                          nextState === "failed"
                            ? new Date("2026-07-10T08:00:00.000Z")
                            : lifecycle.endedAt,
                      };
                      Object.assign(stored, {
                        lifecycleState: lifecycle.state,
                        lifecycleVersion: lifecycle.version,
                        terminalReason: lifecycle.terminalReason,
                        activatedAt: lifecycle.activatedAt,
                        endingAt: lifecycle.endingAt,
                        endedAt: lifecycle.endedAt,
                      });
                      return [{ ...lifecycle }];
                    },
                  };
                },
              };
            },
          };
        },
        insert() {
          return {
            values(values: Record<string, unknown>) {
              return {
                onConflictDoNothing() {
                  return {
                    async returning() {
                      return [
                        {
                          id: "750e8400-e29b-41d4-a716-446655440000",
                          ...values,
                        },
                      ];
                    },
                  };
                },
              };
            },
          };
        },
      };
      return callback(tx);
    },
  } as EndInterviewSessionDatabase;

  const result = await finalizeInterviewSession(
    {
      sessionId: stored.id,
      actor: { type: "user", userId: stored.userId },
      requestedTerminalReason: "user_end",
      now: new Date("2026-07-10T08:00:00.000Z"),
    },
    database
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.lifecycle.state, "abandoned");
    assert.equal(result.lifecycle.terminalReason, "user_end");
  }
  assert.deepEqual(transitions, ["ending", "abandoned"]);
  assert.equal(stored.activatedAt, null);
});
