import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import {
  buildInterviewDeadlineSchedules,
  type InterviewDeadlineSession,
} from "@/lib/db/session-deadlines";
import type {
  EndInterviewSessionResult,
  InterviewSessionSettlement,
  SettleInterviewSessionResult,
} from "./end-interview-session";
import {
  enforceInterviewDeadlineWorkflow,
  quarantineInvalidInterviewSessionWorkflow,
  type EnforceInterviewDeadlineDeps,
} from "./enforce-interview-deadline";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const DEADLINE = "2026-07-10T06:30:00.000Z";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("deadline is inert before the exact instant and enforces at the instant", async () => {
  let ended = 0;
  const scheduled: Date[] = [];
  const before = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      getSession: async () =>
        deadlineSession(new Date("2026-07-10T06:29:59.999Z")),
      scheduleDeadline: async ({ deadlineAt }) => {
        scheduled.push(deadlineAt);
      },
      settleSession: async () => {
        ended += 1;
        return settlement();
      },
    })
  );
  const at = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      settleSession: async () => {
        ended += 1;
        return settlement();
      },
    })
  );

  assert.deepEqual(before, { ok: false, disposition: "not_due" });
  assert.equal(at.ok, true);
  assert.equal(ended, 1);
  assert.deepEqual(scheduled, [new Date(DEADLINE)]);
});

test("database time owns the -1ms, equality, and +1ms deadline boundary", async () => {
  const results = [];
  for (const databaseNow of [
    "2026-07-10T06:29:59.999Z",
    DEADLINE,
    "2026-07-10T06:30:00.001Z",
  ]) {
    results.push(
      await enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        createDeps({
          getSession: async () => deadlineSession(new Date(databaseNow)),
        })
      )
    );
  }

  assert.deepEqual(
    results.map((result) => result.ok),
    [false, true, true]
  );
  assert.equal(results[0]?.disposition, "not_due");
});

test("malformed, missing, and stale deadline events have no side effects", async () => {
  let ended = 0;
  const deps = createDeps({
    settleSession: async () => {
      ended += 1;
      return settlement();
    },
  });
  const malformed = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: "not-a-date", env: ENV },
    deps
  );
  const missing = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({ getSession: async () => undefined })
  );
  const stale = await enforceInterviewDeadlineWorkflow(
    {
      sessionId: SESSION_ID,
      deadlineAt: "2026-07-10T06:31:00.000Z",
      env: ENV,
    },
    deps
  );

  assert.deepEqual(malformed, { ok: false, disposition: "invalid_event" });
  assert.deepEqual(missing, { ok: false, disposition: "not_found" });
  assert.deepEqual(stale, { ok: false, disposition: "stale_event" });
  assert.equal(ended, 0);
});

test("deadline persists cleanup ownership before room deletion, then acknowledges before dispatch", async () => {
  const calls: string[] = [];
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      settleSession: async () => {
        calls.push("settle");
        return settlement();
      },
      dispatchSettlement: async (completion) => {
        assert.equal(completion.deadlineRoomCleanupStatus, "deleted");
        calls.push("dispatch");
        return completedSettlement(completion);
      },
      terminateRoom: async ({ roomName }) => {
        calls.push(`terminate:${roomName}`);
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
      acknowledgeRoomCleanup: async () => {
        calls.push("acknowledge");
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "settle",
    "terminate:interview-deadline-room",
    "acknowledge",
    "dispatch",
  ]);
});

test("deadline retries credit convergence before feedback dispatch", async () => {
  let settlements = 0;
  let dispatches = 0;
  const run = () =>
    enforceInterviewDeadlineWorkflow(
      { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
      createDeps({
        settleSession: async () => {
          settlements += 1;
          return {
            ...settlement(),
            creditSettlementStatus:
              settlements === 1 ? "deferred" : "settled",
          };
        },
        dispatchSettlement: async (completion) => {
          dispatches += 1;
          return completedSettlement(completion);
        },
      })
    );

  await assert.rejects(run, /credit settlement deferred/);
  assert.equal(dispatches, 0);

  const retry = await run();
  assert.equal(retry.ok, true);
  assert.equal(dispatches, 1);
});

test("room deletion failure commits terminal truth but defers feedback until acknowledged cleanup", async () => {
  let stored: InterviewSessionSettlement | null = null;
  let feedbackEvents = 0;
  let deleteAttempts = 0;
  const deps = createDeps({
    settleSession: async () => {
      if (!stored) {
        stored = settlement().completion;
        stored.feedback.dispatchStatus = "pending";
      }
      return { ok: true, completion: stored };
    },
    terminateRoom: async ({ roomName }) => {
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        return providerFailure("livekit", {
          code: "livekit_room_delete_failed",
          message: "provider unavailable",
          retryable: true,
        });
      }
      return providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      });
    },
    dispatchSettlement: async (completion) => {
      if (completion.feedback.dispatchStatus === "pending") {
        feedbackEvents += 1;
        completion.feedback.dispatchStatus = "sent";
      }
      return completedSettlement(completion, "sent");
    },
  });

  await assert.rejects(
    () =>
      enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        deps
      ),
    /room termination failed/
  );
  assert.ok(stored);
  assert.equal(feedbackEvents, 0);

  const retry = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    deps
  );
  assert.equal(retry.ok, true);
  assert.equal(feedbackEvents, 1);

  const replay = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    deps
  );
  assert.equal(replay.ok, true);
  assert.equal(feedbackEvents, 1);
});

