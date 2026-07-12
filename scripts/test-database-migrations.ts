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

import {
  buildStripeDeletionSubject,
  buildStripeDeletionSubjects,
  fingerprintStripeSubject,
} from "../lib/billing/stripe-privacy";
import { ACCOUNT_IDENTITY_LOCK_NAMESPACE } from "../lib/db/account-identity-lock";

import {
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "lib/db/migrations");
const CLEAN_DATABASE = "meelni_clean_test";
const UPGRADE_DATABASE = "meelni_upgrade_test";
const USER_ONE = "11111111-1111-4111-8111-111111111111";
const USER_TWO = "22222222-2222-4222-8222-222222222222";
const SESSION_DELETION = "22222222-3333-4333-8333-222222222222";
const SESSION_ONE = "33333333-3333-4333-8333-333333333333";
const SESSION_ENDED_IN_PROGRESS = "44444444-4444-4444-8444-444444444444";
const SESSION_COMPLETED = "55555555-5555-4555-8555-555555555555";
const SESSION_ABANDONED = "66666666-6666-4666-8666-666666666666";
const SESSION_TOO_SHORT = "77777777-7777-4777-8777-777777777777";
const SESSION_ERROR = "88888888-8888-4888-8888-888888888888";
const SESSION_CONCURRENT = "99999999-9999-4999-8999-999999999999";
const SESSION_ATOMIC_END = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_REPAIR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_BACKFILL = "cccccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_INSUFFICIENT = "dddddddd-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_USER_END = "eeeeeeee-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_DISPATCH_RECOVERY =
  "ffffffff-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_CORRUPT_DELETION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_RECREATION_RACE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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
    await verifyAtomicSessionCompletion(clean, cleanUrl, true);
    await verifyAuthorization(clean);
    await verifyDeletionTombstone(clean);
    await verifySharedLimiter(clean);
    await verifyAtomicCreditLedger(clean, cleanUrl, "clean");
    assertZeroCreditLedgerIntegrity(
      runPreflight(cleanUrl, true, "reconciled")!
    );

    const cleanContract = await getDatabaseSchemaContract(clean);
    const cleanFingerprint = databaseSchemaFingerprint(cleanContract);
    console.log(`Schema contract fingerprint: ${cleanFingerprint}`);
    assert.equal(cleanFingerprint, DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT);
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
      await seedLegacyCreditLedgerIntegrityFixtures(upgrade);
      const lifecyclePreview = runPreflight(
        upgradeUrl,
        true,
        "ready_for_session_lifecycle"
      );
      assertLegacyCreditLedgerIntegrity(lifecyclePreview!);
      const countsBefore = await protectedRowCounts(upgrade);
      const throughAtomicCompletion = await createMigrationFolderThrough(7);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: throughAtomicCompletion,
        });
      } finally {
        await rm(throughAtomicCompletion, { recursive: true, force: true });
      }
      const lifecycleApplied = runPreflight(upgradeUrl, true, "reconciled");
      assertLifecycleBackfillCountsMatch(lifecyclePreview!, lifecycleApplied!);
      assertLegacyCreditLedgerIntegrity(lifecycleApplied!);
      assert.deepEqual(await protectedRowCounts(upgrade), countsBefore);
      await seedDeadlineCleanupBackfillFixture(upgrade);
      await migrate(drizzle(upgrade), { migrationsFolder: MIGRATIONS });
      await verifyDeadlineCleanupBackfill(upgrade);
      await verifyDatabase(upgrade);
      await verifyLifecycleBackfill(upgrade);
      await verifyAtomicSessionCompletion(upgrade, upgradeUrl, false);
      await verifyAuthorization(upgrade);
      await verifyAtomicCreditLedger(upgrade, upgradeUrl, "upgrade");
      assertLegacyCreditLedgerIntegrity(
        runPreflight(upgradeUrl, true, "reconciled")!
      );
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
  projected_legacy_status: string;
  lifecycle_state: string;
  terminal_reason: string;
  rows: number;
}

interface MigrationPreflightResult {
  lifecycleBackfill: {
    phase: "not_ready" | "preview" | "applied";
    counts: MigrationPreflightCount[];
  };
  creditLedgerIntegrity: CreditLedgerIntegrity;
}

