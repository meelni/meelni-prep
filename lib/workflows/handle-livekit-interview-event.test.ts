import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApplyInterviewTransportTransitionInput,
  InterviewReconnectSession,
  InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import {
  compareInterviewTransportEvents,
  compareUtf8Bytes,
} from "@/lib/db/session-reconnects";
import {
  handleLiveKitInterviewEventWorkflow,
  type HandleLiveKitInterviewEventDeps,
} from "./handle-livekit-interview-event";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const ROOM_NAME = "interview-reconnect-room";
const NOW = new Date("2026-07-10T08:00:00.000Z");

test("agent and candidate presence activate once regardless of delivery order", async () => {
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
  const agentInput = event(
    "participant_joined",
    "agent-worker",
    "event-agent-join"
  );
  const candidateInput = event(
    "participant_joined",
    USER_ID,
    "event-candidate-join"
  );

  const agentReady = await handleLiveKitInterviewEventWorkflow(
    agentInput,
    fixture.deps
  );
  const activated = await handleLiveKitInterviewEventWorkflow(
    candidateInput,
    fixture.deps
  );
  const duplicate = await handleLiveKitInterviewEventWorkflow(
    candidateInput,
    fixture.deps
  );

  assert.equal(agentReady.disposition, "ignored");
  assert.equal(activated.disposition, "activated");
  assert.equal(activated.lifecycle?.state, "active");
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(fixture.writes, 1);
});

test("candidate loss before agent readiness cannot activate an empty session", async () => {
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
  await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "candidate-left"),
    fixture.deps
  );
  const agentReady = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", "agent-worker", "agent-ready"),
    fixture.deps
  );

  assert.equal(agentReady.disposition, "ignored");
  assert.equal(agentReady.lifecycle?.state, "connecting");
  assert.equal(agentReady.lifecycle?.runtimeReadyAt?.getTime(), NOW.getTime());
  assert.equal(
    agentReady.lifecycle?.lastTransportEventName,
    "participant_left"
  );
});

test("candidate identity cannot satisfy the distinct signed agent receipt", async () => {
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

  const result = await handleLiveKitInterviewEventWorkflow(
    {
      ...event("participant_joined", USER_ID, "wrong-kind"),
      participantKind: 4,
    },
    fixture.deps
  );

  assert.equal(result.disposition, "ignored");
  assert.equal(result.lifecycle?.state, "connecting");
  assert.equal(result.lifecycle?.runtimeReadyAt, null);
  assert.equal(result.lifecycle?.lastTransportEventId, null);
});

test("short drop enters one fixed grace and candidate rejoin recovers", async () => {
  const fixture = createFixture(createSession());

  const lost = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "event-lost", NOW),
    fixture.deps
  );
  const deadlineAt = lost.lifecycle?.reconnectDeadlineAt;
  const duplicate = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "event-lost", NOW),
    fixture.deps
  );
  const recovered = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "event-restored",
      new Date(NOW.getTime() + 5_000)
    ),
    fixture.deps
  );

  assert.equal(lost.disposition, "reconnecting");
  assert.equal(deadlineAt?.toISOString(), "2026-07-10T08:00:30.000Z");
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(
    duplicate.lifecycle?.reconnectDeadlineAt?.getTime(),
    deadlineAt?.getTime()
  );
  assert.equal(recovered.disposition, "recovered");
  assert.equal(recovered.lifecycle?.state, "active");
  assert.equal(recovered.lifecycle?.reconnectDeadlineAt, null);
  assert.deepEqual(
    fixture.schedules.map((schedule) => schedule.deadlineAt.toISOString()),
    ["2026-07-10T08:00:30.000Z", "2026-07-10T08:00:30.000Z"]
  );
});

test("stale restore from drop one cannot recover drop two", async () => {
  const fixture = createFixture(createSession());
  await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "lost-1", NOW),
    fixture.deps
  );
  await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "restored-1",
      new Date(NOW.getTime() + 2_000)
    ),
    fixture.deps
  );
  const second = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_left",
      USER_ID,
      "lost-2",
      new Date(NOW.getTime() + 10_000)
    ),
    fixture.deps
  );
  const stale = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "late-restored-1",
      new Date(NOW.getTime() + 3_000)
    ),
    fixture.deps
  );

  assert.equal(second.lifecycle?.version, 6);
  assert.equal(stale.disposition, "ignored");
  assert.equal(stale.lifecycle?.state, "reconnecting");
  assert.equal(stale.lifecycle?.version, 6);
});

