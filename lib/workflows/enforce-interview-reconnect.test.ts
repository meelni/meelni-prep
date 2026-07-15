import assert from "node:assert/strict";
import test from "node:test";

import type {
  InterviewReconnectSession,
  InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import type { EndInterviewSessionResult } from "./end-interview-session";
import {
  enforceInterviewReconnectWorkflow,
  type EnforceInterviewReconnectDeps,
} from "./enforce-interview-reconnect";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const DEADLINE = "2026-07-10T08:00:30.000Z";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("reconnect timeout is inert 1ms early and claims at the exact instant", async () => {
  const early = createFixture(new Date("2026-07-10T08:00:29.999Z"));
  const at = createFixture(new Date(DEADLINE));

  const earlyResult = await run(early.deps);
  const atResult = await run(at.deps);

  assert.deepEqual(earlyResult, { ok: false, disposition: "not_due" });
  assert.equal(atResult.ok, true);
  assert.deepEqual(at.calls, ["claim", "terminate", "end"]);
  assert.equal(at.current.roomCleanupPending, false);
  assert.equal(at.current.reconnectDeadlineAt, null);
});

test("restored or superseded lifecycle versions make timeout events stale", async () => {
  const fixture = createFixture(new Date(DEADLINE), {
    state: "active",
    version: 5,
    reconnectDeadlineAt: null,
  });
  const result = await run(fixture.deps);

  assert.deepEqual(result, { ok: false, disposition: "stale_event" });
  assert.deepEqual(fixture.calls, []);
});

test("atomic timeout claim prevents a concurrent restore before room deletion", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.onClaim = () => {
    // A restore would compare-and-set reconnecting/version 4. Once the claim
    // commits ending/version 5, it cannot win or keep the room alive.
    assert.equal(fixture.current.state, "ending");
    assert.equal(fixture.current.version, 5);
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, ["claim", "terminate", "end"]);
});

test("due enforcement recovers authoritative presence joined before the cutoff", async () => {
  const cases = [
    {
      label: "JOINED at cutoff minus 1ms",
      databaseNow: new Date(DEADLINE),
      joinedAt: new Date("2026-07-10T08:00:29.999Z"),
    },
    {
      label: "ACTIVE at cutoff minus 1s",
      databaseNow: new Date("2026-07-10T08:00:31.000Z"),
      joinedAt: new Date("2026-07-10T08:00:29.000Z"),
    },
  ];

  for (const { label, databaseNow, joinedAt } of cases) {
    const fixture = createFixture(databaseNow);
    fixture.deps.inspectPresence = async () =>
      providerSuccess("livekit", {
        present: true,
        joined: true,
        joinedAt,
        agent: null,
      });

    const result = await run(fixture.deps);

    assert.deepEqual(
      result,
      {
        ok: true,
        disposition: "presence_recovered",
        completion: null,
        room: null,
      },
      label
    );
    assert.equal(fixture.current.state, "active", label);
    assert.equal(fixture.current.version, 5, label);
    assert.deepEqual(fixture.calls, [], label);
  }
});

test("due presence recovery requires the exact grace generation and cutoff", async () => {
  const staleCases: Array<Partial<InterviewReconnectSession>> = [
    { version: 5 },
    { reconnectDeadlineAt: new Date("2026-07-10T08:00:30.001Z") },
    { reconnectDeadlineOwner: "hard_deadline" },
  ];

  for (const overrides of staleCases) {
    const fixture = createFixture(new Date(DEADLINE), overrides);
    const result = await run(fixture.deps);

    assert.deepEqual(result, { ok: false, disposition: "stale_event" });
    assert.equal(fixture.current.state, "reconnecting");
    assert.deepEqual(fixture.calls, []);
  }
});

test("presence provider failure cannot claim or terminate the session", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.deps.inspectPresence = async () =>
    providerFailure("livekit", {
      code: "livekit_participant_presence_failed",
      message: "provider unavailable",
      retryable: true,
    });

  await assert.rejects(() => run(fixture.deps), /presence inspection failed/);
  assert.equal(fixture.current.state, "reconnecting");
  assert.deepEqual(fixture.calls, []);
});

test("timeout recovery denies JOINING, missing, invalid, equal, and late join evidence", async () => {
  const snapshots = [
    {
      present: true,
      joined: false,
      joinedAt: new Date("2026-07-10T08:00:29.000Z"),
      agent: null,
    },
    { present: true, joined: true, joinedAt: null, agent: null },
    {
      present: true,
      joined: true,
      joinedAt: new Date(Number.NaN),
      agent: null,
    },
    { present: true, joined: true, joinedAt: new Date(DEADLINE), agent: null },
    {
      present: true,
      joined: true,
      joinedAt: new Date("2026-07-10T08:00:30.001Z"),
      agent: null,
    },
  ];

  for (const snapshot of snapshots) {
    const fixture = createFixture(new Date(DEADLINE));
    fixture.deps.inspectPresence = async () =>
      providerSuccess("livekit", snapshot);

    const result = await run(fixture.deps);

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.disposition, "enforced");
    assert.equal(fixture.current.state, "completed");
    assert.equal(fixture.calls.includes("claim"), true);
  }
});

