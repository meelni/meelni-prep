import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { buildStripeDeletionSubjects } from "../lib/billing/stripe-privacy";

import {
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
  SESSION_LIFECYCLE_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "lib/db/migrations");
const CLEAN_DATABASE = "meelni_clean_test";
const UPGRADE_DATABASE = "meelni_upgrade_test";
const USER_ONE = "11111111-1111-4111-8111-111111111111";
const USER_TWO = "22222222-2222-4222-8222-222222222222";
const SESSION_ONE = "33333333-3333-4333-8333-333333333333";
const SESSION_ENDED_IN_PROGRESS = "44444444-4444-4444-8444-444444444444";
const SESSION_COMPLETED = "55555555-5555-4555-8555-555555555555";
const SESSION_ABANDONED = "66666666-6666-4666-8666-666666666666";
const SESSION_TOO_SHORT = "77777777-7777-4777-8777-777777777777";
const SESSION_ERROR = "88888888-8888-4888-8888-888888888888";
const SESSION_CONCURRENT = "99999999-9999-4999-8999-999999999999";

const configuredBaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
if (!configuredBaseUrl) {
  throw new Error("MIGRATION_TEST_DATABASE_URL is required");
}
const baseUrl: string = configuredBaseUrl;

const parsedUrl = new URL(baseUrl);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname) ||
  !parsedUrl.pathname.endsWith("_test")
) {
  throw new Error(
    "Migration tests refuse non-local databases and require a *_test database"
  );
}

void run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function run() {
  const cleanUrl = databaseUrl(baseUrl, CLEAN_DATABASE);
  const upgradeUrl = databaseUrl(baseUrl, UPGRADE_DATABASE);
  const admin = postgres(baseUrl, { max: 1, prepare: false });
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${CLEAN_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(`CREATE DATABASE "${CLEAN_DATABASE}"`);
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${UPGRADE_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(`CREATE DATABASE "${UPGRADE_DATABASE}"`);
  const clean = postgres(cleanUrl, { max: 20, prepare: false });

  try {
    await installSupabaseTestSurface(clean);
    const cleanInitialFolder = await createInitialMigrationFolder();
    try {
      await migrate(drizzle(clean), { migrationsFolder: cleanInitialFolder });
    } finally {
      await rm(cleanInitialFolder, { recursive: true, force: true });
    }
    assert.equal(
      databaseSchemaFingerprint(await getDatabasePreMigrationContract(clean)),
      CLEAN_0001_SCHEMA_FINGERPRINT
    );
    runPreflight(cleanUrl, true, "ready_to_reconcile");
    runCliMigration(cleanUrl);
    runPreflight(cleanUrl, true, "reconciled");
    await seedAuthorizationFixtures(clean);
    await verifyDatabase(clean);
    await verifyCleanLifecycleDefaults(clean);
    await verifyLifecycleConcurrency(clean);
    await verifyAuthorization(clean);
    await verifyDeletionTombstone(clean);
    await verifySharedLimiter(clean);

    const cleanContract = await getDatabaseSchemaContract(clean);
    const cleanFingerprint = databaseSchemaFingerprint(cleanContract);
    console.log(`Schema contract fingerprint: ${cleanFingerprint}`);
    assert.equal(cleanFingerprint, SESSION_LIFECYCLE_SCHEMA_FINGERPRINT);
    const migrationCountBefore = await migrationCount(clean);
    await migrate(drizzle(clean), { migrationsFolder: MIGRATIONS });
    assert.equal(await migrationCount(clean), migrationCountBefore);
    assert.equal(
      databaseSchemaFingerprint(await getDatabaseSchemaContract(clean)),
      cleanFingerprint
    );

    const upgrade = postgres(upgradeUrl, { max: 20, prepare: false });
    try {
      await installSupabaseTestSurface(upgrade);
      const initialFolder = await createInitialMigrationFolder();
      try {
        await migrate(drizzle(upgrade), { migrationsFolder: initialFolder });
      } finally {
        await rm(initialFolder, { recursive: true, force: true });
      }

      await upgrade.unsafe(
        await readFile(
          join(ROOT, "packages/test-fixtures/database/legacy-pre-relaunch.sql"),
          "utf8"
        )
      );
      assert.equal(
        databaseSchemaFingerprint(
          await getDatabasePreMigrationContract(upgrade)
        ),
        LEGACY_RELAUNCH_SCHEMA_FINGERPRINT
      );
      runPreflight(upgradeUrl, true, "ready_to_reconcile");
      await upgrade.unsafe(
        "ALTER TABLE practice_set ADD COLUMN unexpected_preflight_drift text"
      );
      runPreflight(upgradeUrl, false);
      await upgrade.unsafe(
        "ALTER TABLE practice_set DROP COLUMN unexpected_preflight_drift"
      );
      runPreflight(upgradeUrl, true, "ready_to_reconcile");
      const relaunchFolder = await createMigrationFolderThrough(5);
      try {
        await migrate(drizzle(upgrade), { migrationsFolder: relaunchFolder });
      } finally {
        await rm(relaunchFolder, { recursive: true, force: true });
      }
      runPreflight(upgradeUrl, true, "ready_for_session_lifecycle");
      await seedAuthorizationFixtures(upgrade);
      await seedLifecycleBackfillFixtures(upgrade);
      const lifecyclePreview = runPreflight(
        upgradeUrl,
        true,
        "ready_for_session_lifecycle"
      );
      const countsBefore = await protectedRowCounts(upgrade);
      await migrate(drizzle(upgrade), { migrationsFolder: MIGRATIONS });
      const lifecycleApplied = runPreflight(upgradeUrl, true, "reconciled");
      assertLifecycleBackfillCountsMatch(lifecyclePreview!, lifecycleApplied!);
      assert.deepEqual(await protectedRowCounts(upgrade), countsBefore);
      await verifyDatabase(upgrade);
      await verifyLifecycleBackfill(upgrade);
      await verifyAuthorization(upgrade);
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        cleanFingerprint
      );
    } finally {
      await upgrade.end();
    }

    console.log("Database migration verification passed.");
  } finally {
    await clean.end();
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${CLEAN_DATABASE}" WITH (FORCE)`
    );
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${UPGRADE_DATABASE}" WITH (FORCE)`
    );
    await admin.end();
  }
}