test("events at the hard deadline cannot enter reconnect or reactivate", async () => {
  const fixture = createFixture(
    createSession({ startedAt: new Date("2026-07-10T07:30:00.000Z") })
  );
  const lost = await handleLiveKitInterviewEventWorkflow(
    event("participant_connection_aborted", USER_ID, "event-lost", NOW),
    fixture.deps
  );

  assert.equal(lost.disposition, "ignored");
  assert.equal(lost.lifecycle?.state, "active");
  assert.equal(lost.lifecycle?.reconnectDeadlineAt, null);
  assert.equal(fixture.schedules.length, 0);

  const reconnectingFixture = createFixture(
    createSession({
      state: "reconnecting",
      version: 4,
      startedAt: new Date("2026-07-10T07:30:00.000Z"),
      reconnectDeadlineAt: NOW,
      reconnectDeadlineOwner: "hard_deadline",
    })
  );
  const restored = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "event-restored",
      new Date(NOW.getTime() - 1)
    ),
    reconnectingFixture.deps
  );

  assert.equal(restored.disposition, "ignored");
  assert.equal(restored.lifecycle?.state, "reconnecting");
});

test("transport events cannot activate a legacy session without canonical start time", async () => {
  const fixture = createFixture(
    createSession({ state: "connecting", startedAt: null })
  );

  const result = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "candidate-invalid-start"),
    fixture.deps
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.disposition, "conflict");
  assert.equal(fixture.writes, 0);
  assert.deepEqual(fixture.schedules, []);
});

test("candidate recovery is accepted 1ms before grace and rejected at grace", async () => {
  const deadlineAt = new Date("2026-07-10T08:00:30.000Z");
  const beforeFixture = createFixture(
    createSession({
      state: "reconnecting",
      version: 4,
      reconnectDeadlineAt: deadlineAt,
    })
  );
  const atFixture = createFixture(
    createSession({
      state: "reconnecting",
      version: 4,
      reconnectDeadlineAt: deadlineAt,
    })
  );

  const before = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "restored-before",
      new Date(deadlineAt.getTime() - 1)
    ),
    beforeFixture.deps
  );
  const at = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "restored-at", deadlineAt),
    atFixture.deps
  );

  assert.equal(before.disposition, "recovered");
  assert.equal(before.lifecycle?.state, "active");
  assert.equal(at.disposition, "ignored");
  assert.equal(at.lifecycle?.state, "reconnecting");
});

test("hard-deadline-owned loss keeps a recoverable cutoff without scheduling grace", async () => {
  const hardDeadlineAt = new Date("2026-07-10T08:00:20.000Z");
  const fixture = createFixture(
    createSession({ startedAt: new Date("2026-07-10T07:30:20.000Z") })
  );

  const lost = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "hard-owned-loss", NOW),
    fixture.deps
  );
  assert.equal(lost.lifecycle?.reconnectDeadlineOwner, "hard_deadline");
  assert.equal(
    lost.lifecycle?.reconnectDeadlineAt?.getTime(),
    hardDeadlineAt.getTime()
  );
  assert.deepEqual(fixture.schedules, []);

  const recovered = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "hard-owned-restore",
      new Date(hardDeadlineAt.getTime() - 1)
    ),
    fixture.deps
  );
  assert.equal(recovered.disposition, "recovered");
  assert.equal(recovered.lifecycle?.state, "active");
});

test("signed rejoin uses strict database time at -1ms, equality, and +1ms", async () => {
  const cutoff = new Date("2026-07-10T08:00:30.000Z");
  for (const [offset, disposition] of [
    [-1, "recovered"],
    [0, "ignored"],
    [1, "ignored"],
  ] as const) {
    const fixture = createFixture(
      createSession({
        state: "reconnecting",
        version: 4,
        reconnectDeadlineAt: cutoff,
        reconnectDeadlineOwner: "hard_deadline",
      }),
      new Date(cutoff.getTime() + offset)
    );
    const result = await handleLiveKitInterviewEventWorkflow(
      event(
        "participant_joined",
        USER_ID,
        `database-cutoff:${offset}`,
        new Date(cutoff.getTime() - 1)
      ),
      fixture.deps
    );
    assert.equal(result.disposition, disposition);
  }
});

test("a delayed pre-deadline join cannot restore after the server deadline", async () => {
  const deadlineAt = new Date("2026-07-10T08:00:30.000Z");
  const fixture = createFixture(
    createSession({
      state: "reconnecting",
      version: 4,
      reconnectDeadlineAt: deadlineAt,
    }),
    new Date(deadlineAt.getTime())
  );

  const result = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "delayed-pre-deadline-join",
      new Date(deadlineAt.getTime() - 1)
    ),
    fixture.deps
  );

  assert.equal(result.disposition, "ignored");
  assert.equal(result.lifecycle?.state, "reconnecting");
  assert.equal(fixture.writes, 0);
});

