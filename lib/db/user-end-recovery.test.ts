import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { FEEDBACK_GENERATION_LEASE_MS } from "./feedback-generation-state";
import {
  buildUserEndRecoveryItems,
  listUserInterviewEndsToRecover,
} from "./user-end-recovery";

const NOW = new Date("2026-08-09T20:00:00.000Z");

test("ending sessions replay settlement while terminal outbox recovery starts at feedback", () => {
  assert.deepEqual(
    buildUserEndRecoveryItems([
      {
        sessionId: "ending-session",
        userId: "user-1",
        lifecycleVersion: 3,
        lifecycleState: "ending",
      },
      {
        sessionId: "terminal-undispatched",
        userId: "user-2",
        lifecycleVersion: 4,
        lifecycleState: "completed",
      },
    ]),
    [
      {
        sessionId: "ending-session",
        userId: "user-1",
        lifecycleVersion: 3,
        resumeFrom: "runtime_settlement",
      },
      {
        sessionId: "terminal-undispatched",
        userId: "user-2",
        lifecycleVersion: 4,
        resumeFrom: "feedback_dispatch",
      },
    ]
  );
});

test("scheduled recovery selects only null or expired processing leases with a durable event", async () => {
  let predicate: SQL | null = null;
  const database = {
    select() {
      const builder = {
        from() {
          return builder;
        },
        leftJoin() {
          return builder;
        },
        where(input: SQL) {
          predicate = input;
          return builder;
        },
        orderBy() {
          return builder;
        },
        async limit() {
          return [];
        },
      };
      return builder;
    },
  } as never;

  await listUserInterviewEndsToRecover(25, database, NOW);

  const query = new PgDialect().sqlToQuery(predicate!);
  const staleGenerationBefore = new Date(
    NOW.getTime() - FEEDBACK_GENERATION_LEASE_MS
  );
  assert.match(query.sql, /"feedback"\."status" = \$\d+/);
  assert.match(query.sql, /"feedback"\."processing_started_at" is null/);
  assert.match(query.sql, /"feedback"\."processing_started_at" <= \$\d+/);
  assert.match(query.sql, /"feedback"\."dispatch_event_id" is not null/);
  assert.match(query.sql, /"feedback"\."dispatch_status" <> 'not_required'/);
  assert.ok(query.params.includes("processing"));
  assert.ok(query.params.includes(staleGenerationBefore.toISOString()));
});
