import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApplyInterviewTransportTransitionInput,
  InterviewReconnectSession,
  InterviewReconnectStore,
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

test("hard deadline keeps ownership when it is earlier than reconnect grace", async () => {
  const fixture = createFixture(
    createSession({ startedAt: new Date("2026-07-10T07:30:00.000Z") })
  );
  const lost = await handleLiveKitInterviewEventWorkflow(
    event("participant_connection_aborted", USER_ID, "event-lost", NOW),
    fixture.deps
  );

  assert.equal(lost.lifecycle?.state, "reconnecting");
  assert.equal(lost.lifecycle?.reconnectDeadlineAt, null);
  assert.equal(fixture.schedules.length, 0);
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
    lastTransportEventAt: null,
    lastTransportEventId: null,
    lastTransportEventName: "participant_joined",
    ...overrides,
  };
}

function createFixture(initial: InterviewReconnectSession): {
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
    getByRoom: async () => current,
    getById: async () => current,
    applyTransportTransition: async (input) => {
      if (
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion ||
        (input.recordTransportEvent &&
          current.lastTransportEventAt &&
          current.lastTransportEventAt.getTime() >
            input.transportEventAt.getTime())
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
        (current.lastTransportEventAt &&
          current.lastTransportEventAt.getTime() >
            input.transportEventAt.getTime())
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
    claimTimeout: async () => ({ applied: false, reason: "conflict", current }),
  };
  return {
    deps: {
      store,
      scheduleReconnect: async (input) => {
        schedules.push(input);
      },
      now: () => NOW,
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