test("a later join watermark makes an earlier delayed leave inert", async () => {
  const fixture = createFixture(createSession());
  const joined = await handleLiveKitInterviewEventWorkflow(
    event(
      "participant_joined",
      USER_ID,
      "joined-later",
      new Date(NOW.getTime() + 5_000)
    ),
    fixture.deps
  );
  const delayedLeave = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "left-earlier", NOW),
    fixture.deps
  );

  assert.equal(joined.disposition, "ignored");
  assert.equal(delayedLeave.disposition, "ignored");
  assert.equal(delayedLeave.lifecycle?.state, "active");
  assert.equal(fixture.schedules.length, 0);
});

for (const delayedEventName of [
  "participant_left",
  "participant_connection_aborted",
] as const) {
  test(`an equal-time delayed ${delayedEventName} cannot reverse a candidate join`, async () => {
    const fixture = createFixture(createSession());
    const joined = await handleLiveKitInterviewEventWorkflow(
      event("participant_joined", USER_ID, "joined-at-tie", NOW),
      fixture.deps
    );
    const delayedDisconnect = await handleLiveKitInterviewEventWorkflow(
      event(delayedEventName, USER_ID, `delayed-${delayedEventName}`, NOW),
      fixture.deps
    );

    assert.equal(joined.disposition, "ignored");
    assert.equal(delayedDisconnect.disposition, "ignored");
    assert.equal(delayedDisconnect.lifecycle?.state, "active");
    assert.equal(
      delayedDisconnect.lifecycle?.lastTransportEventName,
      "participant_joined"
    );
    assert.equal(fixture.schedules.length, 0);
  });
}

test("an equal-time join supersedes a disconnect that arrived first", async () => {
  const fixture = createFixture(createSession());
  const disconnected = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "EV_01-left", NOW),
    fixture.deps
  );
  const joined = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "EV_01-joined", NOW),
    fixture.deps
  );

  assert.equal(disconnected.disposition, "reconnecting");
  assert.equal(joined.disposition, "recovered");
  assert.equal(joined.lifecycle?.state, "active");
  assert.equal(joined.lifecycle?.lastTransportEventName, "participant_joined");
});

test("event IDs use PostgreSQL C-collation UTF-8 byte order", () => {
  const ascending = [
    "EV_01-A",
    "EV_01-Z",
    "EV_01_A",
    "EV_01_Z",
    "EV_01_a",
    "EV_01_ä",
  ];

  for (let index = 1; index < ascending.length; index += 1) {
    assert.ok(compareUtf8Bytes(ascending[index - 1]!, ascending[index]!) < 0);
    assert.ok(
      compareInterviewTransportEvents(
        {
          occurredAt: NOW,
          eventId: ascending[index]!,
          eventName: "participant_joined",
        },
        {
          occurredAt: NOW,
          eventId: ascending[index - 1]!,
          eventName: "participant_joined",
        }
      ) > 0
    );
  }
});

test("an exact event replay is idempotent but divergent ID reuse fails closed", async () => {
  const storedAt = new Date(NOW.getTime() - 1_000);
  const fixture = createFixture(
    createSession({
      lastTransportEventAt: storedAt,
      lastTransportEventId: "EV_collision_Aa-01",
      lastTransportEventName: "participant_joined",
    })
  );

  const replay = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "EV_collision_Aa-01", storedAt),
    fixture.deps
  );
  const changedName = await handleLiveKitInterviewEventWorkflow(
    event("participant_left", USER_ID, "EV_collision_Aa-01", storedAt),
    fixture.deps
  );
  const changedTimestamp = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "EV_collision_Aa-01", NOW),
    fixture.deps
  );

  assert.equal(replay.disposition, "duplicate");
  assert.equal(changedName.ok, false);
  assert.equal(changedName.disposition, "conflict");
  assert.equal(changedTimestamp.ok, false);
  assert.equal(changedTimestamp.disposition, "conflict");
  assert.equal(fixture.writes, 0);
});

test("an exact candidate replay can finish activation after runtime readiness", async () => {
  const fixture = createFixture(
    createSession({
      state: "connecting",
      version: 2,
      activatedAt: null,
      runtimeReadyAt: NOW,
      lastTransportEventAt: NOW,
      lastTransportEventId: "EV_candidate_join",
      lastTransportEventName: "participant_joined",
    })
  );

  const result = await handleLiveKitInterviewEventWorkflow(
    event("participant_joined", USER_ID, "EV_candidate_join", NOW),
    fixture.deps
  );

  assert.equal(result.disposition, "activated");
  assert.equal(result.lifecycle?.state, "active");
});

