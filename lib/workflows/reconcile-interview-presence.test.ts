import assert from "node:assert/strict";
import test from "node:test";

import type {
  InterviewReconnectSession,
  InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import {
  reconcileInterviewPresenceWorkflow,
  type ReconcileInterviewPresenceDeps,
} from "./reconcile-interview-presence";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const NOW = new Date("2026-07-10T08:00:10.000Z");
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("a missed participant loss is synthesized exactly once", async () => {
  const fixture = createFixture(createSession());
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", { present: false, joinedAt: null });

  const first = await run(fixture.deps, "scan-1");
  const replay = await run(fixture.deps, "scan-1");

  assert.deepEqual(first, { ok: true, disposition: "absence_observed" });
  assert.deepEqual(replay, { ok: true, disposition: "reconnecting" });
  assert.equal(fixture.losses, 1);
  assert.equal(fixture.current.state, "reconnecting");
});

test("authoritative presence repairs a missed join exactly once", async () => {
  const fixture = createFixture(
    createSession({
      state: "reconnecting",
      version: 4,
      reconnectDeadlineAt: new Date("2026-07-10T08:00:30.000Z"),
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", { present: true, joinedAt: NOW });

  const first = await run(fixture.deps, "scan-1");
  const replay = await run(fixture.deps, "scan-1");

  assert.deepEqual(first, { ok: true, disposition: "recovered" });
  assert.deepEqual(replay, { ok: true, disposition: "present" });
  assert.equal(fixture.recoveries, 1);
  assert.equal(fixture.current.state, "active");
});

test("provider failure records scan fairness but never invents a loss", async () => {
  const fixture = createFixture(createSession());
  fixture.deps.inspectPresence = async () =>
    providerFailure("livekit", {
      code: "livekit_participant_presence_failed",
      message: "provider unavailable",
      retryable: true,
    });

  await assert.rejects(() => run(fixture.deps, "scan-1"), /inspection failed/);
  assert.equal(fixture.current.state, "active");
  assert.equal(fixture.current.presenceReconciledAt?.getTime(), NOW.getTime());
  assert.equal(fixture.losses, 0);
});

test("a lifecycle change before the scan mark makes reconciliation stale", async () => {
  const fixture = createFixture(createSession());
  fixture.conflictOnMark = true;

  const result = await run(fixture.deps, "scan-1");

  assert.deepEqual(result, { ok: false, disposition: "stale_event" });
  assert.equal(fixture.inspections, 0);
  assert.equal(fixture.losses, 0);
});

function run(deps: ReconcileInterviewPresenceDeps, deliveryId: string) {
  return reconcileInterviewPresenceWorkflow(
    { sessionId: SESSION_ID, deliveryId, env: ENV },
    deps
  );
}

function createFixture(initial: InterviewReconnectSession): {
  deps: ReconcileInterviewPresenceDeps;
  current: InterviewReconnectSession;
  losses: number;
  recoveries: number;
  inspections: number;
  conflictOnMark: boolean;
} {
  let current = initial;
  let losses = 0;
  let recoveries = 0;
  let inspections = 0;
  let conflictOnMark = false;
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
    markRoomCleanupComplete: async () => undefined,
    markRoomCleanupAttempted: async () => undefined,
    markPresenceReconciled: async (input) => {
      if (conflictOnMark || current.version !== input.expectedVersion) {
        return { applied: false, reason: "conflict", current };
      }
      current = { ...current, presenceReconciledAt: input.checkedAt };
      return { applied: true, current };
    },
    recoverFromPresence: async (input) => {
      if (
        current.state !== "reconnecting" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime()
      ) {
        return { applied: false, reason: "conflict", current };
      }
      recoveries += 1;
      current = {
        ...current,
        state: "active",
        version: current.version + 1,
        reconnectDeadlineAt: null,
        lastTransitionAt: input.transitionedAt,
        presenceReconciledAt: input.transitionedAt,
      };
      return { applied: true, current };
    },
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
  };

  return {
    deps: {
      store,
      inspectPresence: async () => {
        inspections += 1;
        return providerSuccess("livekit", { present: true, joinedAt: NOW });
      },
      handleTransportLoss: async () => {
        losses += 1;
        current = {
          ...current,
          state: "reconnecting",
          version: current.version + 1,
          reconnectDeadlineAt: new Date("2026-07-10T08:00:40.000Z"),
          lastTransitionAt: NOW,
        };
        return { ok: true, disposition: "reconnecting", lifecycle: current };
      },
      now: () => NOW,
    },
    get current() {
      return current;
    },
    get losses() {
      return losses;
    },
    get recoveries() {
      return recoveries;
    },
    get inspections() {
      return inspections;
    },
    get conflictOnMark() {
      return conflictOnMark;
    },
    set conflictOnMark(value) {
      conflictOnMark = value;
    },
  };
}

function createSession(
  overrides: Partial<InterviewReconnectSession> = {}
): InterviewReconnectSession {
  return {
    sessionId: SESSION_ID,
    userId: USER_ID,
    roomName: "interview-presence-room",
    state: "active",
    version: 3,
    terminalReason: null,
    config: { duration: 30 },
    startedAt: new Date("2026-07-10T07:45:00.000Z"),
    activatedAt: new Date("2026-07-10T07:45:02.000Z"),
    runtimeReadyAt: new Date("2026-07-10T07:45:01.000Z"),
    lastTransitionAt: new Date("2026-07-10T07:45:02.000Z"),
    reconnectDeadlineAt: null,
    roomCleanupPending: false,
    roomCleanupAttemptedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T07:45:02.000Z"),
    lastTransportEventId: "joined-1",
    lastTransportEventName: "participant_joined",
    ...overrides,
  };
}
