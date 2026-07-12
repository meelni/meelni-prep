import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import type { InterviewDeadlineSession } from "@/lib/db/session-deadlines";
import {
  SessionTier,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import type { EndInterviewSessionResult } from "./end-interview-session";
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
      endSession: async () => {
        ended += 1;
        return completion();
      },
    })
  );
  const at = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      endSession: async () => {
        ended += 1;
        return completion();
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
    endSession: async () => {
      ended += 1;
      return completion();
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

test("deadline attempts room deletion before terminal settlement", async () => {
  const calls: string[] = [];
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      endSession: async () => {
        calls.push("end");
        return completion();
      },
      terminateRoom: async ({ roomName }) => {
        calls.push(`terminate:${roomName}`);
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["terminate:interview-deadline-room", "end"]);
});

test("room deletion failure retries without reversing committed completion", async () => {
  let committed = false;
  await assert.rejects(
    () =>
      enforceInterviewDeadlineWorkflow(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
        createDeps({
          endSession: async () => {
            committed = true;
            return completion();
          },
          terminateRoom: async () =>
            providerFailure("livekit", {
              code: "livekit_room_delete_failed",
              message: "provider unavailable",
              retryable: true,
            }),
        })
      ),
    /room termination failed/
  );
  assert.equal(committed, true);
});

test("duplicate deadline commands converge on one stored terminal claim", async () => {
  let terminalWrites = 0;
  let stored: EndInterviewSessionResult | null = null;
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
      };
      return true;
    },
    endSession: async () => {
      if (!stored) {
        terminalWrites += 1;
        stored = completion();
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

test("hard deadline claims preserve insufficient-signal validation", async () => {
  let claimedReason: string | null = null;
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      validateSession: async () => validValidation(false),
      claimDue: async (input) => {
        claimedReason = input.terminalReason;
        return true;
      },
      endSession: async (_sessionId, validation) => {
        assert.equal(validation.isValid, false);
        return completion("insufficient_signal", "abandoned");
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(claimedReason, "insufficient_signal");
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
        databaseNow: new Date(DEADLINE),
      }),
      terminateRoom: async ({ roomName }) => {
        calls.push(`terminate:${roomName}`);
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
      endInvalidSession: async () => {
        calls.push("end:provider_failure");
        return completion("provider_failure", "failed");
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
            databaseNow: new Date(DEADLINE),
          }),
          terminateRoom: async () =>
            providerFailure("livekit", {
              code: "livekit_room_delete_failed",
              message: "provider unavailable",
              retryable: true,
            }),
          endInvalidSession: async () => {
            committed = true;
            return completion("provider_failure", "failed");
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
    validateSession: async () => validValidation(),
    endSession: async () => completion(),
    endInvalidSession: async () => completion("provider_failure", "failed"),
    terminateRoom: async ({ roomName }) =>
      providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      }),
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
    databaseNow,
  };
}

function validValidation(isValid = true): SessionValidation {
  return {
    tier: isValid ? SessionTier.FULL : SessionTier.INSUFFICIENT,
    isValid,
    stats: {
      totalTurns: isValid ? 20 : 0,
      userTurns: isValid ? 10 : 0,
      totalWords: isValid ? 800 : 0,
      durationSeconds: isValid ? 1_200 : 0,
      substantiveResponses: isValid ? 8 : 0,
    },
    reasons: isValid ? [] : ["Insufficient durable signal"],
    recommendations: [],
  };
}

function completion(
  terminalReason:
    | "time_limit"
    | "provider_failure"
    | "insufficient_signal" = "time_limit",
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
        status: "pending",
        dispatchStatus: "sent",
      },
      stats: {},
      tier: "full",
      recommendations: [],
    },
    dispatch: null,
  } as unknown as EndInterviewSessionResult;
}