function runCliMigration(databaseUrl: string) {
  const result = spawnSync("npm", ["run", "db:migrate"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(
    result.status,
    0,
    `CLI migration failed: ${result.stderr || result.stdout}`
  );
  assert.match(result.stdout, /Database target fingerprint:/);
}

function runPreflight(
  databaseUrl: string,
  expectedSuccess: boolean,
  expectedStatus = "ready_to_reconcile"
): MigrationPreflightResult | null {
  const result = spawnSync("npm", ["run", "db:preflight"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (expectedSuccess) {
    assert.equal(
      result.status,
      0,
      `Database preflight failed: ${result.stderr || result.stdout}`
    );
    assert.match(result.stdout, new RegExp(`"status": "${expectedStatus}"`));
    if (expectedStatus === "ready_for_session_lifecycle") {
      assert.match(result.stdout, /"phase": "preview"/);
    }
    if (expectedStatus === "reconciled") {
      assert.match(result.stdout, /"phase": "applied"/);
    }
    return parsePreflightResult(result.stdout);
  } else {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /accepted pre-migration schema contract/);
    return null;
  }
}

interface MigrationPreflightCount {
  lifecycle_state: string;
  terminal_reason: string;
  rows: number;
}

interface MigrationPreflightResult {
  lifecycleBackfill: {
    phase: "not_ready" | "preview" | "applied";
    counts: MigrationPreflightCount[];
  };
}

function parsePreflightResult(output: string): MigrationPreflightResult {
  const lines = output.split(/\r?\n/);
  const end = lines.findLastIndex((line) => line.trim() === "}");
  for (let start = end - 1; start >= 0; start -= 1) {
    if (lines[start]?.trim() !== "{") continue;
    try {
      const parsed = JSON.parse(
        lines.slice(start, end + 1).join("\n")
      ) as Partial<MigrationPreflightResult>;
      if (parsed.lifecycleBackfill) {
        return parsed as MigrationPreflightResult;
      }
    } catch {
      // npm and dotenv may print brace-containing diagnostics before the final
      // preflight JSON. Keep scanning backward for the outer JSON object.
    }
  }

  throw new Error("Preflight output did not contain parseable result JSON");
}

function assertLifecycleBackfillCountsMatch(
  preview: MigrationPreflightResult,
  applied: MigrationPreflightResult
) {
  assert.equal(preview.lifecycleBackfill.phase, "preview");
  assert.equal(applied.lifecycleBackfill.phase, "applied");

  const aggregate = (counts: MigrationPreflightCount[]) => {
    const totals = new Map<string, number>();
    for (const count of counts) {
      const key = `${count.lifecycle_state}:${count.terminal_reason}`;
      totals.set(key, (totals.get(key) ?? 0) + Number(count.rows));
    }
    return [...totals.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    );
  };

  assert.deepEqual(
    aggregate(applied.lifecycleBackfill.counts),
    aggregate(preview.lifecycleBackfill.counts)
  );
}

async function installSupabaseTestSurface(sql: postgres.Sql) {
  await sql.unsafe(`
    DO $$
    BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE
      AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE
      AS 'SELECT current_user::text';
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
  `);
}

async function createInitialMigrationFolder(): Promise<string> {
  return createMigrationFolderThrough(1);
}

async function createMigrationFolderThrough(maxIndex: number): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "meelni-initial-migrations-"));
  const meta = join(folder, "meta");
  await mkdir(meta, { recursive: true });

  const journal = JSON.parse(
    await readFile(join(MIGRATIONS, "meta/_journal.json"), "utf8")
  ) as { entries: Array<{ idx: number; tag: string }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= maxIndex);
  await Promise.all(
    journal.entries.map((entry) =>
      copyFile(
        join(MIGRATIONS, `${entry.tag}.sql`),
        join(folder, `${entry.tag}.sql`)
      )
    )
  );
  await writeFile(join(meta, "_journal.json"), JSON.stringify(journal));
  return folder;
}

