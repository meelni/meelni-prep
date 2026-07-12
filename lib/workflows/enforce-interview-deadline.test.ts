import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
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
  const before = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      now: () => new Date("2026-07-10T06:29:59.999Z"),
      settleSession: async () => {
        ended += 1;
        return settlement();
      },
    })
  );
  const at = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      now: () => new Date(DEADLINE),
      settleSession: async () => {
        ended += 1;
        return settlement();
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

test("deadline attempts room deletion before terminal settlement", async () => {
  const calls: string[] = [];
  const result = await enforceInterviewDeadlineWorkflow(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE, env: ENV },
    createDeps({
      settleSession: async () => {
        calls.push("settle");
        return settlement();
      },
      dispatchSettlement: async (completion) => {
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
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "terminate:interview-deadline-room",
    "settle",
    "dispatch",
  ]);
});

test("room deletion failure commits terminal truth but defers feedback until acknowledged cleanup", async () => {
  let stored: InterviewSessionSettlement | null = null;
  let feedbackEvents = 0;
  let deleteAttempts = 0;
  const deps = createDeps({
    settleSession: async () => {
      if (!stored) stored = settlement().completion;
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
      if (feedbackEvents === 0) feedbackEvents += 1;
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
  const deps = createDeps({
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
    getSession: async () => ({
      id: SESSION_ID,
      startedAt: new Date("2026-07-10T06:00:00.000Z"),
      config: { duration: 30 },
      roomName: "interview-deadline-room",
    }),
    settleSession: async () => settlement(),
    settleInvalidSession: async () => settlement("provider_failure", "failed"),
    dispatchSettlement: async (completion) => completedSettlement(completion),
    terminateRoom: async ({ roomName }) =>
      providerSuccess("livekit", {
        roomName,
        disposition: "already_absent" as const,
      }),
    now: () => new Date(DEADLINE),
    ...overrides,
  };
}

function settlement(
  terminalReason: "time_limit" | "provider_failure" = "time_limit",
  state: "completed" | "failed" = "completed"
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