interface CreditLedgerIntegrity {
  grant_evidence_mismatches: number;
  empty_or_partial_active_reservations: number;
  allocation_total_mismatches: number;
  allocation_reserve_evidence_mismatches: number;
  orphan_or_mismatched_reserve_transactions: number;
  terminal_evidence_mismatches: number;
  reserved_balance_mismatches: number;
  rollover_evidence_mismatches: number;
  orphan_or_mismatched_rollover_transactions: number;
  orphan_rollover_grants: number;
  subscription_renewal_evidence_mismatches: number;
  cross_user_references: number;
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
      const key = `${count.projected_legacy_status}:${count.lifecycle_state}:${count.terminal_reason}`;
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

function assertLegacyCreditLedgerIntegrity(result: MigrationPreflightResult) {
  assert.deepEqual(result.creditLedgerIntegrity, {
    grant_evidence_mismatches: 1,
    empty_or_partial_active_reservations: 2,
    allocation_total_mismatches: 2,
    allocation_reserve_evidence_mismatches: 1,
    orphan_or_mismatched_reserve_transactions: 1,
    terminal_evidence_mismatches: 2,
    reserved_balance_mismatches: 1,
    rollover_evidence_mismatches: 1,
    orphan_or_mismatched_rollover_transactions: 1,
    orphan_rollover_grants: 1,
    subscription_renewal_evidence_mismatches: 1,
    cross_user_references: 1,
  });
}

function assertZeroCreditLedgerIntegrity(result: MigrationPreflightResult) {
  assert.ok(
    Object.values(result.creditLedgerIntegrity).every((count) => count === 0),
    `Expected runtime ledger integrity counts to be zero: ${JSON.stringify(
      result.creditLedgerIntegrity
    )}`
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

async function seedLegacyCreditLedgerIntegrityFixtures(sql: postgres.Sql) {
  await sql.unsafe(`
    INSERT INTO app_user (id, email)
    VALUES ('${USER_TWO}', 'legacy-integrity-user@example.invalid')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO credit_grant (
      id, user_id, catalog_id, source, idempotency_key,
      original_credits, remaining_credits, reserved_credits,
      rollover_eligible, created_at, updated_at
    ) VALUES
      (
        '10000000-0000-4000-8000-000000000001', '${USER_ONE}',
        'interview_pass', 'migration', 'legacy:missing-grant-transaction',
        1, 1, 0, false, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000002', '${USER_ONE}',
        'interview_pass', 'migration', 'legacy:empty-reservation-grant',
        1, 1, 0, false, '2026-07-01T00:01:00Z', '2026-07-01T00:01:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000003', '${USER_ONE}',
        'pro', 'migration', 'legacy:partial-reservation-grant',
        2, 1, 1, false, '2026-07-01T00:02:00Z', '2026-07-01T00:02:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000004', '${USER_ONE}',
        'interview_pass', 'migration', 'legacy:terminal-reservation-grant',
        1, 0, 0, false, '2026-07-01T00:03:00Z', '2026-07-01T00:03:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000005', '${USER_ONE}',
        'interview_pass', 'migration', 'legacy:reserved-balance-grant',
        1, 0, 1, false, '2026-07-01T00:04:00Z', '2026-07-01T00:04:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000006', '${USER_ONE}',
        'pro', 'rollover', 'legacy:rollover-mismatch',
        1, 1, 0, false, '2026-07-01T00:05:00Z', '2026-07-01T00:05:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000007', '${USER_ONE}',
        'pro', 'subscription_renewal', 'legacy:renewal-evidence-mismatch',
        12, 12, 0, true, '2026-07-01T00:06:00Z', '2026-07-01T00:06:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000008', '${USER_ONE}',
        'pro', 'rollover', 'legacy:complete-orphan-rollover',
        1, 1, 0, false, '2026-07-01T00:07:00Z', '2026-07-01T00:07:00Z'
      ),
      (
        '10000000-0000-4000-8000-000000000009', '${USER_ONE}',
        'pro', 'migration', 'legacy:complete-orphan-source',
        1, 0, 0, true, '2026-07-01T00:08:00Z', '2026-07-01T00:08:00Z'
      );

    UPDATE credit_grant
    SET source_id = 'legacy:complete-orphan-provider',
      expires_at = '2026-08-30T00:07:00Z',
      rollover_source_grant_id =
        '10000000-0000-4000-8000-000000000009'
    WHERE id = '10000000-0000-4000-8000-000000000008';

    UPDATE credit_grant
    SET source_id = 'legacy:complete-orphan-provider'
    WHERE id = '10000000-0000-4000-8000-000000000009';

    INSERT INTO credit_transaction (
      user_id, grant_id, reservation_id, type, credits,
      idempotency_key, source_id, balance_after, metadata, created_at
    )
    SELECT '${USER_ONE}', grant_row.id, NULL, 'grant', grant_row.original_credits,
      grant_row.idempotency_key || ':grant', grant_row.source_id,
      grant_row.original_credits, grant_row.metadata, grant_row.created_at
    FROM credit_grant grant_row
    WHERE grant_row.id IN (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
      '10000000-0000-4000-8000-000000000007',
      '10000000-0000-4000-8000-000000000009'
    );

    UPDATE credit_transaction
    SET metadata = jsonb_build_object(
      '__meelni_subscription_renewal_completion',
      jsonb_build_object(
        'version', 1,
        'rolloverIdempotencyKey', 'legacy:rollover-mismatch',
        'rolledCredits', 1,
        'rolloverGrantId', '10000000-0000-4000-8000-000000000006',
        'rolloverExpiresAt', '2026-08-31T00:00:00.000Z',
        'rolloverSourceGrantId', 123,
        'sourceAllocations', jsonb_build_array(jsonb_build_object(
          'grantId', '10000000-0000-4000-8000-000000000002',
          'credits', '1',
          'balanceAfter', 0
        ))
      )
    )
    WHERE idempotency_key = 'legacy:renewal-evidence-mismatch:grant';

    INSERT INTO credit_reservation (
      id, user_id, reservation_key, status, credits, session_id,
      expires_at, created_at, updated_at
    ) VALUES
      (
        '20000000-0000-4000-8000-000000000001', '${USER_ONE}',
        'legacy:empty-active', 'active', 1, NULL,
        '2026-08-01T00:00:00Z', '2026-07-01T01:00:00Z',
        '2026-07-01T01:00:00Z'
      ),
      (
        '20000000-0000-4000-8000-000000000002', '${USER_ONE}',
        'legacy:partial-active', 'active', 2, NULL,
        '2026-08-01T00:00:00Z', '2026-07-01T01:01:00Z',
        '2026-07-01T01:01:00Z'
      ),
      (
        '20000000-0000-4000-8000-000000000003', '${USER_ONE}',
        'legacy:terminal-missing-transaction', 'consumed', 1, NULL,
        '2026-08-01T00:00:00Z', '2026-07-01T01:02:00Z',
        '2026-07-01T01:02:00Z'
      );

    INSERT INTO credit_reservation_grant (
      reservation_id, grant_id, credits, created_at
    ) VALUES
      (
        '20000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003', 1,
        '2026-07-01T01:01:00Z'
      ),
      (
        '20000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000004', 1,
        '2026-07-01T01:02:00Z'
      );

    INSERT INTO credit_transaction (
      user_id, grant_id, reservation_id, type, credits,
      idempotency_key, source_id, balance_after, metadata, created_at
    ) VALUES
      (
        '${USER_ONE}', '10000000-0000-4000-8000-000000000004',
        '20000000-0000-4000-8000-000000000003', 'reserve', 1,
        'reserve:legacy:terminal-missing-transaction:10000000-0000-4000-8000-000000000004',
        NULL, 0, NULL, '2026-07-01T01:02:00Z'
      ),
      (
        '${USER_ONE}', '10000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000001', 'reserve', 1,
        'legacy:orphan-reserve-transaction',
        NULL, 0, NULL, '2026-07-01T01:03:00Z'
      ),
      (
        '${USER_ONE}', NULL,
        '20000000-0000-4000-8000-000000000001', 'consume', 1,
        'legacy:terminal-on-active-reservation',
        NULL, NULL, '{"allocations": []}'::jsonb,
        '2026-07-01T01:04:00Z'
      ),
      (
        '${USER_ONE}', '10000000-0000-4000-8000-000000000002',
        NULL, 'rollover', 1,
        'legacy:orphan-rollover-transaction',
        NULL, 0,
        '{"rolloverGrantId": "10000000-0000-4000-8000-000000000006"}'::jsonb,
        '2026-07-01T01:05:00Z'
      ),
      (
        '${USER_TWO}', '10000000-0000-4000-8000-000000000001',
        NULL, 'adjustment', 1,
        'legacy:cross-user-reference',
        NULL, NULL, NULL, '2026-07-01T01:06:00Z'
      ),
      (
        '${USER_ONE}', '10000000-0000-4000-8000-000000000009',
        NULL, 'rollover', 1,
        'legacy:complete-orphan-rollover:source:10000000-0000-4000-8000-000000000009',
        'legacy:complete-orphan-provider', 0,
        '{"rolloverGrantId": "10000000-0000-4000-8000-000000000008"}'::jsonb,
        '2026-07-01T01:07:00Z'
      ),
      (
        '${USER_ONE}', '10000000-0000-4000-8000-000000000008',
        NULL, 'rollover', 1,
        'legacy:complete-orphan-rollover:grant',
        'legacy:complete-orphan-provider', 1, NULL,
        '2026-07-01T01:08:00Z'
      );
  `);
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

async function verifyAtomicSessionCompletion(
  sql: postgres.Sql,
  databaseUrl: string,
  runDeadlineCleanupComposition: boolean
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { finalizeInterviewSession },
    { createDrizzleFeedbackDispatchStore },
    {
      acknowledgeInterviewDeadlineRoomCleanup,
      getInterviewDeadlineSession,
      listInterviewDeadlineSchedules,
    },
    { enforceInterviewDeadlineWorkflow },
    { dispatchFeedbackGenerationWorkflow },
    { dispatchInterviewSessionSettlement, settleInterviewSessionWorkflow },
    { SessionTier },
    schema,
  ] = await Promise.all([
    import("../lib/db/end-interview-session"),
    import("../lib/db/feedback-dispatch"),
    import("../lib/db/session-deadlines"),
    import("../lib/workflows/enforce-interview-deadline"),
    import("../lib/workflows/dispatch-feedback-generation"),
    import("../lib/workflows/end-interview-session"),
    import("../lib/evaluation/session-validator"),
    import("../lib/db/schema"),
  ]);
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at
    ) VALUES (
      ${SESSION_ATOMIC_END}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      1,
      now()
    )
  `;

  const validation = {
    tier: SessionTier.FULL,
    isValid: true,
    stats: {
      totalTurns: 20,
      userTurns: 10,
      totalWords: 800,
      durationSeconds: 1200,
      substantiveResponses: 8,
    },
    reasons: [],
    recommendations: ["Practice another product-sense response."],
  };
  const clients = Array.from({ length: 10 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const databases = clients.map((client) => drizzle(client, { schema }));

  try {
    const results = await Promise.all(
      databases.map((database, index) =>
        finalizeInterviewSession(
          index % 2 === 0
            ? {
                sessionId: SESSION_ATOMIC_END,
                actor: { type: "user", userId: USER_ONE },
                requestedTerminalReason: "user_end",
                validation,
              }
            : {
                sessionId: SESSION_ATOMIC_END,
                actor: { type: "system", source: "hard_deadline" },
                requestedTerminalReason: "time_limit",
                validation,
              },
          database
        )
      )
    );
    assert.ok(results.every((result) => result.ok));
    const successful = results.filter(
      (result): result is Extract<typeof result, { ok: true }> => result.ok
    );
    const signatures = successful.map((result) => ({
      state: result.lifecycle.state,
      version: result.lifecycle.version,
      reason: result.lifecycle.terminalReason,
      endedAt: result.lifecycle.endedAt.toISOString(),
      feedbackId: result.feedback.id,
      eventId: result.feedback.dispatchEventId,
      tier: result.tier,
      stats: result.stats,
    }));
    assert.ok(
      signatures.every((signature) => deepEqual(signature, signatures[0]))
    );
    assert.equal(signatures[0]?.state, "completed");
    assert.equal(signatures[0]?.version, 3);
    assert.ok(
      signatures[0]?.reason === "user_end" ||
        signatures[0]?.reason === "time_limit"
    );

    const feedbackRows = await sql<
      { rows: number; event_ids: number; dispatch_attempts: number }[]
    >`
      SELECT count(*)::int AS rows,
        count(DISTINCT dispatch_event_id)::int AS event_ids,
        max(dispatch_attempts)::int AS dispatch_attempts
      FROM feedback
      WHERE session_id = ${SESSION_ATOMIC_END}::uuid
    `;
    assert.deepEqual(feedbackRows[0], {
      rows: 1,
      event_ids: 1,
      dispatch_attempts: 0,
    });

    const stores = databases.map((database) =>
      createDrizzleFeedbackDispatchStore(database)
    );
    const now = new Date("2026-07-09T22:00:00.000Z");
    let claims = await Promise.all(
      stores.map((store) =>
        store.claim({
          sessionId: SESSION_ATOMIC_END,
          now,
          staleBefore: new Date(now.getTime() - 120_000),
        })
      )
    );
    if (signatures[0]?.reason === "time_limit") {
      assert.equal(
        claims.every((claim) => claim === null),
        true
      );
      await sql`
        UPDATE interview_session
        SET deadline_room_cleanup_status = 'already_absent',
          deadline_room_cleanup_acknowledged_at = now()
        WHERE id = ${SESSION_ATOMIC_END}::uuid
          AND deadline_room_cleanup_status = 'pending'
      `;
      claims = await Promise.all(
        stores.map((store) =>
          store.claim({
            sessionId: SESSION_ATOMIC_END,
            now,
            staleBefore: new Date(now.getTime() - 120_000),
          })
        )
      );
    }
    const winners = claims.filter((claim) => claim !== null);
    assert.equal(winners.length, 1);
    assert.equal(winners[0]?.attempts, 1);
    const eventId = winners[0]?.eventId;
    assert.ok(eventId);

    assert.equal(
      await stores[0]!.markFailed({
        sessionId: SESSION_ATOMIC_END,
        eventId,
        attempt: 1,
        errorCode: "test_dispatch_failure",
      }),
      true
    );
    const retry = await stores[1]!.claim({
      sessionId: SESSION_ATOMIC_END,
      now: new Date(now.getTime() + 1_000),
      staleBefore: new Date(now.getTime() - 119_000),
    });
    assert.equal(retry?.attempts, 2);
    assert.notEqual(retry?.eventId, eventId);
    const retryEventId = retry?.eventId;
    assert.ok(retryEventId);
    assert.equal(
      await stores[0]!.markSent({
        sessionId: SESSION_ATOMIC_END,
        eventId,
        attempt: 1,
        now,
      }),
      false
    );
    assert.equal(
      await stores[1]!.markSent({
        sessionId: SESSION_ATOMIC_END,
        eventId: retryEventId,
        attempt: 2,
        now: new Date(now.getTime() + 2_000),
      }),
      true
    );

    if (runDeadlineCleanupComposition) {
      await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, status, lifecycle_state,
        lifecycle_version, terminal_reason, ended_at, last_transition_at
      ) VALUES (
        ${SESSION_REPAIR}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'completed',
        'completed',
        9,
        'legacy_unknown',
        now(),
        now()
      )
    `;
      const repaired = await finalizeInterviewSession(
        {
          sessionId: SESSION_REPAIR,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
          validation,
        },
        databases[0]!
      );
      assert.equal(repaired.ok, true);
      if (repaired.ok) {
        assert.equal(repaired.disposition, "repaired");
        assert.equal(repaired.lifecycle.version, 9);
        assert.equal(repaired.lifecycle.terminalReason, "legacy_unknown");
        assert.equal(repaired.feedback.sessionId, SESSION_REPAIR);
      }

      await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, status, lifecycle_state,
        lifecycle_version, activated_at, started_at, livekit_room_name
      ) VALUES (
        ${SESSION_DEADLINE_INSUFFICIENT}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'active',
        3,
        '2026-07-10T06:01:00.000Z'::timestamptz,
        '2026-07-10T06:00:00.000Z'::timestamptz,
        'interview-deadline-insufficient-room'
      )
    `;
      const insufficientValidation = {
        tier: SessionTier.INSUFFICIENT,
        isValid: false,
        stats: {
          totalTurns: 2,
          userTurns: 1,
          totalWords: 12,
          durationSeconds: 30,
          substantiveResponses: 0,
        },
        reasons: ["Insufficient durable interview signal"],
        recommendations: ["Complete another interview."],
      };
      let roomDeleteAttempts = 0;
      let feedbackEvents = 0;
      let signalDeleteStarted: (() => void) | undefined;
      let resolveDeferredDelete:
        | ((result: {
            ok: false;
            provider: "livekit";
            error: {
              code: string;
              message: string;
              retryable: boolean;
            };
          }) => void)
        | undefined;
      const deleteStarted = new Promise<void>((resolve) => {
        signalDeleteStarted = resolve;
      });
      const deferredDelete = new Promise<{
        ok: false;
        provider: "livekit";
        error: { code: string; message: string; retryable: boolean };
      }>((resolve) => {
        resolveDeferredDelete = resolve;
      });
      const deadlineDeps = {
        getSession: getInterviewDeadlineSession,
        settleSession: () =>
          settleInterviewSessionWorkflow(
            {
              sessionId: SESSION_DEADLINE_INSUFFICIENT,
              actor: {
                type: "system" as const,
                source: "hard_deadline" as const,
              },
              requestedTerminalReason: "time_limit" as const,
            },
            {
              authorize: async () => true,
              validate: async () => insufficientValidation,
              finalize: (
                input: Parameters<typeof finalizeInterviewSession>[0]
              ) => finalizeInterviewSession(input, databases[0]!),
              updateMotivation: async () => {},
            }
          ),
        settleInvalidSession: async () => ({
          ok: false as const,
          reason: "not_found" as const,
        }),
        dispatchSettlement: (
          completion: Parameters<typeof dispatchInterviewSessionSettlement>[0]
        ) =>
          dispatchInterviewSessionSettlement(completion, {
            dispatch: async () => {
              feedbackEvents += 1;
              throw new Error("Skipped feedback must not dispatch");
            },
          }),
        terminateRoom: async ({ roomName }: { roomName: string }) => {
          roomDeleteAttempts += 1;
          if (roomDeleteAttempts === 1) {
            signalDeleteStarted?.();
            return deferredDelete;
          }
          return {
            ok: true as const,
            provider: "livekit" as const,
            data: { roomName, disposition: "already_absent" as const },
          };
        },
        acknowledgeRoomCleanup: acknowledgeInterviewDeadlineRoomCleanup,
        now: () => new Date("2026-07-10T06:30:00.000Z"),
      };
      const deferredDeadline = enforceInterviewDeadlineWorkflow(
        {
          sessionId: SESSION_DEADLINE_INSUFFICIENT,
          deadlineAt: "2026-07-10T06:30:00.000Z",
          env: {
            apiKey: "test",
            apiSecret: "test",
            url: "wss://test.invalid",
          },
        },
        deadlineDeps
      );
      await deleteStarted;
      const concurrentUserEnd = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_INSUFFICIENT,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
          validation,
        },
        databases[1]!
      );
      assert.equal(concurrentUserEnd.ok, true);
      if (concurrentUserEnd.ok) {
        assert.equal(concurrentUserEnd.disposition, "existing");
        assert.equal(
          concurrentUserEnd.lifecycle.terminalReason,
          "insufficient_signal"
        );
        assert.equal(
          concurrentUserEnd.deadlineRoomCleanupStatus,
          "pending"
        );
      }
      resolveDeferredDelete?.({
        ok: false,
        provider: "livekit",
        error: {
          code: "livekit_room_delete_failed",
          message: "provider unavailable",
          retryable: true,
        },
      });
      await assert.rejects(deferredDeadline);
      const [pendingInsufficient] = await sql<
        {
          terminal_reason: string;
          deadline_room_cleanup_status: string | null;
          feedback_status: string;
          dispatch_status: string;
        }[]
      >`
      SELECT session.terminal_reason,
        session.deadline_room_cleanup_status,
        feedback.status AS feedback_status,
        feedback.dispatch_status
      FROM interview_session session
      JOIN feedback ON feedback.session_id = session.id
      WHERE session.id = ${SESSION_DEADLINE_INSUFFICIENT}::uuid
    `;
      assert.deepEqual(pendingInsufficient, {
        terminal_reason: "insufficient_signal",
        deadline_room_cleanup_status: "pending",
        feedback_status: "skipped",
        dispatch_status: "not_required",
      });
      assert.equal(
        (await listInterviewDeadlineSchedules()).some(
          (item) => item.sessionId === SESSION_DEADLINE_INSUFFICIENT
        ),
        true
      );
      const recoveredInsufficient = await enforceInterviewDeadlineWorkflow(
        {
          sessionId: SESSION_DEADLINE_INSUFFICIENT,
          deadlineAt: "2026-07-10T06:30:00.000Z",
          env: { apiKey: "test", apiSecret: "test", url: "wss://test.invalid" },
        },
        deadlineDeps
      );
      assert.equal(recoveredInsufficient.ok, true);
      assert.equal(feedbackEvents, 0);
      const acknowledgedInsufficient = await getInterviewDeadlineSession(
        SESSION_DEADLINE_INSUFFICIENT
      );
      assert.equal(
        acknowledgedInsufficient?.deadlineRoomCleanupStatus,
        "already_absent"
      );

      await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, status, lifecycle_state,
        lifecycle_version, activated_at, started_at, livekit_room_name,
        config
      ) VALUES (
        ${SESSION_DEADLINE_DISPATCH_RECOVERY}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'active',
        3,
        '2026-07-10T06:01:00.000Z'::timestamptz,
        '2026-07-10T06:00:00.000Z'::timestamptz,
        'interview-deadline-dispatch-recovery-room',
        '{"duration":30}'::jsonb
      )
    `;
      const eligibleDeadline = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
          validation,
        },
        databases[0]!
      );
      assert.equal(eligibleDeadline.ok, true);
      if (eligibleDeadline.ok) {
        assert.equal(eligibleDeadline.lifecycle.terminalReason, "time_limit");
        assert.equal(eligibleDeadline.deadlineRoomCleanupStatus, "pending");
        assert.equal(eligibleDeadline.feedback.status, "pending");
        assert.equal(eligibleDeadline.feedback.dispatchStatus, "pending");
      }

      const concurrentEligibleUserEnd = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
          validation,
        },
        databases[1]!
      );
      assert.equal(concurrentEligibleUserEnd.ok, true);
      if (concurrentEligibleUserEnd.ok) {
        assert.equal(concurrentEligibleUserEnd.disposition, "existing");
        assert.equal(
          concurrentEligibleUserEnd.deadlineRoomCleanupStatus,
          "pending"
        );
      }

      const dispatchRecoveryStores = databases.map((database) =>
        createDrizzleFeedbackDispatchStore(database)
      );
      const dispatchRecoveryNow = new Date("2026-07-10T06:31:00.000Z");
      const blockedClaims = await Promise.all(
        dispatchRecoveryStores.map((store) =>
          store.claim({
            sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
            now: dispatchRecoveryNow,
            staleBefore: new Date(dispatchRecoveryNow.getTime() - 120_000),
          })
        )
      );
      assert.equal(blockedClaims.every((claim) => claim === null), true);

      await acknowledgeInterviewDeadlineRoomCleanup(
        SESSION_DEADLINE_DISPATCH_RECOVERY,
        "already_absent"
      );
      const acknowledgedClaims = await Promise.all(
        dispatchRecoveryStores.map((store) =>
          store.claim({
            sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
            now: dispatchRecoveryNow,
            staleBefore: new Date(dispatchRecoveryNow.getTime() - 120_000),
          })
        )
      );
      const acknowledgedWinners = acknowledgedClaims.filter(
        (claim) => claim !== null
      );
      assert.equal(acknowledgedWinners.length, 1);
      const failedDispatch = acknowledgedWinners[0]!;
      assert.equal(failedDispatch.attempts, 1);
      assert.ok(failedDispatch.eventId);
      assert.equal(
        await dispatchRecoveryStores[0]!.markFailed({
          sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
          eventId: failedDispatch.eventId,
          attempt: failedDispatch.attempts,
          errorCode: "test_dispatch_failure",
        }),
        true
      );
      assert.equal(
        (await listInterviewDeadlineSchedules()).some(
          (item) => item.sessionId === SESSION_DEADLINE_DISPATCH_RECOVERY
        ),
        true
      );

      let dispatchRecoveryRoomDeletes = 0;
      let recoveredFeedbackEvents = 0;
      const recoveredEligible = await enforceInterviewDeadlineWorkflow(
        {
          sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
          deadlineAt: "2026-07-10T06:30:00.000Z",
          env: { apiKey: "test", apiSecret: "test", url: "wss://test.invalid" },
        },
        {
          getSession: getInterviewDeadlineSession,
          settleSession: () =>
            settleInterviewSessionWorkflow(
              {
                sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
                actor: { type: "system", source: "hard_deadline" },
                requestedTerminalReason: "time_limit",
              },
              {
                authorize: async () => true,
                validate: async () => validation,
                finalize: (
                  input: Parameters<typeof finalizeInterviewSession>[0]
                ) => finalizeInterviewSession(input, databases[0]!),
                updateMotivation: async () => {},
              }
            ),
          settleInvalidSession: async () => ({
            ok: false as const,
            reason: "not_found" as const,
          }),
          dispatchSettlement: (completion) =>
            dispatchInterviewSessionSettlement(completion, {
              dispatch: (input) =>
                dispatchFeedbackGenerationWorkflow(input, {
                  store: dispatchRecoveryStores[1]!,
                  now: () => new Date("2026-07-10T06:32:00.000Z"),
                  send: async () => {
                    recoveredFeedbackEvents += 1;
                  },
                }),
            }),
          terminateRoom: async () => {
            dispatchRecoveryRoomDeletes += 1;
            throw new Error("Acknowledged cleanup must not delete again");
          },
          acknowledgeRoomCleanup: async () => {
            throw new Error("Acknowledged cleanup must not acknowledge again");
          },
          now: () => new Date("2026-07-10T06:32:00.000Z"),
        }
      );
      assert.equal(recoveredEligible.ok, true);
      assert.equal(dispatchRecoveryRoomDeletes, 0);
      assert.equal(recoveredFeedbackEvents, 1);
      const [recoveredDispatchRow] = await sql<
        {
          cleanup_status: string;
          dispatch_status: string;
          dispatch_attempts: number;
          dispatch_event_id: string;
        }[]
      >`
      SELECT session.deadline_room_cleanup_status AS cleanup_status,
        feedback.dispatch_status,
        feedback.dispatch_attempts,
        feedback.dispatch_event_id
      FROM interview_session session
      JOIN feedback ON feedback.session_id = session.id
      WHERE session.id = ${SESSION_DEADLINE_DISPATCH_RECOVERY}::uuid
    `;
      assert.deepEqual(recoveredDispatchRow, {
        cleanup_status: "already_absent",
        dispatch_status: "sent",
        dispatch_attempts: 2,
        dispatch_event_id: `feedback/generate.requested:${SESSION_DEADLINE_DISPATCH_RECOVERY}:2`,
      });
      assert.equal(
        (await listInterviewDeadlineSchedules()).some(
          (item) => item.sessionId === SESSION_DEADLINE_DISPATCH_RECOVERY
        ),
        false
      );

      await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, status, lifecycle_state,
        lifecycle_version, activated_at, started_at, livekit_room_name
      ) VALUES (
        ${SESSION_DEADLINE_USER_END}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'active',
        3,
        '2026-07-10T06:01:00.000Z'::timestamptz,
        '2026-07-10T06:00:00.000Z'::timestamptz,
        'interview-deadline-user-end-room'
      )
    `;
      const userEndWinner = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_USER_END,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
          validation,
        },
        databases[0]!
      );
      assert.equal(userEndWinner.ok, true);
      const deadlineLoser = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_USER_END,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
          validation: insufficientValidation,
        },
        databases[1]!
      );
      assert.equal(deadlineLoser.ok, true);
      if (deadlineLoser.ok) {
        assert.equal(deadlineLoser.lifecycle.terminalReason, "user_end");
        assert.equal(deadlineLoser.deadlineRoomCleanupStatus, null);
      }
      await assert.rejects(() =>
        acknowledgeInterviewDeadlineRoomCleanup(
          SESSION_DEADLINE_USER_END,
          "already_absent"
        )
      );
    }
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
}

async function seedDeadlineCleanupBackfillFixture(sql: postgres.Sql) {
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      lifecycle_version, terminal_reason, ended_at, last_transition_at,
      livekit_room_name
    ) VALUES (
      ${SESSION_DEADLINE_BACKFILL}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'completed',
      'completed',
      4,
      'time_limit',
      now(),
      now(),
      'interview-deadline-backfill-room'
    )
  `;
}