async function seedAuthorizationFixtures(sql: postgres.Sql) {
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${USER_ONE}::uuid, 'migration-user@example.invalid')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO subscription (user_id, tier, status)
    VALUES (${USER_ONE}::uuid, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode, status)
    VALUES (
      ${SESSION_ONE}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress'
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function seedLifecycleBackfillFixtures(sql: postgres.Sql) {
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, started_at, ended_at
    ) VALUES
      (
        ${SESSION_ENDED_IN_PROGRESS}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        '2026-07-09T20:00:00.000Z'::timestamptz,
        '2026-07-09T20:20:00.000Z'::timestamptz
      ),
      (
        ${SESSION_COMPLETED}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'completed',
        '2026-07-09T20:00:00.000Z'::timestamptz,
        '2026-07-09T20:20:00.000Z'::timestamptz
      ),
      (
        ${SESSION_ABANDONED}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'abandoned',
        '2026-07-09T20:00:00.000Z'::timestamptz,
        '2026-07-09T20:02:00.000Z'::timestamptz
      ),
      (
        ${SESSION_TOO_SHORT}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'too_short',
        '2026-07-09T20:00:00.000Z'::timestamptz,
        '2026-07-09T20:02:00.000Z'::timestamptz
      ),
      (
        ${SESSION_ERROR}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'error',
        '2026-07-09T20:00:00.000Z'::timestamptz,
        NULL
      )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function verifyCleanLifecycleDefaults(sql: postgres.Sql) {
  const rows = await sql<
    {
      lifecycle_state: string;
      lifecycle_version: number;
      terminal_reason: string | null;
      activated_at: Date | null;
      ending_at: Date | null;
    }[]
  >`
    SELECT lifecycle_state, lifecycle_version, terminal_reason,
      activated_at, ending_at
    FROM interview_session
    WHERE id = ${SESSION_ONE}::uuid
  `;
  assert.deepEqual(rows[0], {
    lifecycle_state: "created",
    lifecycle_version: 1,
    terminal_reason: null,
    activated_at: null,
    ending_at: null,
  });
}

async function verifyLifecycleBackfill(sql: postgres.Sql) {
  const rows = await sql<
    {
      id: string;
      lifecycle_state: string;
      lifecycle_version: number;
      terminal_reason: string | null;
      status: string;
      activated_at: Date | null;
      ending_at: Date | null;
    }[]
  >`
    SELECT id::text, lifecycle_state, lifecycle_version, terminal_reason,
      status, activated_at, ending_at
    FROM interview_session
    WHERE id IN (
      ${SESSION_ONE}::uuid,
      ${SESSION_ENDED_IN_PROGRESS}::uuid,
      ${SESSION_COMPLETED}::uuid,
      ${SESSION_ABANDONED}::uuid,
      ${SESSION_TOO_SHORT}::uuid,
      ${SESSION_ERROR}::uuid
    )
    ORDER BY id
  `;

  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    assert.equal(row.lifecycle_version, 1);
    assert.equal(row.activated_at, null);
  }
  assert.equal(byId.get(SESSION_ONE)?.ending_at, null);
  assert.equal(byId.get(SESSION_ERROR)?.ending_at, null);
  assert.ok(byId.get(SESSION_ENDED_IN_PROGRESS)?.ending_at);
  assert.ok(byId.get(SESSION_COMPLETED)?.ending_at);
  assert.ok(byId.get(SESSION_ABANDONED)?.ending_at);
  assert.ok(byId.get(SESSION_TOO_SHORT)?.ending_at);
  assert.equal(byId.get(SESSION_ENDED_IN_PROGRESS)?.status, "abandoned");
  assert.equal(byId.get(SESSION_COMPLETED)?.status, "completed");
  assert.equal(byId.get(SESSION_ABANDONED)?.status, "abandoned");
  assert.equal(byId.get(SESSION_TOO_SHORT)?.status, "too_short");
  assert.equal(byId.get(SESSION_ERROR)?.status, "error");
  assert.deepEqual(lifecycleOutcome(byId, SESSION_ONE), ["connecting", null]);
  assert.deepEqual(lifecycleOutcome(byId, SESSION_ENDED_IN_PROGRESS), [
    "abandoned",
    "legacy_unknown",
  ]);
  assert.deepEqual(lifecycleOutcome(byId, SESSION_COMPLETED), [
    "completed",
    "legacy_unknown",
  ]);
  assert.deepEqual(lifecycleOutcome(byId, SESSION_ABANDONED), [
    "abandoned",
    "legacy_unknown",
  ]);
  assert.deepEqual(lifecycleOutcome(byId, SESSION_TOO_SHORT), [
    "abandoned",
    "insufficient_signal",
  ]);
  assert.deepEqual(lifecycleOutcome(byId, SESSION_ERROR), [
    "failed",
    "legacy_unknown",
  ]);
}

