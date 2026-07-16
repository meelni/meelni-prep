import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { createDrizzleInterviewReconnectStore } from "./session-reconnects";

test("a reconnect timeout claim persists the durable room cleanup marker", async () => {
  let claimedCleanupPending: unknown;
  let capturedPredicate: SQL | null = null;
  const database = {
    update() {
      const builder = {
        set(values: Record<string, unknown>) {
          claimedCleanupPending = values.roomCleanupPending;
          return builder;
        },
        where(predicate: SQL) {
          capturedPredicate = predicate;
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
  const query = new PgDialect().sqlToQuery(capturedPredicate!);
  assert.match(query.sql, /reconnect_deadline_owner/);
  assert.match(query.sql, /clock_timestamp\(\)/);
});

test("presence recovery uses disjoint pre-cutoff and grace-due database fences", async () => {
  const predicates: SQL[] = [];
  const database = {
    update() {
      const builder = {
        set() {
          return builder;
        },
        where(predicate: SQL) {
          predicates.push(predicate);
          return builder;
        },
        async returning() {
          return [reconnectRow(false)];
        },
      };
      return builder;
    },
  } as never;
  const store = createDrizzleInterviewReconnectStore(database);
  const input = {
    sessionId: "session-1",
    expectedVersion: 4,
    deadlineAt: new Date("2026-07-10T08:00:30.000Z"),
    joinedAt: new Date("2026-07-10T08:00:29.999Z"),
    transitionedAt: new Date("2026-07-10T08:00:30.000Z"),
  };

  assert.equal((await store.recoverFromPresence(input)).applied, true);
  assert.equal((await store.recoverFromDuePresence(input)).applied, true);

  const dialect = new PgDialect();
  const beforeCutoff = dialect.sqlToQuery(predicates[0]!);
  const graceDue = dialect.sqlToQuery(predicates[1]!);
  assert.match(beforeCutoff.sql, /clock_timestamp\(\)/);
  assert.doesNotMatch(beforeCutoff.sql, /reconnect_deadline_owner/);
  assert.match(graceDue.sql, /clock_timestamp\(\)/);
  assert.match(graceDue.sql, /reconnect_deadline_owner/);
  assert.notEqual(beforeCutoff.sql, graceDue.sql);
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
    reconnectDeadlineOwner: "reconnect_grace",
    roomCleanupPending,
    roomCleanupAttemptedAt: null,
    roomProvisioningPending: false,
    roomProvisioningStartedAt: null,
    presenceReconciledAt: null,
    lastTransportEventAt: new Date("2026-07-10T08:00:00.000Z"),
    lastTransportEventId: "lost-1",
    lastTransportEventName: "participant_left",
  };
}