test("ineligible deadline settlement stays blocked until room cleanup is acknowledged without dispatch", async () => {
  let acknowledged = false;
  let deleteAttempts = 0;
  let dispatchAttempts = 0;
  const ineligible = settlement("insufficient_signal", "abandoned").completion;
  const deps = createDeps({
    settleSession: async () => ({ ok: true, completion: ineligible }),
    terminateRoom: async ({ roomName }) => {
      deleteAttempts += 1;
      return deleteAttempts === 1
        ? providerFailure("livekit", {
            code: "livekit_room_delete_failed",
            message: "provider unavailable",
            retryable: true,
          })
        : providerSuccess("livekit", {
            roomName,
            disposition: "already_absent" as const,
          });
    },
    acknowledgeRoomCleanup: async () => {
      acknowledged = true;
    },
    dispatchSettlement: async (completion) => {
      dispatchAttempts += 1;
      return completedSettlement(completion, "not_required");
    },
  });

  await assert.rejects(() =>
    enforceInterviewDeadlineWorkflow(
      { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
      deps
    )
  );
  assert.equal(acknowledged, false);
  assert.equal(dispatchAttempts, 0);

  const retry = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    deps
  );
  assert.equal(retry.ok, true);
  assert.equal(acknowledged, true);
  assert.equal(dispatchAttempts, 1);
  if (retry.ok) {
    assert.equal(retry.completion.dispatch, null);
    assert.equal(
      retry.completion.completion.feedback.dispatchStatus,
      "not_required"
    );
  }
});

test("a concurrent user end never creates or acknowledges a deadline cleanup claim", async () => {
  let acknowledgements = 0;
  let deletions = 0;
  const userEnd = settlement("user_end", "completed").completion;
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      settleSession: async () => ({ ok: true, completion: userEnd }),
      acknowledgeRoomCleanup: async () => {
        acknowledgements += 1;
      },
      terminateRoom: async ({ roomName }) => {
        deletions += 1;
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(userEnd.lifecycle.terminalReason, "user_end");
  assert.equal(userEnd.deadlineRoomCleanupStatus, null);
  assert.equal(acknowledgements, 0);
  assert.equal(deletions, 0);
});

test("recovery rediscovers terminal pending cleanup after exact retries exhaust and finalizes once", async () => {
  let cleanupStatus: "pending" | "deleted" | "already_absent" = "pending";
  let feedbackEvents = 0;
  let deleteAttempts = 0;
  const stored = settlement().completion;
  stored.feedback.dispatchStatus = "pending";
  const deps = createDeps({
    getSession: async () => ({
      ...deadlineSession(new Date(DEADLINE)),
      state: "completed",
      version: 5,
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: cleanupStatus,
    }),
    settleSession: async () => ({ ok: true, completion: stored }),
    terminateRoom: async ({ roomName }) => {
      deleteAttempts += 1;
      if (deleteAttempts <= 5) {
        return providerFailure("livekit", {
          code: "livekit_room_delete_failed",
          message: "provider unavailable",
          retryable: true,
        });
      }
      return providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      });
    },
    acknowledgeRoomCleanup: async (_sessionId, disposition) => {
      cleanupStatus = disposition;
    },
    dispatchSettlement: async (completion) => {
      if (stored.feedback.dispatchStatus === "pending") {
        feedbackEvents += 1;
        stored.feedback.dispatchStatus = "sent";
      }
      return completedSettlement(completion, "sent");
    },
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() =>
      enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        deps
      )
    );
  }
  assert.equal(feedbackEvents, 0);
  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [
        {
          id: SESSION_ID,
          startedAt: new Date("2026-07-10T06:00:00.000Z"),
          config: { duration: 30 },
          lifecycleState: "completed",
          terminalReason: "time_limit",
          deadlineRoomCleanupStatus: cleanupStatus,
        },
      ],
      250,
      new Date(DEADLINE)
    ),
    [{ kind: "deadline", sessionId: SESSION_ID, deadlineAt: DEADLINE }]
  );

  const recovered = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    deps
  );
  assert.equal(recovered.ok, true);
  assert.equal(cleanupStatus, "already_absent");
  assert.equal(feedbackEvents, 1);

  await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    deps
  );
  assert.equal(feedbackEvents, 1);
  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [
        {
          id: SESSION_ID,
          startedAt: new Date("2026-07-10T06:00:00.000Z"),
          config: { duration: 30 },
          lifecycleState: "completed",
          terminalReason: "time_limit",
          deadlineRoomCleanupStatus: cleanupStatus,
        },
      ],
      250,
      new Date(DEADLINE)
    ),
    []
  );
});