test("timeout drains transcripts before authoritative locked finalization", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.deps.waitUntil = async () => {
    fixture.calls.push("drain");
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, ["claim", "terminate", "drain", "end"]);
});

test("authoritative finalization stays blocked until transcript drain completes", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseDrain!: () => void;
  let endCalls = 0;
  fixture.deps.waitUntil = () =>
    new Promise((resolve) => {
      releaseDrain = resolve;
    });
  fixture.deps.endSession = async () => {
    endCalls += 1;
    return completion();
  };

  const enforcement = run(fixture.deps);
  await waitFor(() => fixture.calls.includes("terminate"));
  assert.equal(endCalls, 0);

  releaseDrain();
  assert.equal((await enforcement).ok, true);
  assert.equal(endCalls, 1);
});

test("timeout claims the authorization fence before locked finalization resolves", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseFinalization!: () => void;
  fixture.deps.endSession = () =>
    new Promise((resolve) => {
      releaseFinalization = () => resolve(completion());
    });

  const enforcement = run(fixture.deps);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fixture.current.state, "ending");
  assert.equal(fixture.current.version, 5);
  assert.deepEqual(fixture.calls, ["claim", "terminate"]);

  const restore = await fixture.deps.store.applyTransportTransition({
    sessionId: SESSION_ID,
    expectedState: "reconnecting",
    expectedVersion: 4,
    nextState: "active",
    reconnectDeadlineAt: null,
    reconnectDeadlineOwner: null,
    transportEventAt: new Date(DEADLINE),
    transportEventId: "late-restore",
    transportEventName: "participant_joined",
    recordTransportEvent: true,
    transitionedAt: new Date(DEADLINE),
  });
  assert.equal(restore.applied, false);

  releaseFinalization();
  assert.equal((await enforcement).ok, true);
});

test("retry resumes an already-claimed timeout without claiming twice", async () => {
  const fixture = createFixture(new Date(DEADLINE), {
    state: "ending",
    version: 5,
    terminalReason: "disconnect_timeout",
  });
  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, ["terminate", "end"]);
});

test("workflow preserves authoritative insufficient-signal settlement", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.deps.endSession = async () => {
    fixture.calls.push("end");
    fixture.current.state = "abandoned";
    fixture.current.terminalReason = "insufficient_signal";
    return completion("insufficient_signal", "skipped");
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(fixture.current.terminalReason, "insufficient_signal");
  if (result.ok) {
    assert.equal(result.completion?.completion.feedback.status, "skipped");
    assert.equal(result.completion?.dispatch, null);
  }
});

test("room deletion retries after terminal settlement commits", async () => {
  const fixture = createFixture(new Date(DEADLINE));
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
      : providerSuccess("livekit", {
          roomName,
          disposition: "deleted" as const,
        });
  };

  await assert.rejects(() => run(fixture.deps), /room termination failed/);
  assert.equal(fixture.current.state, "completed");
  const retry = await run(fixture.deps);

  assert.equal(retry.ok, true);
  if (retry.ok) assert.equal(retry.disposition, "already_terminal");
  assert.deepEqual(fixture.calls, ["claim", "terminate", "end", "terminate"]);
});

function run(deps: EnforceInterviewReconnectDeps) {
  return enforceInterviewReconnectWorkflow(
    {
      sessionId: SESSION_ID,
      expectedVersion: 4,
      deadlineAt: DEADLINE,
      env: ENV,
    },
    deps
  );
}

