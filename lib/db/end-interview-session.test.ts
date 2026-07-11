import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTranscriptIntegrityValidation,
  finalizeInterviewSession,
  resolveInterviewTerminalReason,
  shouldPreservePostUsableDisconnectCharge,
  shouldRefineProvisionalTerminalReason,
  type EndInterviewSessionDatabase,
} from "./end-interview-session";
import {
  SessionTier,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";

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
      unavailableInterruptions: 0,
    }),
    true
  );
  assert.equal(
    shouldPreservePostUsableDisconnectCharge({
      requestedTerminalReason: "disconnect_timeout",
      usableAt,
      missingRuntimeSettlement: true,
      unavailableInterruptions: 1,
    }),
    false
  );
  assert.equal(
    shouldPreservePostUsableDisconnectCharge({
      requestedTerminalReason: "user_end",
      usableAt,
      missingRuntimeSettlement: true,
      unavailableInterruptions: 0,
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

test("only matching invalid deadline and reconnect provisional claims may refine", () => {
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

  for (const [terminalReason, source] of [
    ["user_end", "user_end"],
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

test("runtime settlement and textless interruption own final feedback eligibility", () => {
  const baseValidation = {
    isValid: true,
    tier: SessionTier.PARTIAL,
    stats: {
      totalTurns: 6,
      userTurns: 3,
      totalWords: 90,
      durationSeconds: 360,
      substantiveResponses: 3,
    },
    reasons: [],
    recommendations: [],
  };

  for (const input of [
    { runtimeSettlementState: null, interruptionCount: 0 },
    { runtimeSettlementState: "degraded" as const, interruptionCount: 0 },
    { runtimeSettlementState: "settled" as const, interruptionCount: 1 },
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
      runtimeSettlementState: "settled",
      interruptionCount: 0,
    }),
    baseValidation
  );
});

test("durable turns do not synthesize canonical activation during terminalization", async () => {
  const validation = validSessionValidation();
  const transitions: string[] = [];
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
  const database = {
    async transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        select() {
          return {
            from() {
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
      validationOverride: validation,
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

function validSessionValidation(): SessionValidation {
  return {
    tier: SessionTier.FULL,
    isValid: true,
    stats: {
      totalTurns: 20,
      userTurns: 10,
      totalWords: 800,
      durationSeconds: 1200,
      substantiveResponses: 8,
    },
    reasons: [],
    recommendations: [],
  };
}