async function verifyLifecycleConcurrency(sql: postgres.Sql) {
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at
    ) VALUES (
      ${SESSION_CONCURRENT}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      3,
      now()
    )
  `;

  const reasons = [
    "user_end",
    "time_limit",
    "disconnect_timeout",
    "provider_failure",
    "insufficient_signal",
  ] as const;
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, index) => {
      const reason = reasons[index % reasons.length]!;
      return sql<{ terminal_reason: string; lifecycle_version: number }[]>`
        UPDATE interview_session
        SET lifecycle_state = 'ending',
          lifecycle_version = lifecycle_version + 1,
          terminal_reason = ${reason},
          status = 'in_progress',
          ending_at = now(),
          last_transition_at = now()
        WHERE id = ${SESSION_CONCURRENT}::uuid
          AND lifecycle_state = 'active'
          AND lifecycle_version = 3
        RETURNING terminal_reason, lifecycle_version
      `;
    })
  );

  const winners = attempts.flat();
  assert.equal(winners.length, 1);
  assert.equal(winners[0]?.lifecycle_version, 4);

  const stored = await sql<
    {
      lifecycle_state: string;
      lifecycle_version: number;
      terminal_reason: string;
    }[]
  >`
    SELECT lifecycle_state, lifecycle_version, terminal_reason
    FROM interview_session
    WHERE id = ${SESSION_CONCURRENT}::uuid
  `;
  assert.deepEqual(stored[0], {
    lifecycle_state: "ending",
    lifecycle_version: 4,
    terminal_reason: winners[0]?.terminal_reason,
  });
}

function lifecycleOutcome(
  rows: Map<
    string,
    { lifecycle_state: string; terminal_reason: string | null }
  >,
  sessionId: string
) {
  const row = rows.get(sessionId);
  assert.ok(row);
  return [row.lifecycle_state, row.terminal_reason];
}

async function verifyDatabase(sql: postgres.Sql) {
  assert.equal(await migrationCount(sql), 7);

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  assert.equal(tables.length, 23);
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "livekit_reconnect_rate_limit"
    )
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "account_deletion_request")
  );

  const lifecycleColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_session'
      AND column_name IN (
        'lifecycle_state', 'lifecycle_version', 'terminal_reason',
        'activated_at', 'ending_at', 'last_transition_at'
      )
    ORDER BY column_name
  `;
  assert.equal(lifecycleColumns.length, 6);

  const lifecycleIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'interview_session_lifecycle_state_transition_idx',
        'interview_session_user_lifecycle_state_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(lifecycleIndexes.length, 2);

  const tierConstraint = await sql<{ definition: string }[]>`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'subscription_tier_check'
  `;
  assert.match(tierConstraint[0]?.definition ?? "", /starter/);
  assert.doesNotMatch(tierConstraint[0]?.definition ?? "", /premium/);

  const premiumColumn = await sql<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'subscription'
        AND column_name = 'premium_trial_used'
    ) AS present
  `;
  assert.equal(premiumColumn[0]?.present, false);

  const uniqueIndexes = await sql<{ indexname: string; unique: boolean }[]>`
    SELECT indexname, indisunique AS unique
    FROM pg_indexes
    JOIN pg_class ON pg_class.relname = indexname
    JOIN pg_index ON pg_index.indexrelid = pg_class.oid
    WHERE schemaname = 'public'
      AND indexname IN (
        'user_achievement_user_achievement_idx',
        'bookmarked_question_user_question_idx',
        'practice_set_question_set_question_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(uniqueIndexes.length, 3);
  assert.ok(uniqueIndexes.every((index) => index.unique));

  const rls = await sql<{ relname: string; enabled: boolean }[]>`
    SELECT relname, relrowsecurity AS enabled
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relkind = 'r'
    ORDER BY relname
  `;
  assert.equal(rls.length, 23);
  assert.ok(rls.every((table) => table.enabled));

  const unsafePolicies = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'subscription' AND cmd = 'UPDATE'
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
        OR (tablename = 'feedback' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
        OR (tablename = 'transcript_turn' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
      )
  `;
  assert.equal(unsafePolicies[0]?.count, 0);

  const privileges = await sql<
    {
      auth_subscription_update: boolean;
      auth_feedback_insert: boolean;
      auth_transcript_insert: boolean;
      auth_limiter_execute: boolean;
      auth_limiter_select: boolean;
      auth_limiter_insert: boolean;
      anon_limiter_select: boolean;
      anon_limiter_insert: boolean;
      service_limiter_execute: boolean;
    }[]
  >`
    SELECT
      has_table_privilege('authenticated', 'public.subscription', 'UPDATE')
        AS auth_subscription_update,
      has_table_privilege('authenticated', 'public.feedback', 'INSERT')
        AS auth_feedback_insert,
      has_table_privilege('authenticated', 'public.transcript_turn', 'INSERT')
        AS auth_transcript_insert,
      has_function_privilege(
        'authenticated',
        'public.consume_livekit_reconnect_rate_limit(uuid)',
        'EXECUTE'
      ) AS auth_limiter_execute,
      has_table_privilege(
        'authenticated',
        'public.livekit_reconnect_rate_limit',
        'SELECT'
      ) AS auth_limiter_select,
      has_table_privilege(
        'authenticated',
        'public.livekit_reconnect_rate_limit',
        'INSERT'
      ) AS auth_limiter_insert,
      has_table_privilege(
        'anon',
        'public.livekit_reconnect_rate_limit',
        'SELECT'
      ) AS anon_limiter_select,
      has_table_privilege(
        'anon',
        'public.livekit_reconnect_rate_limit',
        'INSERT'
      ) AS anon_limiter_insert,
      has_function_privilege(
        'service_role',
        'public.consume_livekit_reconnect_rate_limit(uuid)',
        'EXECUTE'
      ) AS service_limiter_execute
  `;
  assert.deepEqual(privileges[0], {
    auth_subscription_update: false,
    auth_feedback_insert: false,
    auth_transcript_insert: false,
    auth_limiter_execute: false,
    auth_limiter_select: false,
    auth_limiter_insert: false,
    anon_limiter_select: false,
    anon_limiter_insert: false,
    service_limiter_execute: true,
  });
}

async function verifyAuthorization(sql: postgres.Sql) {
  const ownSubscription = await asAuthenticated(
    sql,
    async (tx) =>
      tx`SELECT tier FROM subscription WHERE user_id = ${USER_ONE}::uuid`
  );
  assert.equal(ownSubscription.length, 1);

  await assert.rejects(
    () =>
      asAuthenticated(
        sql,
        (tx) =>
          tx`UPDATE subscription SET tier = 'pro' WHERE user_id = ${USER_ONE}::uuid`
      ),
    /permission denied/
  );
  await assert.rejects(
    () =>
      asRole(
        sql,
        "authenticated",
        (tx) => tx`SELECT * FROM livekit_reconnect_rate_limit`
      ),
    /permission denied/
  );
  await assert.rejects(
    () =>
      asRole(
        sql,
        "anon",
        (tx) =>
          tx`INSERT INTO livekit_reconnect_rate_limit (user_id) VALUES (${USER_TWO}::uuid)`
      ),
    /permission denied/
  );

  const serviceDecision = await asRole(
    sql,
    "service_role",
    (tx) =>
      tx<{ allowed: boolean }[]>`
        SELECT allowed
        FROM public.consume_livekit_reconnect_rate_limit(${USER_TWO}::uuid)
      `
  );
  assert.equal(serviceDecision[0]?.allowed, true);
  await assert.rejects(
    () =>
      asAuthenticated(
        sql,
        (tx) =>
          tx`INSERT INTO feedback (session_id, status) VALUES (${SESSION_ONE}::uuid, 'pending')`
      ),
    /permission denied/
  );
  await assert.rejects(
    () =>
      asAuthenticated(
        sql,
        (tx) =>
          tx`INSERT INTO transcript_turn (session_id, speaker, text) VALUES (${SESSION_ONE}::uuid, 'user', 'blocked')`
      ),
    /permission denied/
  );
}

async function verifySharedLimiter(sql: postgres.Sql) {
  process.env.DATABASE_URL = databaseUrl(baseUrl, CLEAN_DATABASE);
  const { consumeReconnectRateLimit } = await import("../lib/db/rate-limits");
  const first = await consumeReconnectRateLimit(USER_ONE);
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 9);

  await sql`DELETE FROM livekit_reconnect_rate_limit WHERE user_id = ${USER_ONE}::uuid`;
  const attempts = await Promise.all(
    Array.from({ length: 20 }, () => consumeRateLimit(sql, USER_ONE))
  );
  assert.equal(attempts.filter((attempt) => attempt.allowed).length, 10);
  assert.equal(attempts.filter((attempt) => !attempt.allowed).length, 10);

  const newClient = postgres(databaseUrl(baseUrl, CLEAN_DATABASE), {
    max: 1,
    prepare: false,
  });
  try {
    const coldStartAttempt = await consumeRateLimit(newClient, USER_ONE);
    assert.equal(coldStartAttempt.allowed, false);
    assert.ok(coldStartAttempt.retry_after_seconds >= 1);
  } finally {
    await newClient.end();
  }

  const secondUser = await consumeRateLimit(sql, USER_TWO);
  assert.equal(secondUser.allowed, true);

  const state = await sql<{ rows: number; accepted: number }[]>`
    SELECT count(*)::int AS rows,
      cardinality(max(accepted_at))::int AS accepted
    FROM livekit_reconnect_rate_limit
    WHERE user_id = ${USER_ONE}::uuid
  `;
  assert.deepEqual(state[0], { rows: 1, accepted: 10 });

  await sql`
    UPDATE livekit_reconnect_rate_limit
    SET accepted_at = ARRAY[now() - interval '61 seconds']::timestamptz[]
    WHERE user_id = ${USER_ONE}::uuid
  `;
  assert.equal((await consumeRateLimit(sql, USER_ONE)).allowed, true);
}

async function verifyDeletionTombstone(sql: postgres.Sql) {
  process.env.DATABASE_URL = databaseUrl(baseUrl, CLEAN_DATABASE);
  const {
    deleteUserApplicationData,
    markAccountDeletionCompleted,
    redactStripeEventLogs,
    requestAccountDeletion,
  } = await import("../lib/db/account-deletions");
  const { AccountDeletionPendingError, upsertUser } = await import(
    "../lib/db/users"
  );
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${USER_TWO}::uuid, 'deletion-user@example.invalid')
  `;
  const deletionRequest = await requestAccountDeletion({
    userId: USER_TWO,
    stripeSubjects: buildStripeDeletionSubjects({
      subscriptionId: "sub_private",
      subscriptionCustomerId: null,
      mappedCustomerIds: ["cus_private", "cus_second_private"],
    }),
  });
  await sql`
    INSERT INTO stripe_event_log (
      stripe_event_id, event_type, payload, status, attempts, last_error
    ) VALUES (
      'evt_private',
      'customer.subscription.deleted',
      ${JSON.stringify({ data: { object: { customer: "cus_private" } } })},
      'failed',
      1,
      'user@example.invalid'
    )
  `;
  await assert.rejects(
    () =>
      upsertUser({
        id: USER_TWO,
        email: "cannot-recreate@example.invalid",
      }),
    AccountDeletionPendingError
  );
  await redactStripeEventLogs(deletionRequest);
  await deleteUserApplicationData(USER_TWO);
  await markAccountDeletionCompleted(USER_TWO);

  const [state] = await sql<
    {
      app_user_exists: boolean;
      tombstone_exists: boolean;
      raw_provider_ids: number;
      provider_fingerprints: number;
      redacted_payload: string;
      redacted_error: string | null;
    }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM app_user WHERE id = ${USER_TWO}::uuid)
        AS app_user_exists,
      EXISTS (
        SELECT 1 FROM account_deletion_request
        WHERE user_id = ${USER_TWO}::uuid
      ) AS tombstone_exists,
      (SELECT count(*)::int FROM account_deletion_request
        CROSS JOIN LATERAL jsonb_array_elements(stripe_subjects) subject
        WHERE user_id = ${USER_TWO}::uuid
          AND subject->>'providerId' IS NOT NULL) AS raw_provider_ids,
      (SELECT jsonb_array_length(stripe_subjects)::int
        FROM account_deletion_request
        WHERE user_id = ${USER_TWO}::uuid) AS provider_fingerprints,
      (SELECT payload FROM stripe_event_log
        WHERE stripe_event_id = 'evt_private') AS redacted_payload,
      (SELECT last_error FROM stripe_event_log
        WHERE stripe_event_id = 'evt_private') AS redacted_error
  `;
  assert.deepEqual(state, {
    app_user_exists: false,
    tombstone_exists: true,
    raw_provider_ids: 0,
    provider_fingerprints: 3,
    redacted_payload: "{}",
    redacted_error: null,
  });
}

async function consumeRateLimit(sql: postgres.Sql, userId: string) {
  const rows = await sql<
    {
      allowed: boolean;
      retry_after_seconds: number;
      remaining: number;
    }[]
  >`
    SELECT allowed, retry_after_seconds, remaining
    FROM public.consume_livekit_reconnect_rate_limit(${userId}::uuid)
  `;
  assert.equal(rows.length, 1);
  return rows[0];
}

async function asAuthenticated<T>(
  sql: postgres.Sql,
  operation: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claim.sub', ${USER_ONE}, true)`;
    await tx.unsafe("SET LOCAL ROLE authenticated");
    return operation(tx);
  }) as Promise<T>;
}

async function asRole<T>(
  sql: postgres.Sql,
  role: "anon" | "authenticated" | "service_role",
  operation: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    return operation(tx);
  }) as Promise<T>;
}

async function migrationCount(sql: postgres.Sql): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
  `;
  return rows[0]?.count ?? 0;
}

async function protectedRowCounts(sql: postgres.Sql) {
  const rows = await sql<
    {
      users: number;
      subscriptions: number;
      sessions: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM app_user) AS users,
      (SELECT count(*)::int FROM subscription) AS subscriptions,
      (SELECT count(*)::int FROM interview_session) AS sessions
  `;
  return rows[0];
}

function databaseUrl(url: string, database: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
}
