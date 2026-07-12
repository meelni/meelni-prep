import assert from "node:assert/strict";
import test from "node:test";

import type {
  InterviewReconnectSession,
  InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import type { SessionValidation } from "@/lib/evaluation/session-validator";
import { SessionTier } from "@/lib/evaluation/session-validator";
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

test("authoritative presence recovers before the timeout claim", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", {
      present: true,
      joined: true,
      joinedAt: new Date("2026-07-10T08:00:29.000Z"),
      agent: null,
    });

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.disposition, "presence_recovered");
  assert.equal(fixture.current.state, "active");
  assert.equal(fixture.current.version, 5);
  assert.deepEqual(fixture.calls, []);
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

test("timeout drains transcripts before taking its single validation snapshot", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  const originalValidate = fixture.deps.validate;
  fixture.deps.waitUntil = async () => {
    fixture.calls.push("drain");
  };
  fixture.deps.validate = async (sessionId) => {
    fixture.calls.push("validate");
    return originalValidate(sessionId);
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, [
    "claim",
    "terminate",
    "drain",
    "validate",
    "end",
  ]);
});

test("validation stays blocked until the bounded transcript drain completes", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseDrain!: () => void;
  let validationCalls = 0;
  fixture.deps.waitUntil = () =>
    new Promise((resolve) => {
      releaseDrain = resolve;
    });
  fixture.deps.validate = async () => {
    validationCalls += 1;
    return validValidation();
  };

  const enforcement = run(fixture.deps);
  await waitFor(() => fixture.calls.includes("terminate"));
  assert.equal(validationCalls, 0);

  releaseDrain();
  assert.equal((await enforcement).ok, true);
  assert.equal(validationCalls, 1);
});

test("timeout claims the authorization fence before transcript validation resolves", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseValidation!: () => void;
  fixture.deps.validate = () =>
    new Promise((resolve) => {
      releaseValidation = () =>
        resolve({
          isValid: true,
          reasons: [],
          stats: emptyStats(),
          tier: SessionTier.FULL,
          recommendations: [],
        });
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
    transportEventAt: new Date(DEADLINE),
    transportEventId: "late-restore",
    transportEventName: "participant_joined",
    recordTransportEvent: true,
    transitionedAt: new Date(DEADLINE),
  });
  assert.equal(restore.applied, false);

  releaseValidation();
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

test("insufficient durable signal refines the claimed timeout reason", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  fixture.deps.validate = async () => ({
    isValid: false,
    reasons: ["not enough signal"],
    stats: emptyStats(),
    tier: SessionTier.INSUFFICIENT,
    recommendations: [],
  });

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(fixture.current.terminalReason, "insufficient_signal");
});

test("the first completed timeout settlement survives a divergent retry", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseFirstValidation!: () => void;
  let validationCalls = 0;
  fixture.deps.validate = async () => {
    validationCalls += 1;
    if (validationCalls === 1) {
      return new Promise((resolve) => {
        releaseFirstValidation = () => resolve(invalidValidation());
      });
    }
    return validValidation();
  };

  const first = run(fixture.deps);
  await waitFor(() => validationCalls === 1);
  const retry = await run(fixture.deps);
  assert.equal(retry.ok, true);
  assert.equal(fixture.current.state, "completed");
  assert.equal(fixture.current.terminalReason, "disconnect_timeout");

  releaseFirstValidation();
  assert.deepEqual(await first, { ok: false, disposition: "stale_event" });
  assert.equal(fixture.current.state, "completed");
  assert.equal(fixture.current.terminalReason, "disconnect_timeout");
});

test("the first abandoned timeout settlement survives a divergent retry", async () => {
  const fixture = createFixture(new Date(DEADLINE));
  let releaseFirstValidation!: () => void;
  let validationCalls = 0;
  fixture.deps.validate = async () => {
    validationCalls += 1;
    if (validationCalls === 1) {
      return new Promise((resolve) => {
        releaseFirstValidation = () => resolve(validValidation());
      });
    }
    return invalidValidation();
  };

  const first = run(fixture.deps);
  await waitFor(() => validationCalls === 1);
  const retry = await run(fixture.deps);
  assert.equal(retry.ok, true);
  assert.equal(fixture.current.state, "abandoned");
  assert.equal(fixture.current.terminalReason, "insufficient_signal");

  releaseFirstValidation();
  const resumed = await first;
  assert.equal(resumed.ok, true);
  assert.equal(fixture.current.state, "abandoned");
  assert.equal(fixture.current.terminalReason, "insufficient_signal");
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
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime()
      ) {
        return { applied: false, reason: "conflict", current };
      }
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
    claimTimeout: async (input) => {
      if (
        current.state !== "reconnecting" ||
        current.version !== input.expectedVersion ||
        current.reconnectDeadlineAt?.getTime() !== input.deadlineAt.getTime()
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
      validate: async () => ({
        isValid: true,
        reasons: [],
        stats: emptyStats(),
        tier: SessionTier.FULL,
        recommendations: [],
      }),
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
      now: () => now,
      waitUntil: async () => undefined,
    },
  };
}

function emptyStats(): SessionValidation["stats"] {
  return {
    totalTurns: 0,
    userTurns: 0,
    totalWords: 0,
    durationSeconds: 0,
    substantiveResponses: 0,
  };
}

function validValidation(): SessionValidation {
  return {
    isValid: true,
    reasons: [],
    stats: emptyStats(),
    tier: SessionTier.FULL,
    recommendations: [],
  };
}

function invalidValidation(): SessionValidation {
  return {
    isValid: false,
    reasons: ["not enough signal"],
    stats: emptyStats(),
    tier: SessionTier.INSUFFICIENT,
    recommendations: [],
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
    roomCleanupPending: false,
    roomCleanupAttemptedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T08:00:00.000Z"),
    lastTransportEventId: "lost-1",
    lastTransportEventName: "participant_left",
    ...overrides,
  };
}

function completion(): EndInterviewSessionResult {
  return {
    ok: true,
    completion: {
      ok: true,
      disposition: "applied",
      lifecycle: { terminalReason: "disconnect_timeout" },
    },
    dispatch: null,
  } as EndInterviewSessionResult;
}
