import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptUserInterviewEndWorkflow,
  buildUserInterviewEndEvent,
  type AcceptUserInterviewEndDeps,
} from "./accept-user-interview-end";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";

test("durable acceptance schedules stable, idempotent finalization work", async () => {
  let event: unknown;
  const result = await acceptUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID },
    deps({
      schedule: async (scheduled) => {
        event = scheduled;
      },
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.delivery, "scheduled");
  assert.deepEqual(
    event,
    buildUserInterviewEndEvent({
      sessionId: SESSION_ID,
      userId: USER_ID,
      lifecycleVersion: 3,
    })
  );
});

test("recovery deliveries bypass an exhausted provider event identity", () => {
  const initial = buildUserInterviewEndEvent({
    sessionId: SESSION_ID,
    userId: USER_ID,
    lifecycleVersion: 3,
  });
  const recovery = buildUserInterviewEndEvent(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      lifecycleVersion: 3,
    },
    "recovery:cron-2"
  );

  assert.notEqual(initial.id, recovery.id);
  assert.deepEqual(initial.data, recovery.data);
});

test("terminal outbox recovery carries an explicit feedback resume boundary", () => {
  const event = buildUserInterviewEndEvent(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      lifecycleVersion: 4,
      resumeFrom: "feedback_dispatch",
    },
    "recovery:terminal-outbox"
  );

  assert.equal(event.data.resumeFrom, "feedback_dispatch");
});

test("a lost event delivery cannot undo accepted ending truth", async () => {
  const result = await acceptUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID },
    deps({ schedule: async () => new Promise(() => {}), dispatchTimeoutMs: 5 })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.disposition, "accepted");
    assert.equal(result.delivery, "deferred");
    assert.equal(result.session.lifecycleState, "ending");
  }
});

test("terminal replay does not enqueue duplicate finalization", async () => {
  let schedules = 0;
  const result = await acceptUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID },
    deps({
      accept: async () => ({
        ok: true,
        disposition: "already_terminal",
        session: {
          ...session(),
          lifecycleState: "completed",
          terminalReason: "user_end",
          endedAt: new Date("2026-08-05T20:00:04.000Z"),
        },
      }),
      schedule: async () => {
        schedules += 1;
      },
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.delivery, "not_required");
  assert.equal(schedules, 0);
});

function deps(
  overrides: Partial<AcceptUserInterviewEndDeps> = {}
): AcceptUserInterviewEndDeps {
  return {
    accept: async () => ({
      ok: true,
      disposition: "accepted",
      session: session(),
    }),
    schedule: async () => undefined,
    ...overrides,
  };
}

function session() {
  return {
    sessionId: SESSION_ID,
    userId: USER_ID,
    lifecycleState: "ending" as const,
    lifecycleVersion: 3,
    terminalReason: "user_end" as const,
    endingAt: new Date("2026-08-05T20:00:00.000Z"),
    endedAt: null,
  };
}
