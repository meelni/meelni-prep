import assert from "node:assert/strict";
import test from "node:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  createDrizzleInterviewSessionLifecycleStore,
  type SessionLifecycleDatabase,
} from "./session-lifecycle";

const TRANSITIONED_AT = new Date("2026-07-09T22:00:00.000Z");

test("compareAndSet guards the write with session, state, and version", async () => {
  const updated = lifecycleRow({
    lifecycleState: "ending",
    lifecycleVersion: 4,
    terminalReason: "user_end",
    endingAt: TRANSITIONED_AT,
  });
  const fake = createFakeDatabase({ updateRows: [updated] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  const result = await store.compareAndSet({
    sessionId: updated.id,
    expectedState: "active",
    expectedVersion: 3,
    nextState: "ending",
    terminalReason: "user_end",
    transitionedAt: TRANSITIONED_AT,
  });

  assert.equal(result.applied, true);
  assert.equal(result.current.state, "ending");
  assert.equal(result.current.version, 4);
  assert.equal(fake.capturedSet.lifecycleState, "ending");
  assert.equal(fake.capturedSet.terminalReason, "user_end");
  assert.equal(fake.capturedSet.status, "in_progress");
  assert.equal(fake.capturedSet.lastTransitionAt, TRANSITIONED_AT);
  assert.ok(fake.capturedSet.endingAt);
  assert.ok(fake.capturedSet.roomCleanupPending);
  assert.equal(fake.capturedSet.roomCleanupAttemptedAt, null);

  const query = new PgDialect().sqlToQuery(requirePredicate(fake));
  assert.match(query.sql, /"interview_session"\."id" = \$1/);
  assert.match(query.sql, /"interview_session"\."lifecycle_state" = \$2/);
  assert.match(query.sql, /"interview_session"\."lifecycle_version" = \$3/);
  assert.deepEqual(query.params, [updated.id, "active", 3]);
});

test("terminal compareAndSet projects compatibility status and end timestamp", async () => {
  const updated = lifecycleRow({
    lifecycleState: "abandoned",
    lifecycleVersion: 6,
    terminalReason: "insufficient_signal",
    status: "too_short",
    endedAt: TRANSITIONED_AT,
  });
  const fake = createFakeDatabase({ updateRows: [updated] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  const result = await store.compareAndSet({
    sessionId: updated.id,
    expectedState: "ending",
    expectedVersion: 5,
    nextState: "abandoned",
    terminalReason: "insufficient_signal",
    transitionedAt: TRANSITIONED_AT,
  });

  assert.equal(result.applied, true);
  assert.equal(result.current.legacyStatus, "too_short");
  assert.equal(fake.capturedSet.status, "too_short");
  assert.ok(fake.capturedSet.endedAt);
  assert.ok(fake.capturedSet.endingAt);
  assert.equal("activatedAt" in fake.capturedSet, false);
});

test("an atomic provider-start failure records both ending and terminal timestamps", async () => {
  const updated = lifecycleRow({
    lifecycleState: "failed",
    lifecycleVersion: 3,
    terminalReason: "provider_failure",
    status: "error",
    endingAt: TRANSITIONED_AT,
    endedAt: TRANSITIONED_AT,
  });
  const fake = createFakeDatabase({ updateRows: [updated] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  const result = await store.compareAndSet({
    sessionId: updated.id,
    expectedState: "connecting",
    expectedVersion: 2,
    nextState: "failed",
    terminalReason: "provider_failure",
    transitionedAt: TRANSITIONED_AT,
  });

  assert.equal(result.applied, true);
  assert.ok(fake.capturedSet.endingAt);
  assert.ok(fake.capturedSet.endedAt);
  assert.ok(fake.capturedSet.roomCleanupPending);
  assert.equal(fake.capturedSet.roomCleanupAttemptedAt, null);
});

test("a lost compareAndSet returns the stored winner", async () => {
  const winner = lifecycleRow({
    lifecycleState: "failed",
    lifecycleVersion: 8,
    terminalReason: "provider_failure",
    status: "error",
    endedAt: TRANSITIONED_AT,
  });
  const fake = createFakeDatabase({ updateRows: [], selectRows: [winner] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  const result = await store.compareAndSet({
    sessionId: winner.id,
    expectedState: "ending",
    expectedVersion: 7,
    nextState: "completed",
    terminalReason: "user_end",
  });

  assert.deepEqual(result, {
    applied: false,
    reason: "conflict",
    current: {
      sessionId: winner.id,
      state: "failed",
      version: 8,
      terminalReason: "provider_failure",
      legacyStatus: "error",
      activatedAt: null,
      endingAt: null,
      lastTransitionAt: TRANSITIONED_AT,
      endedAt: TRANSITIONED_AT,
    },
  });
});

test("a compareAndSet for a missing session reports not_found", async () => {
  const fake = createFakeDatabase({ updateRows: [], selectRows: [] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  const result = await store.compareAndSet({
    sessionId: "33333333-3333-4333-8333-333333333333",
    expectedState: "created",
    expectedVersion: 1,
    nextState: "connecting",
  });

  assert.deepEqual(result, {
    applied: false,
    reason: "not_found",
    current: null,
  });
});

test("connecting writes the provisioning lease from PostgreSQL time", async () => {
  const updated = lifecycleRow({
    lifecycleState: "connecting",
    lifecycleVersion: 2,
  });
  const fake = createFakeDatabase({ updateRows: [updated] });
  const store = createDrizzleInterviewSessionLifecycleStore(fake.database);

  await store.compareAndSet({
    sessionId: updated.id,
    expectedState: "created",
    expectedVersion: 1,
    nextState: "connecting",
    transitionedAt: new Date("1999-01-01T00:00:00.000Z"),
  });

  const leaseSql = new PgDialect().sqlToQuery(
    fake.capturedSet.roomProvisioningStartedAt as SQL
  );
  assert.match(
    leaseSql.sql,
    /date_trunc\('milliseconds', clock_timestamp\(\)\)/
  );
  assert.doesNotMatch(leaseSql.sql, /1999-01-01/);
});

function createFakeDatabase({
  updateRows,
  selectRows = [],
}: {
  updateRows: unknown[];
  selectRows?: unknown[];
}) {
  const capture: {
    set: Record<string, unknown>;
    predicate: SQL | null;
  } = { set: {}, predicate: null };

  const database = {
    update() {
      return {
        set(values: Record<string, unknown>) {
          capture.set = values;
          return {
            where(predicate: SQL) {
              capture.predicate = predicate;
              return {
                async returning() {
                  return updateRows;
                },
              };
            },
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return selectRows;
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    database: database as unknown as SessionLifecycleDatabase,
    get capturedSet() {
      return capture.set;
    },
    get capturedPredicate() {
      return capture.predicate;
    },
  };
}

function requirePredicate(fake: { capturedPredicate: SQL | null }): SQL {
  assert.ok(fake.capturedPredicate);
  return fake.capturedPredicate;
}

interface TestLifecycleRow {
  id: string;
  lifecycleState: string;
  lifecycleVersion: number;
  terminalReason: string | null;
  status: string;
  activatedAt: Date | null;
  endingAt: Date | null;
  lastTransitionAt: Date;
  endedAt: Date | null;
  [key: string]: unknown;
}

function lifecycleRow(
  overrides: Partial<TestLifecycleRow> = {}
): TestLifecycleRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    lifecycleState: "active",
    lifecycleVersion: 1,
    terminalReason: null,
    status: "in_progress",
    activatedAt: null,
    endingAt: null,
    lastTransitionAt: TRANSITIONED_AT,
    endedAt: null,
    ...overrides,
  };
}
