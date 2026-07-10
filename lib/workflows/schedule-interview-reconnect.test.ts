import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewReconnectEvent,
  scheduleInterviewReconnect,
} from "./schedule-interview-reconnect";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const DEADLINE = new Date("2026-07-10T08:00:30.000Z");

test("reconnect event identity fences lifecycle generation and deadline", () => {
  assert.deepEqual(
    buildInterviewReconnectEvent({
      sessionId: SESSION_ID,
      expectedVersion: 4,
      deadlineAt: DEADLINE,
    }),
    {
      id: `interview-reconnect:${SESSION_ID}:4:${DEADLINE.toISOString()}`,
      name: "interview/reconnect.expired",
      data: {
        sessionId: SESSION_ID,
        expectedVersion: 4,
        deadlineAt: DEADLINE.toISOString(),
      },
    }
  );
});

test("reconnect scheduling waits for provider acknowledgement", async () => {
  let acknowledged = false;
  await scheduleInterviewReconnect(
    { sessionId: SESSION_ID, expectedVersion: 4, deadlineAt: DEADLINE },
    {
      send: async () => {
        acknowledged = true;
      },
    }
  );
  assert.equal(acknowledged, true);
});