function createFixture(
  now: Date,
  overrides: Partial<InterviewReconnectSession> = {}
): {
  deps: EnforceInterviewReconnectDeps;
  calls: string[];
  current: InterviewReconnectSession;
  onClaim?: () => void;
} {
  const calls: string[] = [];
  let current = createSession(overrides);
  let onClaim: (() => void) | undefined;
  const store: InterviewReconnectStore = {
    getDatabaseTime: async () => new Date(now),
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
    markRoomCleanupComplete: async () => {
      current = {
        ...current,
        reconnectDeadlineAt: null,
        roomCleanupPending: false,
      };
    },
    markRoomCleanupAttempted: async () => undefined,
    completeRoomProvisioning: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    markRoomProvisioningSettled: async () => undefined,
    claimStaleProvisioning: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
    markPresenceReconciled: async (input) => {
      if (current.version !== input.expectedVersion) {
        return { applied: false, reason: "conflict", current };
      }
      current = { ...current, presenceReconciledAt: input.checkedAt };
      return { applied: true, current };
    },
    recoverFromPresence: async (input) => {
      if (
        current.state !== "reconnecting" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime() ||
        now.getTime() >= input.deadlineAt.getTime() ||
        input.joinedAt.getTime() >= input.deadlineAt.getTime()
      ) {
        return { applied: false, reason: "conflict", current };
      }
      current = {
        ...current,
        state: "active",
        version: current.version + 1,
        reconnectDeadlineAt: null,
        reconnectDeadlineOwner: null,
        lastTransitionAt: input.transitionedAt,
        presenceReconciledAt: input.transitionedAt,
      };
      return { applied: true, current };
    },
    recoverFromDuePresence: async (input) => {
      if (
        current.state !== "reconnecting" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime() ||
        current.reconnectDeadlineOwner !== "reconnect_grace" ||
        now.getTime() < input.deadlineAt.getTime() ||
        !Number.isFinite(input.joinedAt.getTime()) ||
        input.joinedAt.getTime() >= input.deadlineAt.getTime()
      ) {
        return { applied: false, reason: "conflict", current };
      }
      current = {
        ...current,
        state: "active",
        version: current.version + 1,
        terminalReason: null,
        reconnectDeadlineAt: null,
        reconnectDeadlineOwner: null,
        lastTransitionAt: input.transitionedAt,
        presenceReconciledAt: input.transitionedAt,
      };
      return { applied: true, current };
    },
    claimTimeout: async (input) => {
      if (
        current.state !== "reconnecting" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime() ||
        current.reconnectDeadlineOwner !== "reconnect_grace" ||
        now.getTime() < input.deadlineAt.getTime()
      ) {
        return { applied: false, reason: "conflict", current };
      }
      calls.push("claim");
      current = {
        ...current,
        state: "ending",
        version: current.version + 1,
        terminalReason: input.terminalReason,
        roomCleanupPending: true,
      };
      onClaim?.();
      return { applied: true, current };
    },
    refineTimeoutClaim: async (input) => {
      if (
        current.state !== "ending" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime() ||
        current.terminalReason !== input.expectedTerminalReason
      ) {
        return { applied: false, reason: "conflict", current };
      }
      calls.push("refine");
      current = { ...current, terminalReason: input.terminalReason };
      return { applied: true, current };
    },
  };
  return {
    calls,
    get current() {
      return current;
    },
    get onClaim() {
      return onClaim;
    },
    set onClaim(value) {
      onClaim = value;
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
      inspectPresence: async () =>
        providerSuccess("livekit", {
          present: false,
          joined: false,
          joinedAt: null,
          agent: null,
        }),
      endSession: async () => {
        calls.push("end");
        current = {
          ...current,
          state:
            current.terminalReason === "insufficient_signal"
              ? "abandoned"
              : "completed",
          version: current.version + 1,
        };
        return completion();
      },
      waitUntil: async () => undefined,
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for concurrent reconnect state");
}

function createSession(
  overrides: Partial<InterviewReconnectSession>
): InterviewReconnectSession {
  return {
    sessionId: SESSION_ID,
    userId: "650e8400-e29b-41d4-a716-446655440000",
    roomName: "interview-reconnect-room",
    state: "reconnecting",
    version: 4,
    terminalReason: null,
    config: { duration: 30 },
    startedAt: new Date("2026-07-10T07:45:00.000Z"),
    activatedAt: new Date("2026-07-10T07:45:02.000Z"),
    runtimeReadyAt: new Date("2026-07-10T07:45:01.000Z"),
    lastTransitionAt: new Date("2026-07-10T08:00:00.000Z"),
    reconnectDeadlineAt: new Date(DEADLINE),
    reconnectDeadlineOwner: "reconnect_grace",
    roomCleanupPending: false,
    roomCleanupAttemptedAt: null,
    roomProvisioningPending: false,
    roomProvisioningStartedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T08:00:00.000Z"),
    lastTransportEventId: "lost-1",
    lastTransportEventName: "participant_left",
    ...overrides,
  };
}

function completion(
  terminalReason:
    | "disconnect_timeout"
    | "insufficient_signal" = "disconnect_timeout",
  feedbackStatus: "pending" | "skipped" = "pending"
): EndInterviewSessionResult {
  return {
    ok: true,
    completion: {
      ok: true,
      disposition: "applied",
      lifecycle: { terminalReason },
      feedback: { status: feedbackStatus },
    },
    dispatch: null,
  } as EndInterviewSessionResult;
}