async function verifyDeadlineCleanupBackfill(sql: postgres.Sql) {
  const rows = await sql<
    {
      deadline_room_cleanup_status: string | null;
      deadline_room_cleanup_acknowledged_at: Date | null;
    }[]
  >`
    SELECT deadline_room_cleanup_status,
      deadline_room_cleanup_acknowledged_at
    FROM interview_session
    WHERE id = ${SESSION_DEADLINE_BACKFILL}::uuid
  `;
  assert.deepEqual(rows[0], {
    deadline_room_cleanup_status: "pending",
    deadline_room_cleanup_acknowledged_at: null,
  });
}

function deepEqual(left: unknown, right: unknown): boolean {
  try {
    assert.deepEqual(left, right);
    return true;
  } catch {
    return false;
  }
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
  assert.equal(await migrationCount(sql), 9);

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
        'activated_at', 'ending_at', 'last_transition_at',
        'deadline_room_cleanup_status',
        'deadline_room_cleanup_acknowledged_at'
      )
    ORDER BY column_name
  `;
  assert.equal(lifecycleColumns.length, 8);

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

  const completionColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback'
      AND column_name IN (
        'completion_tier', 'completion_stats', 'completion_recommendations',
        'dispatch_status', 'dispatch_event_id', 'dispatch_attempts',
        'dispatch_claimed_at', 'dispatched_at', 'dispatch_last_error'
      )
    ORDER BY column_name
  `;
  assert.equal(completionColumns.length, 9);

  const completionConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'feedback_completion_tier_check',
      'feedback_dispatch_attempts_check',
      'feedback_dispatch_claim_check',
      'feedback_dispatch_event_required_check',
      'feedback_dispatch_sent_check',
      'feedback_dispatch_status_check'
    )
    ORDER BY conname
  `;
  assert.equal(completionConstraints.length, 6);

  const completionIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'feedback_dispatch_event_id_idx',
        'feedback_dispatch_recovery_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(completionIndexes.length, 2);

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

async function verifyAtomicCreditLedger(
  sql: postgres.Sql,
  databaseUrl: string,
  scope: "clean" | "upgrade"
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { createCreditLedgerService },
    { createDrizzleCreditLedgerStore },
    schema,
  ] = await Promise.all([
    import("../lib/billing/credits"),
    import("../lib/billing/credit-ledger-store"),
    import("../lib/db/schema"),
  ]);
  const [databaseClock] = await sql<{ now: Date }[]>`
    SELECT clock_timestamp() AS now
  `;
  assert.ok(databaseClock?.now);
  const ledgerNow = new Date(databaseClock.now);
  const clients = Array.from({ length: 8 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const ledgers = clients.map((client) =>
    createCreditLedgerService({
      store: createDrizzleCreditLedgerStore(drizzle(client, { schema })),
      now: () => new Date(ledgerNow),
    })
  );
  const key = (value: string) => `postgres:${scope}:${value}`;

  try {
    await Promise.all(clients.map((client) => client`SELECT 1`));

    const lastCreditUser = creditTestUserId(1);
    await seedCreditTestUser(sql, lastCreditUser, `${scope}-last-credit`);
    await ledgers[0]!.grantCredits({
      userId: lastCreditUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: key("last-credit-grant"),
      includedCredits: 1,
      expiresAt: null,
    });
    const lastCreditAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reserveCredit({
            userId: lastCreditUser,
            reservationKey: key(`last-credit:${index}`),
            credits: 1,
          })
      )
    );
    assert.equal(fulfilled(lastCreditAttempts).length, 1);
    assert.equal(rejected(lastCreditAttempts).length, ledgers.length - 1);
    for (const failure of rejected(lastCreditAttempts)) {
      assert.match(errorMessage(failure.reason), /insufficient_credits/);
    }
    const [lastCreditState] = await sql<
      {
        remaining: number;
        reserved: number;
        reservations: number;
        allocations: number;
        reserve_transactions: number;
      }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        grant_row.reserved_credits::int AS reserved,
        (SELECT count(*)::int FROM credit_reservation
          WHERE user_id = ${lastCreditUser}::uuid) AS reservations,
        (SELECT count(*)::int FROM credit_reservation_grant allocation
          JOIN credit_reservation reservation
            ON reservation.id = allocation.reservation_id
          WHERE reservation.user_id = ${lastCreditUser}::uuid) AS allocations,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${lastCreditUser}::uuid AND type = 'reserve')
          AS reserve_transactions
      FROM credit_grant grant_row
      WHERE grant_row.user_id = ${lastCreditUser}::uuid
    `;
    assert.deepEqual(lastCreditState, {
      remaining: 0,
      reserved: 1,
      reservations: 1,
      allocations: 1,
      reserve_transactions: 1,
    });

    const replayUser = creditTestUserId(2);
    await seedCreditTestUser(sql, replayUser, `${scope}-reservation-replay`);
    await ledgers[0]!.grantCredits({
      userId: replayUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: key("replay-grant"),
      includedCredits: 1,
      expiresAt: null,
    });
    const replayKey = key("same-reservation");
    const replaySession = creditTestSessionId(2);
    const replayAttempts = await runConcurrently(
      ledgers.map(
        (ledger) => () =>
          ledger.reserveCredit({
            userId: replayUser,
            reservationKey: replayKey,
            sessionId: replaySession,
            credits: 1,
          })
      )
    );
    assert.equal(rejected(replayAttempts).length, 0);
    const replayResults = fulfilled(replayAttempts).map(
      (result) => result.value
    );
    assert.ok(
      replayResults.every(
        (result) => result.reservation.id === replayResults[0]!.reservation.id
      )
    );
    const [replayState] = await sql<
      { reservations: number; allocations: number; transactions: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM credit_reservation
          WHERE user_id = ${replayUser}::uuid) AS reservations,
        (SELECT count(*)::int FROM credit_reservation_grant allocation
          JOIN credit_reservation reservation
            ON reservation.id = allocation.reservation_id
          WHERE reservation.user_id = ${replayUser}::uuid) AS allocations,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${replayUser}::uuid AND type = 'reserve') AS transactions
    `;
    assert.deepEqual(replayState, {
      reservations: 1,
      allocations: 1,
      transactions: 1,
    });

    const grantUser = creditTestUserId(3);
    await seedCreditTestUser(sql, grantUser, `${scope}-grant-replay`);
    const grantAttempts = await runConcurrently(
      ledgers.map(
        (ledger) => () =>
          ledger.grantCredits({
            userId: grantUser,
            catalogId: "interview_pass",
            source: "admin",
            sourceId: key("grant-source"),
            idempotencyKey: key("same-grant"),
            includedCredits: 1,
            expiresAt: null,
          })
      )
    );
    assert.equal(rejected(grantAttempts).length, 0);
    const grantResults = fulfilled(grantAttempts).map((result) => result.value);
    assert.ok(
      grantResults.every(
        (result) => result.grant.id === grantResults[0]!.grant.id
      )
    );
    const [grantState] = await sql<{ grants: number; transactions: number }[]>`
      SELECT
        (SELECT count(*)::int FROM credit_grant
          WHERE user_id = ${grantUser}::uuid) AS grants,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${grantUser}::uuid AND type = 'grant') AS transactions
    `;
    assert.deepEqual(grantState, { grants: 1, transactions: 1 });

    const terminalUser = creditTestUserId(4);
    await seedCreditTestUser(sql, terminalUser, `${scope}-terminal-race`);
    await ledgers[0]!.grantCredits({
      userId: terminalUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: key("terminal-grant"),
      includedCredits: 1,
      expiresAt: null,
    });
    await ledgers[0]!.reserveCredit({
      userId: terminalUser,
      reservationKey: key("terminal-reservation"),
      credits: 1,
    });
    const terminalAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          index % 2 === 0
            ? ledger.consumeReservation({
                reservationKey: key("terminal-reservation"),
                idempotencyKey: key("terminal-consume"),
              })
            : ledger.releaseReservation({
                reservationKey: key("terminal-reservation"),
                idempotencyKey: key("terminal-release"),
              })
      )
    );
    assert.ok(fulfilled(terminalAttempts).length >= ledgers.length / 2);
    assert.ok(rejected(terminalAttempts).length >= 1);
    const [terminalState] = await sql<
      {
        status: string;
        terminal_transactions: number;
        terminal_types: string[];
      }[]
    >`
      SELECT reservation.status,
        count(transaction.id)::int AS terminal_transactions,
        array_agg(transaction.type ORDER BY transaction.type)
          FILTER (WHERE transaction.id IS NOT NULL) AS terminal_types
      FROM credit_reservation reservation
      LEFT JOIN credit_transaction transaction
        ON transaction.reservation_id = reservation.id
        AND transaction.type IN ('consume', 'release')
      WHERE reservation.reservation_key = ${key("terminal-reservation")}
      GROUP BY reservation.status
    `;
    assert.equal(terminalState?.terminal_transactions, 1);
    assert.deepEqual(terminalState?.terminal_types, [
      terminalState?.status === "consumed" ? "consume" : "release",
    ]);

    const refundUser = creditTestUserId(5);
    await seedCreditTestUser(sql, refundUser, `${scope}-refund-replay`);
    await ledgers[0]!.grantCredits({
      userId: refundUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: key("refund-grant"),
      includedCredits: 1,
      expiresAt: null,
    });
    await ledgers[0]!.reserveCredit({
      userId: refundUser,
      reservationKey: key("refund-reservation"),
      credits: 1,
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("refund-reservation"),
      idempotencyKey: key("refund-consume"),
    });
    const refundAttempts = await runConcurrently(
      ledgers.map(
        (ledger) => () =>
          ledger.refundReservation({
            reservationKey: key("refund-reservation"),
            idempotencyKey: key("same-refund"),
          })
      )
    );
    assert.equal(rejected(refundAttempts).length, 0);
    const [refundState] = await sql<
      { status: string; remaining: number; reserved: number; refunds: number }[]
    >`
      SELECT reservation.status,
        grant_row.remaining_credits::int AS remaining,
        grant_row.reserved_credits::int AS reserved,
        (SELECT count(*)::int FROM credit_transaction
          WHERE reservation_id = reservation.id AND type = 'refund') AS refunds
      FROM credit_reservation reservation
      JOIN credit_reservation_grant allocation
        ON allocation.reservation_id = reservation.id
      JOIN credit_grant grant_row ON grant_row.id = allocation.grant_id
      WHERE reservation.reservation_key = ${key("refund-reservation")}
    `;
    assert.deepEqual(refundState, {
      status: "refunded",
      remaining: 1,
      reserved: 0,
      refunds: 1,
    });

    const rolloverUser = creditTestUserId(6);
    await seedCreditTestUser(sql, rolloverUser, `${scope}-rollover-replay`);
    for (const index of [1, 2]) {
      await ledgers[0]!.grantCredits({
        userId: rolloverUser,
        catalogId: "pro",
        source: "subscription_renewal",
        sourceId: key(`renewal-source:${index}`),
        idempotencyKey: key(`renewal:${index}`),
        includedCredits: 8,
      });
    }
    const rolloverAttempts = await runConcurrently(
      ledgers.map(
        (ledger) => () =>
          ledger.renewSubscriptionCredits({
            userId: rolloverUser,
            catalogId: "pro",
            sourceId: key("rollover-source"),
            renewalIdempotencyKey: key("same-renewal"),
            rolloverIdempotencyKey: key("same-rollover"),
          })
      )
    );
    assert.equal(rejected(rolloverAttempts).length, 0);
    const rolloverResults = fulfilled(rolloverAttempts).map(
      (result) => result.value
    );
    assert.ok(
      rolloverResults.every(
        (result) =>
          result.grant.id === rolloverResults[0]!.grant.id &&
          result.rolloverGrant?.id === rolloverResults[0]!.rolloverGrant?.id
      )
    );
    const [rolloverState] = await sql<
      {
        rollover_grants: number;
        rollover_credits: number;
        source_remaining: number;
        total_remaining: number;
        source_transactions: number;
        target_transactions: number;
        evidence_rollover_key: string;
        evidence_rolled_credits: number;
        evidence_grant_matches: boolean;
      }[]
    >`
      SELECT
        count(*) FILTER (WHERE source = 'rollover')::int AS rollover_grants,
        COALESCE(sum(original_credits) FILTER (WHERE source = 'rollover'), 0)::int
          AS rollover_credits,
        COALESCE(sum(remaining_credits)
          FILTER (WHERE source = 'subscription_renewal'), 0)::int
          AS source_remaining,
        COALESCE(sum(remaining_credits), 0)::int AS total_remaining,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${rolloverUser}::uuid
            AND type = 'rollover'
            AND metadata ? 'rolloverGrantId') AS source_transactions,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${rolloverUser}::uuid
            AND type = 'rollover'
            AND idempotency_key = ${key("same-rollover") + ":grant"})
          AS target_transactions,
        (SELECT metadata #>> '{__meelni_subscription_renewal_completion,rolloverIdempotencyKey}'
          FROM credit_transaction
          WHERE idempotency_key = ${key("same-renewal") + ":grant"})
          AS evidence_rollover_key,
        (SELECT (metadata #>> '{__meelni_subscription_renewal_completion,rolledCredits}')::int
          FROM credit_transaction
          WHERE idempotency_key = ${key("same-renewal") + ":grant"})
          AS evidence_rolled_credits,
        (SELECT
          (renewal.metadata #>> '{__meelni_subscription_renewal_completion,rolloverGrantId}')::uuid
            = rollover.id
          FROM credit_transaction renewal
          JOIN credit_grant rollover
            ON rollover.idempotency_key = ${key("same-rollover")}
          WHERE renewal.idempotency_key = ${key("same-renewal") + ":grant"})
          AS evidence_grant_matches
      FROM credit_grant
      WHERE user_id = ${rolloverUser}::uuid
    `;
    assert.deepEqual(rolloverState, {
      rollover_grants: 1,
      rollover_credits: 12,
      source_remaining: 16,
      total_remaining: 28,
      source_transactions: 2,
      target_transactions: 1,
      evidence_rollover_key: key("same-rollover"),
      evidence_rolled_credits: 12,
      evidence_grant_matches: true,
    });

    const rollbackUser = creditTestUserId(7);
    await seedCreditTestUser(sql, rollbackUser, `${scope}-renewal-rollback`);
    const rollbackSource = await ledgers[0]!.grantCredits({
      userId: rollbackUser,
      catalogId: "pro",
      source: "subscription_renewal",
      sourceId: key("rollback-source"),
      idempotencyKey: key("rollback-source-grant"),
      includedCredits: 8,
    });
    const rollbackRenewalKey = key("rollback-renewal");
    const rollbackRolloverKey = key("rollback-rollover");
    await sql`
      INSERT INTO credit_transaction (
        user_id, grant_id, reservation_id, type, credits,
        idempotency_key, source_id, balance_after, metadata
      ) VALUES (
        ${rollbackUser}::uuid,
        ${rollbackSource.grant.id}::uuid,
        NULL,
        'adjustment',
        1,
        ${`${rollbackRenewalKey}:grant`},
        'preseeded-collision',
        NULL,
        ${JSON.stringify({ reason: "atomic_rollback_test" })}::jsonb
      )
    `;
    await assert.rejects(
      () =>
        ledgers[0]!.renewSubscriptionCredits({
          userId: rollbackUser,
          catalogId: "pro",
          sourceId: key("rollback-renewal-source"),
          renewalIdempotencyKey: rollbackRenewalKey,
          rolloverIdempotencyKey: rollbackRolloverKey,
        }),
      /credit_transaction_idempotency_conflict/
    );
    const [rollbackState] = await sql<
      {
        source_remaining: number;
        source_reserved: number;
        new_grants: number;
        rollover_transactions: number;
      }[]
    >`
      SELECT source.remaining_credits::int AS source_remaining,
        source.reserved_credits::int AS source_reserved,
        (SELECT count(*)::int FROM credit_grant
          WHERE user_id = ${rollbackUser}::uuid
            AND idempotency_key IN (${rollbackRenewalKey}, ${rollbackRolloverKey}))
          AS new_grants,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${rollbackUser}::uuid
            AND type = 'rollover'
            AND idempotency_key LIKE ${`${rollbackRolloverKey}:%`})
          AS rollover_transactions
      FROM credit_grant source
      WHERE source.id = ${rollbackSource.grant.id}::uuid
    `;
    assert.deepEqual(rollbackState, {
      source_remaining: 8,
      source_reserved: 0,
      new_grants: 0,
      rollover_transactions: 0,
    });
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
}

async function seedCreditTestUser(
  sql: postgres.Sql,
  userId: string,
  label: string
) {
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${userId}::uuid, ${`${label}@example.invalid`})
  `;
}

