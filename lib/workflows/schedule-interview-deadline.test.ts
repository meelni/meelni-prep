import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewDeadlineEvent,
  buildInvalidInterviewSessionRecoveryEvent,
  scheduleInterviewDeadline,
} from "./schedule-interview-deadline";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const DEADLINE = new Date("2026-07-10T07:00:00.000Z");

test("deadline event uses stable identity and a future event timestamp", () => {
  assert.deepEqual(
    buildInterviewDeadlineEvent({
      sessionId: SESSION_ID,
      deadlineAt: DEADLINE,
    }),
    {
      id: `interview-deadline:${SESSION_ID}:${DEADLINE.toISOString()}`,
      name: "interview/deadline.reached",
      ts: DEADLINE.getTime(),
      data: {
        sessionId: SESSION_ID,
        deadlineAt: DEADLINE.toISOString(),
      },
    }
  );
});

test("scheduling waits for provider acknowledgement before resolving", async () => {
  let acknowledged = false;
  const scheduled = await scheduleInterviewDeadline(
    { sessionId: SESSION_ID, deadlineAt: DEADLINE },
    {
      send: async () => {
        await Promise.resolve();
        acknowledged = true;
      },
    }
  );

  assert.equal(acknowledged, true);
  assert.equal(
    scheduled.id,
    `interview-deadline:${SESSION_ID}:${DEADLINE.toISOString()}`
  );
});

test("recovery deliveries use a distinct identity from the original event", () => {
  const recovered = buildInterviewDeadlineEvent({
    sessionId: SESSION_ID,
    deadlineAt: DEADLINE,
    deliveryId: "recovery:cron-run-2",
  });

  assert.equal(
    recovered.id,
    `interview-deadline:${SESSION_ID}:${DEADLINE.toISOString()}:recovery:cron-run-2`
  );
  assert.equal(
    "deadlineAt" in recovered.data ? recovered.data.deadlineAt : null,
    DEADLINE.toISOString()
  );
});

test("invalid open-session recovery uses an immediate quarantine event", () => {
  const occurredAt = new Date("2026-07-10T07:05:00.000Z");
  assert.deepEqual(
    buildInvalidInterviewSessionRecoveryEvent({
      sessionId: SESSION_ID,
      deliveryId: "recovery:cron-run-3",
      occurredAt,
    }),
    {
      id: `interview-deadline-quarantine:${SESSION_ID}:recovery:cron-run-3`,
      name: "interview/deadline.reached",
      ts: occurredAt.getTime(),
      data: {
        sessionId: SESSION_ID,
        recoveryReason: "missing_started_at",
      },
    }
  );
});

test("scheduling fails closed when the provider rejects the event", async () => {
  await assert.rejects(
    () =>
      scheduleInterviewDeadline(
        { sessionId: SESSION_ID, deadlineAt: DEADLINE },
        {
          send: async () => {
            throw new Error("event provider unavailable");
          },
        }
      ),
    /event provider unavailable/
  );
});
