import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
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
  const before = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      now: () => new Date("2026-07-10T06:29:59.999Z"),
      endSession: async () => {
        ended += 1;
        return completion();
      },
    })
  );
  const at = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      now: () => new Date(DEADLINE),
      endSession: async () => {
        ended += 1;
        return completion();
      },
    })
  );

  assert.deepEqual(before, { ok: false, disposition: "not_due" });
  assert.equal(at.ok, true);
  assert.equal(ended, 1);
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
  const deps = createDeps({
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
        startedAt: null,
        config: { duration: 30 },
        roomName: "interview-invalid-start-room",
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
            startedAt: null,
            config: {},
            roomName: "interview-invalid-start-room",
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
    getSession: async () => ({
      id: SESSION_ID,
      startedAt: new Date("2026-07-10T06:00:00.000Z"),
      config: { duration: 30 },
      roomName: "interview-deadline-room",
    }),
    endSession: async () => completion(),
    endInvalidSession: async () => completion("provider_failure", "failed"),
    terminateRoom: async ({ roomName }) =>
      providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      }),
    markRoomCleanupComplete: async () => undefined,
    now: () => new Date(DEADLINE),
    ...overrides,
  };
}

function completion(
  terminalReason: "time_limit" | "provider_failure" = "time_limit",
  state: "completed" | "failed" = "completed"
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