function creditTestUserId(index: number): string {
  return `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function creditTestSessionId(index: number): string {
  return `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

async function runConcurrently<T>(operations: Array<() => Promise<T>>) {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const attempts = operations.map(async (operation) => {
    await gate;
    return operation();
  });
  release?.();
  return Promise.allSettled(attempts);
}

function fulfilled<T>(results: PromiseSettledResult<T>[]) {
  return results.filter(
    (result): result is PromiseFulfilledResult<T> =>
      result.status === "fulfilled"
  );
}

function rejected<T>(results: PromiseSettledResult<T>[]) {
  return results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function verifyDeletionTombstone(sql: postgres.Sql) {
  process.env.DATABASE_URL = databaseUrl(baseUrl, CLEAN_DATABASE);
  const {
    clearLateStripeDeletionSubjects,
    deleteUserApplicationData,
    getAccountDeletionRequest,
    listRecoverableAccountDeletions,
    markAccountDeletionCompleted,
    recordLateStripeDeletionSubjects,
    redactStripeEventLogs,
    requestAccountDeletionWithCurrentSubjects,
  } = await import("../lib/db/account-deletions");
  const { AccountDeletionPendingError, upsertUser } = await import(
    "../lib/db/users"
  );
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${USER_RECREATION_RACE}::uuid, 'deletion-race@example.invalid')
  `;
  let racingUpsert: Promise<unknown> | undefined;
  await sql.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${USER_RECREATION_RACE},
          ${ACCOUNT_IDENTITY_LOCK_NAMESPACE}::bigint
        )
      )
    `;
    await tx`
      SELECT id FROM app_user
      WHERE id = ${USER_RECREATION_RACE}::uuid
      FOR UPDATE
    `;
    racingUpsert = upsertUser({
      id: USER_RECREATION_RACE,
      email: "must-not-recreate@example.invalid",
    });
    // Give the concurrent upsert time to reach the identity lock. Without the
    // shared lock it passes the tombstone check and waits on app_user instead.
    await tx`SELECT pg_sleep(0.1)`;
    await tx`
      INSERT INTO account_deletion_request (user_id, status, stripe_subjects)
      VALUES (${USER_RECREATION_RACE}::uuid, 'completed', '[]'::jsonb)
    `;
    await tx`
      DELETE FROM app_user WHERE id = ${USER_RECREATION_RACE}::uuid
    `;
  });
  await assert.rejects(racingUpsert!, AccountDeletionPendingError);
  const [recreatedUser] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM app_user WHERE id = ${USER_RECREATION_RACE}::uuid
    ) AS exists
  `;
  assert.equal(recreatedUser?.exists, false);

  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${USER_TWO}::uuid, 'deletion-user@example.invalid')
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode)
    VALUES (
      ${SESSION_DELETION}::uuid,
      ${USER_TWO}::uuid,
      'product_sense',
      'voice_video'
    )
  `;
  await sql`
    INSERT INTO user_insights (
      user_id,
      overall_stats,
      by_interview_type,
      by_difficulty,
      trends,
      competency_breakdown,
      last_session_id
    ) VALUES (
      ${USER_TWO}::uuid,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      ${SESSION_DELETION}::uuid
    )
  `;
  await sql`
    INSERT INTO stripe_customer_mapping (stripe_customer_id, user_id)
    VALUES
      ('cus_private', ${USER_TWO}::uuid),
      ('cus_second_private', ${USER_TWO}::uuid)
  `;
  const deletionRequest =
    await requestAccountDeletionWithCurrentSubjects(USER_TWO);
  const { createDrizzleCreditLedgerStore } = await import(
    "../lib/billing/credit-ledger-store"
  );
  const { createCreditLedgerService } = await import("../lib/billing/credits");
  await assert.rejects(
    () =>
      createCreditLedgerService({
        store: createDrizzleCreditLedgerStore(),
      }).grantCredits({
        userId: USER_TWO,
        catalogId: "interview_pass",
        source: "checkout",
        sourceId: "cs_deleted_account",
        idempotencyKey: "stripe:checkout:deleted-account",
      }),
    /account_deletion_pending/
  );
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
  const lateSubjects = [
    ...buildStripeDeletionSubjects({
      subscriptionId: null,
      subscriptionCustomerId: "cus_late_after_completion",
      mappedCustomerIds: [],
    }),
    buildStripeDeletionSubject("invoice", "in_late_after_completion")!,
    buildStripeDeletionSubject("payment_intent", "pi_late_after_completion")!,
  ];
  await recordLateStripeDeletionSubjects(USER_TWO, lateSubjects);
  assert.equal(
    (await listRecoverableAccountDeletions(new Date())).includes(USER_TWO),
    true
  );
  await markAccountDeletionCompleted(
    USER_TWO,
    deletionRequest.stripeSubjects.map(({ fingerprint }) => fingerprint)
  );
  const [pendingLateCleanup] = await sql<{ raw_provider_ids: number }[]>`
    SELECT count(*)::int AS raw_provider_ids
    FROM account_deletion_request
    CROSS JOIN LATERAL jsonb_array_elements(stripe_subjects) subject
    WHERE user_id = ${USER_TWO}::uuid
      AND subject->>'providerId' IS NOT NULL
  `;
  assert.equal(pendingLateCleanup?.raw_provider_ids, 3);
  const [failedLateCleanup] = await sql<
    { status: string; last_error_code: string | null }[]
  >`
    SELECT status, last_error_code
    FROM account_deletion_request
    WHERE user_id = ${USER_TWO}::uuid
  `;
  assert.deepEqual(failedLateCleanup, {
    status: "failed",
    last_error_code: "stripe_late_reconciliation_failed",
  });
  assert.equal(
    (await listRecoverableAccountDeletions(new Date())).includes(USER_TWO),
    true
  );
  await clearLateStripeDeletionSubjects(USER_TWO, [
    lateSubjects[0]!.fingerprint,
  ]);
  const [partiallyCleared] = await sql<
    { status: string; raw_provider_ids: number }[]
  >`
    SELECT
      status,
      (SELECT count(*)::int
        FROM jsonb_array_elements(stripe_subjects) subject
        WHERE subject->>'providerId' IS NOT NULL) AS raw_provider_ids
    FROM account_deletion_request
    WHERE user_id = ${USER_TWO}::uuid
  `;
  assert.deepEqual(partiallyCleared, {
    status: "failed",
    raw_provider_ids: 2,
  });
  await clearLateStripeDeletionSubjects(
    USER_TWO,
    lateSubjects.slice(1).map(({ fingerprint }) => fingerprint)
  );

  const [state] = await sql<
    {
      app_user_exists: boolean;
      interview_session_exists: boolean;
      user_insights_exists: boolean;
      tombstone_exists: boolean;
      raw_provider_ids: number;
      provider_fingerprints: number;
      deletion_status: string;
      redacted_payload: string;
      redacted_error: string | null;
    }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM app_user WHERE id = ${USER_TWO}::uuid)
        AS app_user_exists,
      EXISTS (
        SELECT 1 FROM interview_session
        WHERE user_id = ${USER_TWO}::uuid
      ) AS interview_session_exists,
      EXISTS (
        SELECT 1 FROM user_insights
        WHERE user_id = ${USER_TWO}::uuid
      ) AS user_insights_exists,
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
      (SELECT status FROM account_deletion_request
        WHERE user_id = ${USER_TWO}::uuid) AS deletion_status,
      (SELECT payload FROM stripe_event_log
        WHERE stripe_event_id = 'evt_private') AS redacted_payload,
      (SELECT last_error FROM stripe_event_log
        WHERE stripe_event_id = 'evt_private') AS redacted_error
  `;
  assert.deepEqual(state, {
    app_user_exists: false,
    interview_session_exists: false,
    user_insights_exists: false,
    tombstone_exists: true,
    raw_provider_ids: 0,
    provider_fingerprints: 5,
    deletion_status: "completed",
    redacted_payload: "{}",
    redacted_error: null,
  });

  await sql`
    INSERT INTO account_deletion_request (user_id, status, stripe_subjects)
    VALUES (
      ${USER_CORRUPT_DELETION}::uuid,
      'failed',
      '[{"kind":"unknown","providerId":"unsafe","fingerprint":"bad"}]'::jsonb
    )
  `;
  await assert.rejects(
    () => getAccountDeletionRequest(USER_CORRUPT_DELETION),
    (error: unknown) =>
      (error as { code?: string }).code === "account_deletion_subjects_invalid"
  );
  await sql`
    DELETE FROM account_deletion_request
    WHERE user_id = ${USER_CORRUPT_DELETION}::uuid
  `;
  const wrongKindId = "sub_wrong_kind";
  await sql`
    INSERT INTO account_deletion_request (user_id, status, stripe_subjects)
    VALUES (
      ${USER_CORRUPT_DELETION}::uuid,
      'failed',
      ${JSON.stringify([
        {
          kind: "customer",
          providerId: wrongKindId,
          fingerprint: fingerprintStripeSubject(wrongKindId),
        },
      ])}::jsonb
    )
  `;
  await assert.rejects(
    () => getAccountDeletionRequest(USER_CORRUPT_DELETION),
    (error: unknown) =>
      (error as { code?: string }).code === "account_deletion_subjects_invalid"
  );
  await sql`
    DELETE FROM account_deletion_request
    WHERE user_id = ${USER_CORRUPT_DELETION}::uuid
  `;
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
