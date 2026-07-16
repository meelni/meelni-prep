import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEW_ROOM_PROVISIONING_LEASE_MS,
  type InterviewReconnectSession,
  type InterviewReconnectStore,
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

test("fresh provisioning lease cannot be reclaimed by cleanup", async () => {
  const fixture = createFixture();
  fixture.setCurrent({
    ...fixture.current,
    state: "connecting",
    version: 2,
    terminalReason: null,
    roomProvisioningPending: true,
    roomProvisioningStartedAt: new Date("2026-07-10T07:59:00.000Z"),
  });

  const result = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );

  assert.deepEqual(result, { ok: false, disposition: "not_due" });
  assert.equal(fixture.current.state, "connecting");
  assert.deepEqual(fixture.calls, []);
});

test("stale provisioning survives teardown failure and later settles room and credit", async () => {
  const fixture = createFixture();
  fixture.setCurrent({
    ...fixture.current,
    state: "connecting",
    version: 2,
    terminalReason: null,
    roomProvisioningPending: true,
    roomProvisioningStartedAt: new Date("2026-07-10T07:54:00.000Z"),
  });
  let attempts = 0;
  fixture.deps.terminateRoom = async ({ roomName }) => {
    fixture.calls.push("terminate");
    attempts += 1;
    return attempts === 1
      ? providerFailure("livekit", {
          code: "livekit_room_delete_failed",
          message: "provider unavailable",
          retryable: true,
        })
      : providerSuccess("livekit", { roomName, disposition: "deleted" });
  };

  await assert.rejects(
    () =>
      cleanupInterviewRoomWorkflow(
        { sessionId: SESSION_ID, env: ENV },
        fixture.deps
      ),
    /room cleanup failed/
  );
  assert.equal(fixture.current.state, "failed");
  assert.equal(fixture.current.roomCleanupPending, true);
  assert.equal(fixture.current.roomProvisioningPending, true);

  const recovered = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );
  assert.equal(recovered.ok, true);
  assert.equal(fixture.current.roomCleanupPending, false);
  assert.equal(fixture.current.roomProvisioningPending, false);
  assert.deepEqual(fixture.calls, [
    "claim-provisioning",
    "attempt",
    "terminate",
    "attempt",
    "terminate",
    "settle-credit",
    "settle-provisioning",
    "clear",
  ]);
});

test("credit-only poison retries advance the shared recovery cursor", async () => {
  const fixture = createFixture();
  fixture.setCurrent({
    ...fixture.current,
    roomCleanupPending: false,
    roomProvisioningPending: true,
    roomProvisioningStartedAt: new Date("2026-07-10T07:54:00.000Z"),
  });
  let attempts = 0;
  fixture.deps.settleProvisioningCredit = async () => {
    fixture.calls.push("settle-credit");
    attempts += 1;
    if (attempts === 1) throw new Error("ledger unavailable");
  };

  await assert.rejects(
    () =>
      cleanupInterviewRoomWorkflow(
        { sessionId: SESSION_ID, env: ENV },
        fixture.deps
      ),
    /ledger unavailable/
  );
  const recovered = await cleanupInterviewRoomWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    fixture.deps
  );

  assert.equal(recovered.ok, true);
  assert.deepEqual(fixture.calls, [
    "attempt",
    "settle-credit",
    "attempt",
    "settle-credit",
    "settle-provisioning",
  ]);
});

function createFixture(): {
  deps: CleanupInterviewRoomDeps;
  calls: string[];
  current: InterviewReconnectSession;
  setCurrent(value: InterviewReconnectSession): void;
} {
  const calls: string[] = [];
  let current = createSession();
  const databaseNow = new Date("2026-07-10T08:00:05.000Z");
  const store: InterviewReconnectStore = {
    getDatabaseTime: async () => new Date(databaseNow),
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
    completeRoomProvisioning: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    markRoomProvisioningSettled: async () => {
      calls.push("settle-provisioning");
      current = {
        ...current,
        roomProvisioningPending: false,
        roomProvisioningStartedAt: null,
      };
    },
    claimStaleProvisioning: async (input) => {
      if (
        current.state !== "connecting" ||
        current.version !== input.expectedVersion ||
        current.roomProvisioningStartedAt?.getTime() !==
          input.provisioningStartedAt.getTime() ||
        input.provisioningStartedAt.getTime() >
          databaseNow.getTime() - INTERVIEW_ROOM_PROVISIONING_LEASE_MS
      ) {
        return { applied: false, reason: "conflict", current };
      }
      calls.push("claim-provisioning");
      current = {
        ...current,
        state: "failed",
        version: current.version + 1,
        terminalReason: "provider_failure",
        lastTransitionAt: input.transitionedAt,
        roomCleanupPending: true,
      };
      return { applied: true, current };
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
    recoverFromDuePresence: async () => ({
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
      settleProvisioningCredit: async () => {
        calls.push("settle-credit");
      },
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
    reconnectDeadlineOwner: null,
    roomCleanupPending: true,
    roomCleanupAttemptedAt: null,
    roomProvisioningPending: false,
    roomProvisioningStartedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T07:45:00.000Z"),
    lastTransportEventId: "candidate-joined",
    lastTransportEventName: "participant_joined",
  };
}
