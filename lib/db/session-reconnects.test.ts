import assert from "node:assert/strict";
import test from "node:test";

import { createDrizzleInterviewReconnectStore } from "./session-reconnects";

test("a reconnect timeout claim persists the durable room cleanup marker", async () => {
  let claimedCleanupPending: unknown;
  const database = {
    update() {
      const builder = {
        set(values: Record<string, unknown>) {
          claimedCleanupPending = values.roomCleanupPending;
          return builder;
        },
        where() {
          return builder;
        },
        async returning() {
          return [reconnectRow(claimedCleanupPending === true)];
        },
      };
      return builder;
    },
  } as never;
  const store = createDrizzleInterviewReconnectStore(database);

  const result = await store.claimTimeout({
    sessionId: "session-1",
    expectedVersion: 4,
    deadlineAt: new Date("2026-07-10T08:00:30.000Z"),
    terminalReason: "disconnect_timeout",
    transitionedAt: new Date("2026-07-10T08:00:30.000Z"),
  });

  assert.equal(result.applied, true);
  assert.equal(claimedCleanupPending, true);
  if (result.applied) assert.equal(result.current.roomCleanupPending, true);
});

function reconnectRow(roomCleanupPending: boolean) {
  return {
    id: "session-1",
    userId: "user-1",
    livekitRoomName: "interview-room-1",
    lifecycleState: "ending",
    lifecycleVersion: 5,
    terminalReason: "disconnect_timeout",
    config: { duration: 30 },
    startedAt: new Date("2026-07-10T07:30:00.000Z"),
    activatedAt: new Date("2026-07-10T07:30:02.000Z"),
    runtimeReadyAt: new Date("2026-07-10T07:30:01.000Z"),
    lastTransitionAt: new Date("2026-07-10T08:00:30.000Z"),
    reconnectDeadlineAt: new Date("2026-07-10T08:00:30.000Z"),
    roomCleanupPending,
    roomCleanupAttemptedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T08:00:00.000Z"),
    lastTransportEventId: "lost-1",
    lastTransportEventName: "participant_left",
  };
}