test("acknowledged cleanup keeps retrying until feedback dispatch is ready", async () => {
  await assert.rejects(
    () =>
      enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        createDeps({
          dispatchSettlement: async (settled) => ({
            ok: true,
            completion: {
              ...settled,
              feedback: { ...settled.feedback, dispatchStatus: "failed" },
            },
            dispatch: {
              ok: false,
              disposition: "failed",
              dispatch: {
                sessionId: SESSION_ID,
                eventId: `feedback/generate.requested:${SESSION_ID}:1`,
                status: "failed",
                attempts: 1,
                claimedAt: new Date(DEADLINE),
                dispatchedAt: null,
              },
            },
          }),
        })
      ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "feedback_dispatch_not_ready"
  );
});

test("duplicate deadline commands converge on one stored terminal claim", async () => {
  let terminalWrites = 0;
  let stored: SettleInterviewSessionResult | null = null;
  let current = deadlineSession(new Date(DEADLINE));
  const deps = createDeps({
    getSession: async () => ({ ...current }),
    claimDue: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion
      ) {
        return false;
      }
      current = {
        ...current,
        state: "ending",
        version: current.version + 1,
        terminalReason: input.terminalReason,
        deadlineRoomCleanupStatus: "pending",
      };
      return true;
    },
    settleSession: async () => {
      if (!stored) {
        terminalWrites += 1;
        stored = settlement();
      }
      return stored;
    },
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        deps
      )
    )
  );

  assert.equal(
    results.every((result) => result.ok),
    true
  );
  assert.equal(terminalWrites, 1);
});

test("reordered deadline events cannot replace another terminal owner", async () => {
  let terminated = 0;
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      getSession: async () => ({
        ...deadlineSession(new Date(DEADLINE)),
        state: "ending",
        version: 4,
        terminalReason: "user_end",
      }),
      terminateRoom: async () => {
        terminated += 1;
        return providerSuccess("livekit", {
          roomName: "interview-deadline-room",
          disposition: "deleted" as const,
        });
      },
    })
  );

  assert.deepEqual(result, { ok: false, disposition: "stale_event" });
  assert.equal(terminated, 0);
});

test("hard deadline claims provisionally before locked validation refines it", async () => {
  let claimedReason: string | null = null;
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      claimDue: async (input) => {
        claimedReason = input.terminalReason;
        return true;
      },
      settleSession: async () => settlement("insufficient_signal", "abandoned"),
    })
  );

  assert.equal(result.ok, true);
  assert.equal(claimedReason, "time_limit");
});

