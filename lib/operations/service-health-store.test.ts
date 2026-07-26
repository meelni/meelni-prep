import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import {
  assessServiceHealth,
  createCachedServiceHealthReader,
  createDefaultServiceHealthDependencies,
  type ServiceHealthEvidence,
} from "./service-health";
import {
  createDrizzleServiceHealthEvidenceReader,
  createServiceHealthStore,
  type ServiceHealthEvidenceReader,
} from "./service-health-store";

const NOW = new Date("2026-07-10T20:00:00.000Z");
const CLEAR_EVIDENCE: ServiceHealthEvidence = {
  questionBankReady: true,
  feedbackDispatchStale: false,
  feedbackDispatchFailed: false,
  stripeWebhookStale: false,
  stripeWebhookFailed: false,
};

test("database reader applies a local statement timeout and disjoint evidence queries", async () => {
  const queries: SQL[] = [];
  const database = {
    transaction: async (
      operation: (transaction: unknown) => Promise<unknown>
    ) =>
      operation({
        execute: async (query: SQL) => {
          queries.push(query);
          return queries.length === 1 ? [] : [CLEAR_EVIDENCE];
        },
      }),
  } as never;

  const evidence = await createDrizzleServiceHealthEvidenceReader(
    database
  ).read({
    staleBefore: new Date("2026-07-10T19:50:00.000Z"),
    queryTimeoutMs: 1_900,
  });
  const dialect = new PgDialect();
  const timeoutQuery = dialect.sqlToQuery(queries[0]);
  const evidenceQuery = dialect.sqlToQuery(queries[1]);

  assert.deepEqual(timeoutQuery.params, ["1900ms"]);
  assert.match(
    timeoutQuery.sql,
    /set_config\('statement_timeout', \$1, true\)/
  );
  assert.match(evidenceQuery.sql, /"stripe_event_log"\."status" = 'pending'/);
  assert.match(evidenceQuery.sql, /"interview_question"\."is_active" = true/);
  assert.equal(
    evidenceQuery.params.includes("Product Sense"),
    true,
    "question readiness should cover canonical round aliases"
  );
  assert.doesNotMatch(evidenceQuery.sql, /'pending', 'failed'/);
  assert.deepEqual(evidence, CLEAR_EVIDENCE);
});

test("timed-out assessments never duplicate unresolved database work", async () => {
  let calls = 0;
  let clock = 0;
  let resolveEvidence: ((value: ServiceHealthEvidence) => void) | undefined;
  const pendingEvidence = new Promise<ServiceHealthEvidence>((resolve) => {
    resolveEvidence = resolve;
  });
  const captured: Array<{ staleBefore: Date; queryTimeoutMs: number }> = [];
  const reader: ServiceHealthEvidenceReader = {
    read: async (input) => {
      calls += 1;
      captured.push(input);
      return pendingEvidence;
    },
  };
  const store = createServiceHealthStore(reader);
  const readHealth = createCachedServiceHealthReader({
    assess: () =>
      assessServiceHealth(
        createDefaultServiceHealthDependencies({
          env: {},
          now: () => NOW,
          store,
          timeoutMs: 5,
        })
      ),
    now: () => clock,
    ttlMs: 10,
  });

  const firstReports = await Promise.all([
    readHealth(),
    readHealth(),
    readHealth(),
  ]);
  assert.equal(calls, 1);
  assert.equal(firstReports[0].checks[1].code, "database_unavailable");
  assert.equal(captured[0].queryTimeoutMs, 1);

  clock = 11;
  const afterCacheExpiry = await readHealth();
  assert.equal(afterCacheExpiry.checks[1].code, "database_unavailable");
  assert.equal(calls, 1);

  resolveEvidence?.(CLEAR_EVIDENCE);
  await pendingEvidence;
  await new Promise((resolve) => setImmediate(resolve));

  clock = 22;
  const recovered = await readHealth();
  assert.equal(calls, 2);
  assert.equal(recovered.checks[1].code, "database_ready");
});
