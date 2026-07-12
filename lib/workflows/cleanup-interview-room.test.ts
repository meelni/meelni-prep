import assert from "node:assert/strict";
import test from "node:test";

import type {
  InterviewReconnectSession,
  InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import {
  cleanupInterviewRoomWorkflow,
  type CleanupInterviewRoomDeps,
} from "./cleanup-interview-room";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("terminal room cleanup deletes once and clears durable intent", async () => {
  const fixture = createFixture();
  const result = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );
  const replay = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );

  assert.equal(result.ok, true);
  assert.deepEqual(replay, {
    ok: true,
    disposition: "already_clean",
    room: null,
  });
  assert.deepEqual(fixture.calls, ["attempt", "terminate", "clear"]);
});

test("provider failure preserves durable cleanup intent for recovery", async () => {
  const fixture = createFixture();
  let attempts = 0;
  fixture.deps.terminateRoom = async () => {
    fixture.calls.push("terminate");
    attempts += 1;
    return attempts === 1
      ? providerFailure("livekit", {
          code: "livekit_room_delete_failed",
          message: "provider unavailable",
          retryable: true,
        })
      : providerSuccess("livekit", {
          roomName: fixture.current.roomName,
          disposition: "deleted",
        });
  };

  await assert.rejects(
    () =>
      cleanupInterviewRoomWorkflow(
        { sessionId: SESSION_ID, env: ENV },
        fixture.deps
      ),
    /room cleanup failed/
  );
  assert.equal(fixture.current.roomCleanupPending, true);
  assert.deepEqual(fixture.calls, ["attempt", "terminate"]);

  const recovered = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );
  assert.equal(recovered.ok, true);
  assert.equal(fixture.current.roomCleanupPending, false);
  assert.deepEqual(fixture.calls, [
    "attempt",
    "terminate",
    "attempt",
    "terminate",
    "clear",
  ]);
});

test("terminal cleanup recovers a quarantined room without a start time", async () => {
  const fixture = createFixture();
  fixture.setCurrent({ ...fixture.current, startedAt: null });

  const result = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, ["attempt", "terminate", "clear"]);
  assert.equal(fixture.current.roomCleanupPending, false);
});

function createFixture(): {
  deps: CleanupInterviewRoomDeps;
  calls: string[];
  current: InterviewReconnectSession;
  setCurrent(value: InterviewReconnectSession): void;
} {
  const calls: string[] = [];
  let current = createSession();
  const store: InterviewReconnectStore = {
    getById: async () => current,
    getByRoom: async () => current,
    applyTransportTransition: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    recordTransportObservation: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    recordRuntimeReady: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    claimTimeout: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    refineTimeoutClaim: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    markRoomCleanupComplete: async () => {
      calls.push("clear");
      current = {
        ...current,
        reconnectDeadlineAt: null,
        roomCleanupPending: false,
      };
    },
    markRoomCleanupAttempted: async () => {
      calls.push("attempt");
    },
    markPresenceReconciled: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    recoverFromPresence: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
  };
  return {
    calls,
    setCurrent(value) {
      current = value;
    },
    get current() {
      return current;
    },
    deps: {
      store,
      terminateRoom: async ({ roomName }) => {
        calls.push("terminate");
        return providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
      },
      now: () => new Date("2026-07-10T08:00:05.000Z"),
    },
  };
}

function createSession(): InterviewReconnectSession {
  return {
    sessionId: SESSION_ID,
    userId: "650e8400-e29b-41d4-a716-446655440000",
    roomName: "interview-terminal-room",
    state: "completed",
    version: 5,
    terminalReason: "user_end",
    config: { duration: 30 },
    startedAt: new Date("2026-07-10T07:45:00.000Z"),
    activatedAt: new Date("2026-07-10T07:45:02.000Z"),
    runtimeReadyAt: new Date("2026-07-10T07:45:01.000Z"),
    lastTransitionAt: new Date("2026-07-10T08:00:00.000Z"),
    reconnectDeadlineAt: null,
    roomCleanupPending: true,
    roomCleanupAttemptedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T07:45:00.000Z"),
    lastTransportEventId: "candidate-joined",
    lastTransportEventName: "participant_joined",
  };
}