function event(
  eventName:
    | "participant_joined"
    | "participant_left"
    | "participant_connection_aborted",
  participantIdentity: string,
  eventId: string,
  occurredAt = NOW
) {
  return {
    eventId,
    eventName,
    roomName: ROOM_NAME,
    participantIdentity,
    participantKind: participantIdentity === "agent-worker" ? 4 : 0,
    occurredAt,
  };
}

function createSession(
  overrides: Partial<InterviewReconnectSession> = {}
): InterviewReconnectSession {
  return {
    sessionId: SESSION_ID,
    userId: USER_ID,
    roomName: ROOM_NAME,
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
    roomProvisioningPending: false,
    roomProvisioningStartedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: null,
    lastTransportEventId: null,
    lastTransportEventName: "participant_joined",
    ...overrides,
    reconnectDeadlineOwner:
      overrides.reconnectDeadlineOwner ??
      (overrides.reconnectDeadlineAt ? "reconnect_grace" : null),
  };
}

function createFixture(
  initial: InterviewReconnectSession,
  now = NOW
): {
  deps: HandleLiveKitInterviewEventDeps;
  schedules: Array<{
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
  }>;
  readonly writes: number;
} {
  let current = initial;
  let writes = 0;
  const schedules: Array<{
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
  }> = [];
  const store: InterviewReconnectStore = {
    getDatabaseTime: async () => new Date(now),
    getByRoom: async () => current,
    getById: async () => current,
    applyTransportTransition: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion ||
        (input.expectedState === "reconnecting" &&
          input.nextState === "active" &&
          (!current.reconnectDeadlineAt ||
            now.getTime() >= current.reconnectDeadlineAt.getTime() ||
            input.transportEventAt.getTime() >=
              current.reconnectDeadlineAt.getTime())) ||
        (input.recordTransportEvent &&
          compareInterviewTransportEvents(
            {
              occurredAt: input.transportEventAt,
              eventId: input.transportEventId,
              eventName: input.transportEventName,
            },
            {
              occurredAt: current.lastTransportEventAt,
              eventId: current.lastTransportEventId,
              eventName: current.lastTransportEventName,
            }
          ) <= 0)
      ) {
        return { applied: false, reason: "conflict", current };
      }
      writes += 1;
      current = apply(current, input);
      return { applied: true, current };
    },
    recordTransportObservation: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion ||
        compareInterviewTransportEvents(
          {
            occurredAt: input.transportEventAt,
            eventId: input.transportEventId,
            eventName: input.transportEventName,
          },
          {
            occurredAt: current.lastTransportEventAt,
            eventId: current.lastTransportEventId,
            eventName: current.lastTransportEventName,
          }
        ) <= 0
      ) {
        return { applied: false, reason: "conflict", current };
      }
      current = {
        ...current,
        lastTransportEventAt: input.transportEventAt,
        lastTransportEventId: input.transportEventId,
        lastTransportEventName: input.transportEventName,
      };
      return { applied: true, current };
    },
    recordRuntimeReady: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion
      ) {
        return { applied: false, reason: "conflict", current };
      }
      current = {
        ...current,
        runtimeReadyAt: current.runtimeReadyAt ?? input.runtimeReadyAt,
      };
      return { applied: true, current };
    },
    markRoomCleanupComplete: async () => undefined,
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
    claimTimeout: async () => ({ applied: false, reason: "conflict", current }),
    refineTimeoutClaim: async () => ({
      applied: false,
      reason: "conflict",
      current,
    }),
  };
  return {
    deps: {
      store,
      scheduleReconnect: async (input) => {
        schedules.push(input);
      },
    },
    schedules,
    get writes() {
      return writes;
    },
  };
}

function apply(
  current: InterviewReconnectSession,
  input: ApplyInterviewTransportTransitionInput
): InterviewReconnectSession {
  return {
    ...current,
    state: input.nextState,
    version: current.version + 1,
    activatedAt:
      input.nextState === "active"
        ? (current.activatedAt ?? input.transitionedAt)
        : current.activatedAt,
    lastTransitionAt: input.transitionedAt,
    reconnectDeadlineAt: input.reconnectDeadlineAt,
    reconnectDeadlineOwner: input.reconnectDeadlineOwner,
    runtimeReadyAt: input.runtimeReadyAt ?? current.runtimeReadyAt,
    lastTransportEventAt: input.recordTransportEvent
      ? input.transportEventAt
      : current.lastTransportEventAt,
    lastTransportEventId: input.recordTransportEvent
      ? input.transportEventId
      : current.lastTransportEventId,
    lastTransportEventName: input.recordTransportEvent
      ? input.transportEventName
      : current.lastTransportEventName,
  };
}
