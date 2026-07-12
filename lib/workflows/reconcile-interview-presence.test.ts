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
    providerSuccess("livekit", presence({ candidate: false, agent: false }));

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
    providerSuccess("livekit", presence());

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

test("connecting activates when only the initial candidate webhook was lost", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: new Date("2026-07-10T08:00:05.000Z"),
      lastTransportEventAt: null,
      lastTransportEventId: null,
      lastTransportEventName: null,
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", presence());

  const result = await run(fixture.deps, "candidate-missed");

  assert.deepEqual(result, { ok: true, disposition: "activated" });
  assert.equal(fixture.current.state, "active");
  assert.deepEqual(fixture.eventKinds, ["candidate:participant_joined"]);
});

test("connecting activates when only the initial agent webhook was lost", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: null,
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", presence());

  const result = await run(fixture.deps, "agent-missed");

  assert.deepEqual(result, { ok: true, disposition: "activated" });
  assert.equal(fixture.current.state, "active");
  assert.deepEqual(fixture.eventKinds, ["agent:participant_joined"]);
});

test("connecting repairs both missing initial webhooks once", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: null,
      lastTransportEventAt: null,
      lastTransportEventId: null,
      lastTransportEventName: null,
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", presence());

  const first = await run(fixture.deps, "both-missed");
  const repeat = await run(fixture.deps, "both-missed");

  assert.deepEqual(first, { ok: true, disposition: "activated" });
  assert.deepEqual(repeat, { ok: true, disposition: "present" });
  assert.deepEqual(fixture.eventKinds, [
    "candidate:participant_joined",
    "agent:participant_joined",
  ]);
});

test("connecting never activates unless candidate and agent are both present", async () => {
  for (const snapshot of [
    presence({ candidate: false }),
    presence({ agent: false }),
    presence({ candidate: false, agent: false }),
  ]) {
    const fixture = createFixture(
      createSession({
        state: "connecting",
        version: 2,
        activatedAt: null,
        runtimeReadyAt: null,
        lastTransportEventAt: null,
        lastTransportEventId: null,
        lastTransportEventName: null,
      })
    );
    fixture.deps.inspectPresence = async () =>
      providerSuccess("livekit", snapshot);

    assert.deepEqual(await run(fixture.deps, "missing-presence"), {
      ok: true,
      disposition: "connecting",
    });
    assert.equal(fixture.current.state, "connecting");
    assert.deepEqual(fixture.eventKinds, []);
  }
});

test("connecting does not treat candidate JOINING as an activation receipt", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: null,
      lastTransportEventAt: null,
      lastTransportEventId: null,
      lastTransportEventName: null,
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", { ...presence(), joined: false });

  assert.deepEqual(await run(fixture.deps, "candidate-joining"), {
    ok: true,
    disposition: "connecting",
  });
  assert.deepEqual(fixture.eventKinds, []);
});

test("an older reconciled candidate join cannot override a newer loss", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: null,
      lastTransportEventAt: NOW,
      lastTransportEventId: "newer-loss",
      lastTransportEventName: "participant_left",
    })
  );
  fixture.deps.inspectPresence = async () =>
    providerSuccess(
      "livekit",
      presence({ joinedAt: new Date(NOW.getTime() - 1_000) })
    );

  const result = await run(fixture.deps, "reordered");

  assert.deepEqual(result, { ok: true, disposition: "connecting" });
  assert.equal(fixture.current.state, "connecting");
  assert.equal(fixture.current.lastTransportEventName, "participant_left");
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
  eventKinds: string[];
  conflictOnMark: boolean;
} {
  let current = initial;
  let losses = 0;
  let recoveries = 0;
  let inspections = 0;
  let conflictOnMark = false;
  const eventKinds: string[] = [];
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
        return providerSuccess("livekit", presence());
      },
      handleTransportEvent: async (input) => {
        const isCandidate =
          input.participantIdentity === USER_ID && input.participantKind === 0;
        const isAgent = input.participantKind === 4;
        eventKinds.push(
          `${isCandidate ? "candidate" : isAgent ? "agent" : "other"}:${input.eventName}`
        );
        if (
          isCandidate &&
          current.lastTransportEventAt &&
          input.occurredAt.getTime() < current.lastTransportEventAt.getTime()
        ) {
          return { ok: true, disposition: "ignored", lifecycle: current };
        }
        if (
          isCandidate &&
          input.eventName === "participant_left" &&
          current.state === "active"
        ) {
          losses += 1;
          current = {
            ...current,
            state: "reconnecting",
            version: current.version + 1,
            reconnectDeadlineAt: new Date("2026-07-10T08:00:40.000Z"),
            lastTransitionAt: NOW,
          };
          return { ok: true, disposition: "reconnecting", lifecycle: current };
        }
        if (isCandidate && input.eventName === "participant_joined") {
          current = {
            ...current,
            lastTransportEventAt: input.occurredAt,
            lastTransportEventId: input.eventId,
            lastTransportEventName: input.eventName,
          };
          if (current.state === "connecting" && current.runtimeReadyAt) {
            current = {
              ...current,
              state: "active",
              version: current.version + 1,
              activatedAt: NOW,
              lastTransitionAt: NOW,
            };
            return { ok: true, disposition: "activated", lifecycle: current };
          }
        }
        if (
          isAgent &&
          input.eventName === "participant_joined" &&
          current.state === "connecting"
        ) {
          current = { ...current, runtimeReadyAt: NOW };
          if (current.lastTransportEventName === "participant_joined") {
            current = {
              ...current,
              state: "active",
              version: current.version + 1,
              activatedAt: NOW,
              lastTransitionAt: NOW,
            };
            return { ok: true, disposition: "activated", lifecycle: current };
          }
        }
        return { ok: true, disposition: "ignored", lifecycle: current };
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
    get eventKinds() {
      return eventKinds;
    },
    get conflictOnMark() {
      return conflictOnMark;
    },
    set conflictOnMark(value) {
      conflictOnMark = value;
    },
  };
}

function presence({
  candidate = true,
  agent = true,
  joinedAt = NOW,
}: {
  candidate?: boolean;
  agent?: boolean;
  joinedAt?: Date;
} = {}) {
  return {
    present: candidate,
    joined: candidate,
    joinedAt: candidate ? joinedAt : null,
    agent: agent
      ? { identity: "agent-worker", joinedAt: new Date(joinedAt.getTime() - 1) }
      : null,
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