test("recovery closes an open room with no start time and terminalizes provider failure", async () => {
  const calls: string[] = [];
  const result = await quarantineInvalidInterviewSessionWorkflow(
    {
      sessionId: SESSION_ID,
      recoveryReason: "missing_started_at",
      env: ENV,
    },
    createDeps({
      getSession: async () => ({
        id: SESSION_ID,
        userId: "650e8400-e29b-41d4-a716-446655440000",
        startedAt: null,
        config: { duration: 30 },
        roomName: "interview-invalid-start-room",
        state: "active",
        version: 3,
        terminalReason: null,
        deadlineRoomCleanupStatus: null,
        databaseNow: new Date(DEADLINE),
      }),
      terminateRoom: async ({ roomName }) => {
        calls.push(`terminate:${roomName}`);
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
      settleInvalidSession: async () => {
        calls.push("end:provider_failure");
        return settlement("provider_failure", "failed");
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "terminate:interview-invalid-start-room",
    "end:provider_failure",
  ]);
  if (result.ok) {
    assert.equal(
      result.completion.completion.lifecycle.terminalReason,
      "provider_failure"
    );
  }
});

test("invalid-session room cleanup failure commits provider failure then retries with a safe code", async () => {
  let committed = false;
  await assert.rejects(
    () =>
      quarantineInvalidInterviewSessionWorkflow(
        {
          sessionId: SESSION_ID,
          recoveryReason: "missing_started_at",
          env: ENV,
        },
        createDeps({
          getSession: async () => ({
            id: SESSION_ID,
            userId: "650e8400-e29b-41d4-a716-446655440000",
            startedAt: null,
            config: {},
            roomName: "interview-invalid-start-room",
            state: "active",
            version: 3,
            terminalReason: null,
            deadlineRoomCleanupStatus: null,
            databaseNow: new Date(DEADLINE),
          }),
          terminateRoom: async () =>
            providerFailure("livekit", {
              code: "livekit_room_delete_failed",
              message: "provider unavailable",
              retryable: true,
            }),
          settleInvalidSession: async () => {
            committed = true;
            return settlement("provider_failure", "failed");
          },
        })
      ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "livekit_room_delete_failed"
  );
  assert.equal(committed, true);
});

function createDeps(
  overrides: Partial<EnforceInterviewDeadlineDeps> = {}
): EnforceInterviewDeadlineDeps {
  return {
    getSession: async () => deadlineSession(new Date(DEADLINE)),
    claimDue: async () => true,
    scheduleDeadline: async () => undefined,
    settleSession: async () => settlement(),
    settleInvalidSession: async () => settlement("provider_failure", "failed"),
    dispatchSettlement: async (completion) => completedSettlement(completion),
    terminateRoom: async ({ roomName }) =>
      providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      }),
    acknowledgeRoomCleanup: async () => {},
    markRoomCleanupComplete: async () => undefined,
    ...overrides,
  };
}

function deadlineSession(databaseNow: Date): InterviewDeadlineSession {
  return {
    id: SESSION_ID,
    userId: "650e8400-e29b-41d4-a716-446655440000",
    startedAt: new Date("2026-07-10T06:00:00.000Z"),
    config: { duration: 30 },
    roomName: "interview-deadline-room",
    state: "active",
    version: 3,
    terminalReason: null,
    deadlineRoomCleanupStatus: null,
    databaseNow,
  };
}

function settlement(
  terminalReason:
    | "time_limit"
    | "provider_failure"
    | "insufficient_signal"
    | "user_end" = "time_limit",
  state: "completed" | "abandoned" | "failed" = "completed"
): Extract<SettleInterviewSessionResult, { ok: true }> {
  const result = completion(terminalReason, state);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected completed fixture");
  return {
    ok: true,
    completion: result.completion,
  };
}

function completedSettlement(
  settled: InterviewSessionSettlement,
  dispatchStatus: "sent" | "not_required" = settled.feedback.dispatchStatus ===
  "not_required"
    ? "not_required"
    : "sent"
): Extract<EndInterviewSessionResult, { ok: true }> {
  return {
    ok: true,
    completion: {
      ...settled,
      feedback: { ...settled.feedback, dispatchStatus },
    },
    dispatch:
      dispatchStatus === "sent"
        ? ({
            ok: true,
            disposition: "sent",
            dispatch: {
              status: "sent",
              sessionId: SESSION_ID,
              eventId: `feedback/generate.requested:${SESSION_ID}:1`,
              attempts: 1,
              claimedAt: new Date(DEADLINE),
              dispatchedAt: new Date(DEADLINE),
            },
          } as Extract<EndInterviewSessionResult, { ok: true }>["dispatch"])
        : null,
  };
}

function completion(
  terminalReason:
    | "time_limit"
    | "provider_failure"
    | "insufficient_signal"
    | "user_end" = "time_limit",
  state: "completed" | "abandoned" | "failed" = "completed"
): EndInterviewSessionResult {
  return {
    ok: true,
    completion: {
      ok: true,
      disposition: "existing",
      userId: "650e8400-e29b-41d4-a716-446655440000",
      roomName: "interview-deadline-room",
      lifecycle: {
        state,
        version: 4,
        terminalReason,
        endedAt: new Date(DEADLINE),
      },
      feedback: {
        status:
          terminalReason === "insufficient_signal" ? "skipped" : "pending",
        dispatchStatus:
          terminalReason === "insufficient_signal" ? "not_required" : "sent",
      },
      deadlineRoomCleanupStatus:
        terminalReason === "time_limit" ||
        terminalReason === "insufficient_signal"
          ? "pending"
          : null,
      stats: {},
      tier: "full",
      recommendations: [],
    },
    dispatch: null,
  } as unknown as EndInterviewSessionResult;
}
