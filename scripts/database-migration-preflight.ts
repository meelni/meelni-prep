import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config } from "dotenv";
import postgres from "postgres";

import {
  ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT,
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  DURABLE_CONTACT_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
  RELAUNCH_SCHEMA_FINGERPRINT,
  SESSION_LIFECYCLE_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";
import {
  canonicalEnvironmentForEnvFile,
  getSupabaseEnvironmentIdentityPolicy,
} from "./supabase-environment-guard.mjs";

const envFile = process.env.MEELNI_ENV_FILE || ".env.local";
const loadedEnv = config({
  path: resolve(process.cwd(), envFile),
  override: Boolean(process.env.MEELNI_ENV_FILE),
});
if (process.env.MEELNI_ENV_FILE) {
  if (loadedEnv.error) {
    throw new Error(`Could not load explicitly selected env file: ${envFile}`);
  }
  const selectedDatabaseUrl = loadedEnv.parsed?.DATABASE_URL;
  if (!selectedDatabaseUrl) {
    throw new Error(`Selected env file has no DATABASE_URL: ${envFile}`);
  }
  process.env.DATABASE_URL = selectedDatabaseUrl;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

const selectedEnvironment = process.env.MEELNI_ENV_FILE
  ? (loadedEnv.parsed ?? {})
  : process.env;
const identityPolicy = getSupabaseEnvironmentIdentityPolicy({
  databaseUrl,
  environment: selectedEnvironment.MEELNI_ENV_PULL_ENVIRONMENT,
  expectedEnvironment: canonicalEnvironmentForEnvFile(envFile),
  productionProjectRef:
    selectedEnvironment.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF,
  vercelEnvironment: selectedEnvironment.VERCEL_ENV,
});
if (!identityPolicy.allowed || !identityPolicy.environmentIdentity) {
  throw new Error(identityPolicy.reason);
}
if (!identityPolicy.local && !process.env.MEELNI_ENV_FILE) {
  throw new Error(
    "Remote database preflight requires an explicit MEELNI_ENV_FILE; use db:preflight:preview or db:preflight:production"
  );
}

void run(databaseUrl, identityPolicy.environmentIdentity)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      JSON.stringify({
        status: "blocked",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    );
    process.exit(1);
  });

async function run(url: string, environmentIdentity: string) {
  const parsed = new URL(url);
  const transactionPooler = parsed.port === "6543";
  if (transactionPooler) {
    throw new Error(
      "Database migrations require a direct or session connection, not a transaction-pooler URL"
    );
  }

  const expected = await expectedMigrations();
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");

      const migrations = await tx<
        {
          hash: string;
          created_at: string;
        }[]
      >`
        SELECT hash, created_at::text
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at
      `;
      if (![2, 6, 7, 8, 9].includes(migrations.length)) {
        throw new Error(
          `Expected 2 pre-reconciliation, 6 relaunch, 7 lifecycle, 8 atomic-completion, or 9 durable-contact migrations; found ${migrations.length}`
        );
      }
      migrations.forEach((migration, index) => {
        const expectedMigration = expected[index];
        if (
          !expectedMigration ||
          migration.hash !== expectedMigration.hash ||
          migration.created_at !== String(expectedMigration.when)
        ) {
          throw new Error(`Migration ledger mismatch at position ${index}`);
        }
      });

      const [optionalTables] = await tx<
        {
          achievement: boolean;
          bookmark: boolean;
          practice_set_question: boolean;
          credit_ledger: boolean;
        }[]
      >`
        SELECT
          to_regclass('public.user_achievement') IS NOT NULL AS achievement,
          to_regclass('public.bookmarked_question') IS NOT NULL AS bookmark,
          to_regclass('public.practice_set_question') IS NOT NULL
            AS practice_set_question,
          to_regclass('public.credit_grant') IS NOT NULL
            AND to_regclass('public.credit_reservation') IS NOT NULL
            AND to_regclass('public.credit_reservation_grant') IS NOT NULL
            AND to_regclass('public.credit_transaction') IS NOT NULL
            AS credit_ledger
      `;
      if (!optionalTables) {
        throw new Error("Database preflight could not inspect optional tables");
      }

      const achievementDuplicates = optionalTables.achievement
        ? Number(
            (
              await tx<{ count: number }[]>`
                SELECT count(*)::int AS count FROM (
                  SELECT 1 FROM user_achievement
                  GROUP BY user_id, achievement_id HAVING count(*) > 1
                ) duplicate_groups
              `
            )[0]?.count ?? 0
          )
        : 0;
      const bookmarkDuplicates = optionalTables.bookmark
        ? Number(
            (
              await tx<{ count: number }[]>`
                SELECT count(*)::int AS count FROM (
                  SELECT 1 FROM bookmarked_question
                  GROUP BY user_id, question_id HAVING count(*) > 1
                ) duplicate_groups
              `
            )[0]?.count ?? 0
          )
        : 0;
      const practiceSetDuplicates = optionalTables.practice_set_question
        ? Number(
            (
              await tx<{ count: number }[]>`
                SELECT count(*)::int AS count FROM (
                  SELECT 1 FROM practice_set_question
                  GROUP BY practice_set_id, question_id HAVING count(*) > 1
                ) duplicate_groups
              `
            )[0]?.count ?? 0
          )
        : 0;

      const [summaryBase] = await tx<
        {
          tables: number;
          rls_tables: number;
          unsupported_tiers: number;
          legacy_premium_trials: number;
          unsafe_policies: number;
          unique_contracts: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM information_schema.tables
            WHERE table_schema = 'public') AS tables,
          (SELECT count(*)::int
            FROM pg_class JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            WHERE pg_namespace.nspname = 'public'
              AND pg_class.relkind = 'r'
              AND pg_class.relrowsecurity) AS rls_tables,
          (SELECT count(*)::int FROM subscription
            WHERE tier NOT IN ('free', 'starter', 'pro')) AS unsupported_tiers,
          (SELECT count(*)::int FROM subscription
            WHERE to_jsonb(subscription)->>'premium_trial_used' = 'true')
            AS legacy_premium_trials,
          (SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public' AND (
              (tablename = 'subscription' AND cmd = 'UPDATE'
                AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
              OR (tablename = 'feedback' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
              OR (tablename = 'transcript_turn' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
                AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
            )) AS unsafe_policies,
          (SELECT count(*)::int
            FROM pg_indexes
            JOIN pg_class ON pg_class.relname = indexname
            JOIN pg_index ON pg_index.indexrelid = pg_class.oid
            WHERE schemaname = 'public'
              AND indisunique
              AND indexname IN (
                'user_achievement_user_achievement_idx',
                'bookmarked_question_user_question_idx',
                'practice_set_question_set_question_idx'
              )) AS unique_contracts
      `;

      if (!summaryBase) {
        throw new Error("Database preflight returned no summary");
      }
      const summary = {
        ...summaryBase,
        achievement_duplicates: achievementDuplicates,
        bookmark_duplicates: bookmarkDuplicates,
        practice_set_duplicates: practiceSetDuplicates,
      };
      const creditLedgerIntegrity = optionalTables.credit_ledger
        ? await getCreditLedgerIntegrity(tx)
        : emptyCreditLedgerIntegrity();
      if (
        summary.unsupported_tiers > 0 ||
        summary.legacy_premium_trials > 0 ||
        summary.achievement_duplicates > 0 ||
        summary.bookmark_duplicates > 0 ||
        summary.practice_set_duplicates > 0
      ) {
        throw new Error(
          "Data violates reconciliation preconditions; inspect redacted counts before migration"
        );
      }
      let startingContract:
        | "clean_0001"
        | "legacy_relaunch"
        | "relaunch_reconciled"
        | "session_lifecycle"
        | "atomic_session_completion"
        | "durable_contact";
      if (migrations.length === 2) {
        const preMigrationFingerprint = databaseSchemaFingerprint(
          await getDatabasePreMigrationContract(tx)
        );
        if (preMigrationFingerprint === CLEAN_0001_SCHEMA_FINGERPRINT) {
          startingContract = "clean_0001";
        } else if (
          preMigrationFingerprint === LEGACY_RELAUNCH_SCHEMA_FINGERPRINT
        ) {
          startingContract = "legacy_relaunch";
        } else {
          throw new Error(
            "Database does not match an accepted pre-migration schema contract"
          );
        }
      } else if (migrations.length === 6) {
        startingContract = "relaunch_reconciled";
      } else if (migrations.length === 7) {
        startingContract = "session_lifecycle";
      } else if (migrations.length === 8) {
        startingContract = "atomic_session_completion";
      } else {
        startingContract = "durable_contact";
      }
      if (migrations.length >= 6) {
        const expectedTableCount = migrations.length === 9 ? 26 : 23;
        if (
          summary.tables !== expectedTableCount ||
          summary.rls_tables !== expectedTableCount ||
          summary.unsafe_policies !== 0 ||
          summary.unique_contracts !== 3
        ) {
          throw new Error(
            "Reconciled database does not satisfy the launch schema contract"
          );
        }
        const schemaFingerprint = databaseSchemaFingerprint(
          await getDatabaseSchemaContract(tx)
        );
        const expectedFingerprint =
          migrations.length === 6
            ? RELAUNCH_SCHEMA_FINGERPRINT
            : migrations.length === 7
              ? SESSION_LIFECYCLE_SCHEMA_FINGERPRINT
              : migrations.length === 8
                ? ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT
                : DURABLE_CONTACT_SCHEMA_FINGERPRINT;
        if (schemaFingerprint !== expectedFingerprint) {
          throw new Error(
            `Reconciled database differs from the exact launch schema contract (expected ${expectedFingerprint}, found ${schemaFingerprint})`
          );
        }
      }

      const lifecycleBackfillCounts =
        migrations.length === 6
          ? await tx<
              {
                projected_legacy_status: string;
                lifecycle_state: string;
                terminal_reason: string;
                rows: number;
              }[]
            >`
              SELECT projected_legacy_status, lifecycle_state, terminal_reason,
                count(*)::int AS rows
              FROM (
                SELECT
                  CASE
                    WHEN status = 'error' THEN 'error'
                    WHEN status = 'too_short' THEN 'too_short'
                    WHEN status = 'abandoned' THEN 'abandoned'
                    WHEN status = 'completed' THEN 'completed'
                    WHEN ended_at IS NOT NULL THEN 'abandoned'
                    ELSE 'in_progress'
                  END AS projected_legacy_status,
                  CASE
                    WHEN status = 'error' THEN 'failed'
                    WHEN status IN ('abandoned', 'too_short') THEN 'abandoned'
                    WHEN status = 'completed' THEN 'completed'
                    WHEN ended_at IS NOT NULL THEN 'abandoned'
                    ELSE 'connecting'
                  END AS lifecycle_state,
                  CASE
                    WHEN status = 'too_short' THEN 'insufficient_signal'
                    WHEN status IN ('error', 'abandoned', 'completed')
                      OR ended_at IS NOT NULL THEN 'legacy_unknown'
                    ELSE 'none'
                  END AS terminal_reason
                FROM interview_session
              ) preview
              GROUP BY projected_legacy_status, lifecycle_state, terminal_reason
              ORDER BY projected_legacy_status, lifecycle_state, terminal_reason
            `
          : migrations.length >= 7
            ? await tx<
                {
                  projected_legacy_status: string;
                  lifecycle_state: string;
                  terminal_reason: string;
                  rows: number;
                }[]
              >`
                SELECT status AS projected_legacy_status, lifecycle_state,
                  COALESCE(terminal_reason, 'none') AS terminal_reason,
                  count(*)::int AS rows
                FROM interview_session
                GROUP BY status, lifecycle_state, terminal_reason
                ORDER BY status, lifecycle_state, terminal_reason
              `
            : [];

      return {
        status:
          migrations.length === 2
            ? "ready_to_reconcile"
            : migrations.length === 6
              ? "ready_for_session_lifecycle"
              : "reconciled",
        connectionMode: "direct_or_session",
        environmentIdentity,
        migrationCount: migrations.length,
        startingContract,
        schemaContract:
          migrations.length === 9
            ? DURABLE_CONTACT_SCHEMA_FINGERPRINT
            : migrations.length === 8
              ? ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT
              : migrations.length === 7
                ? SESSION_LIFECYCLE_SCHEMA_FINGERPRINT
                : migrations.length === 6
                  ? RELAUNCH_SCHEMA_FINGERPRINT
                  : "pending",
        lifecycleBackfill:
          migrations.length === 6
            ? { phase: "preview", counts: lifecycleBackfillCounts }
            : migrations.length >= 7
              ? { phase: "applied", counts: lifecycleBackfillCounts }
              : { phase: "not_ready", counts: [] },
        creditLedgerIntegrity,
        ...summary,
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end();
  }
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

function emptyCreditLedgerIntegrity(): CreditLedgerIntegrity {
  return {
    grant_evidence_mismatches: 0,
    empty_or_partial_active_reservations: 0,
    allocation_total_mismatches: 0,
    allocation_reserve_evidence_mismatches: 0,
    orphan_or_mismatched_reserve_transactions: 0,
    terminal_evidence_mismatches: 0,
    reserved_balance_mismatches: 0,
    rollover_evidence_mismatches: 0,
    orphan_or_mismatched_rollover_transactions: 0,
    orphan_rollover_grants: 0,
    subscription_renewal_evidence_mismatches: 0,
    cross_user_references: 0,
  };
}

async function getCreditLedgerIntegrity(
  tx: postgres.TransactionSql
): Promise<CreditLedgerIntegrity> {
  const [counts] = await tx<CreditLedgerIntegrity[]>`
    WITH reservation_evidence AS (
      SELECT reservation.*,
        COALESCE(sum(allocation.credits), 0)::int AS allocated_credits,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'grantId', allocation.grant_id,
              'credits', allocation.credits
            ) ORDER BY allocation.grant_id
          ) FILTER (WHERE allocation.id IS NOT NULL),
          '[]'::jsonb
        ) AS allocation_metadata
      FROM credit_reservation reservation
      LEFT JOIN credit_reservation_grant allocation
        ON allocation.reservation_id = reservation.id
      GROUP BY reservation.id
    ), active_reserved_totals AS (
      SELECT allocation.grant_id,
        COALESCE(sum(allocation.credits), 0)::int AS credits
      FROM credit_reservation_grant allocation
      JOIN credit_reservation reservation
        ON reservation.id = allocation.reservation_id
      WHERE reservation.status = 'active'
      GROUP BY allocation.grant_id
    ), terminal_evidence AS (
      SELECT reservation.id AS reservation_id,
        count(ledger_txn.id)::int AS total,
        count(*) FILTER (WHERE ledger_txn.type = 'consume')::int AS consumes,
        count(*) FILTER (WHERE ledger_txn.type = 'release')::int AS releases,
        count(*) FILTER (WHERE ledger_txn.type = 'refund')::int AS refunds,
        COALESCE(
          bool_and(
            ledger_txn.user_id = reservation.user_id
            AND ledger_txn.credits = reservation.credits
            AND ledger_txn.source_id IS NOT DISTINCT FROM reservation.session_id::text
            AND ledger_txn.grant_id IS NULL
            AND ledger_txn.balance_after IS NULL
            AND ledger_txn.metadata = jsonb_build_object(
              'allocations', reservation.allocation_metadata
            )
          ) FILTER (WHERE ledger_txn.id IS NOT NULL),
          true
        ) AS canonical
      FROM reservation_evidence reservation
      LEFT JOIN credit_transaction ledger_txn
        ON ledger_txn.reservation_id = reservation.id
        AND ledger_txn.type IN ('consume', 'release', 'refund')
      GROUP BY reservation.id, reservation.user_id, reservation.credits,
        reservation.session_id, reservation.allocation_metadata
    )
    SELECT
      (
        SELECT count(*)::int
        FROM credit_grant grant_row
        WHERE grant_row.source <> 'rollover'
          AND NOT (
            (SELECT count(*)
             FROM credit_transaction ledger_txn
             WHERE ledger_txn.grant_id = grant_row.id
               AND ledger_txn.type = 'grant') = 1
            AND
            (SELECT count(*)
            FROM credit_transaction ledger_txn
            WHERE ledger_txn.grant_id = grant_row.id
              AND ledger_txn.reservation_id IS NULL
              AND ledger_txn.type = 'grant'
              AND ledger_txn.idempotency_key =
                grant_row.idempotency_key || ':grant'
              AND ledger_txn.user_id = grant_row.user_id
              AND ledger_txn.credits = grant_row.original_credits
              AND ledger_txn.source_id IS NOT DISTINCT FROM grant_row.source_id
              AND ledger_txn.balance_after = grant_row.original_credits
              AND CASE
                WHEN grant_row.source = 'subscription_renewal'
                  AND ledger_txn.metadata ?
                    '__meelni_subscription_renewal_completion'
                THEN
                  ledger_txn.metadata -
                    '__meelni_subscription_renewal_completion'
                    = COALESCE(grant_row.metadata, '{}'::jsonb)
                ELSE ledger_txn.metadata IS NOT DISTINCT FROM grant_row.metadata
              END
            ) = 1
          )
      ) AS grant_evidence_mismatches,
      (
        SELECT count(*)::int
        FROM reservation_evidence reservation
        WHERE reservation.status = 'active'
          AND reservation.allocated_credits < reservation.credits
      ) AS empty_or_partial_active_reservations,
      (
        SELECT count(*)::int
        FROM reservation_evidence reservation
        WHERE reservation.allocated_credits <> reservation.credits
      ) AS allocation_total_mismatches,
      (
        SELECT count(*)::int
        FROM credit_reservation_grant allocation
        JOIN credit_reservation reservation
          ON reservation.id = allocation.reservation_id
        JOIN credit_grant grant_row ON grant_row.id = allocation.grant_id
        WHERE NOT (
          (SELECT count(*) FROM credit_transaction ledger_txn
           WHERE ledger_txn.reservation_id = allocation.reservation_id
             AND ledger_txn.grant_id = allocation.grant_id
             AND ledger_txn.type = 'reserve') = 1
          AND
          (SELECT count(*)
          FROM credit_transaction ledger_txn
          WHERE ledger_txn.reservation_id = allocation.reservation_id
            AND ledger_txn.grant_id = allocation.grant_id
            AND ledger_txn.type = 'reserve'
            AND ledger_txn.user_id = reservation.user_id
            AND ledger_txn.credits = allocation.credits
            AND ledger_txn.idempotency_key =
              'reserve:' || reservation.reservation_key || ':' || allocation.grant_id
            AND ledger_txn.source_id IS NOT DISTINCT FROM reservation.session_id::text
            AND ledger_txn.balance_after IS NOT NULL
            AND ledger_txn.balance_after >= 0
            AND ledger_txn.balance_after + ledger_txn.credits
              <= grant_row.original_credits
            AND ledger_txn.metadata IS NOT DISTINCT FROM reservation.metadata
          ) = 1
        )
      ) AS allocation_reserve_evidence_mismatches,
      (
        SELECT count(*)::int
        FROM credit_transaction ledger_txn
        WHERE ledger_txn.type = 'reserve'
          AND NOT EXISTS (
            SELECT 1
            FROM credit_reservation_grant allocation
            JOIN credit_reservation reservation
              ON reservation.id = allocation.reservation_id
            JOIN credit_grant grant_row ON grant_row.id = allocation.grant_id
            WHERE allocation.reservation_id = ledger_txn.reservation_id
              AND allocation.grant_id = ledger_txn.grant_id
              AND ledger_txn.user_id = reservation.user_id
              AND ledger_txn.credits = allocation.credits
              AND ledger_txn.idempotency_key =
                'reserve:' || reservation.reservation_key || ':' || allocation.grant_id
              AND ledger_txn.source_id IS NOT DISTINCT FROM reservation.session_id::text
              AND ledger_txn.balance_after IS NOT NULL
              AND ledger_txn.balance_after >= 0
              AND ledger_txn.balance_after + ledger_txn.credits
                <= grant_row.original_credits
              AND ledger_txn.metadata IS NOT DISTINCT FROM reservation.metadata
          )
      ) AS orphan_or_mismatched_reserve_transactions,
      (
        SELECT count(*)::int
        FROM reservation_evidence reservation
        JOIN terminal_evidence terminal
          ON terminal.reservation_id = reservation.id
        WHERE NOT CASE reservation.status
          WHEN 'active' THEN terminal.total = 0
          WHEN 'expired' THEN terminal.total = 0
          WHEN 'consumed' THEN
            terminal.total = 1 AND terminal.consumes = 1
              AND terminal.canonical
          WHEN 'released' THEN
            terminal.total = 1 AND terminal.releases = 1
              AND terminal.canonical
          WHEN 'refunded' THEN
            terminal.total = 2 AND terminal.consumes = 1
              AND terminal.refunds = 1 AND terminal.canonical
          ELSE false
        END
      ) AS terminal_evidence_mismatches,
      (
        SELECT count(*)::int
        FROM credit_grant grant_row
        LEFT JOIN active_reserved_totals active
          ON active.grant_id = grant_row.id
        WHERE grant_row.reserved_credits <> COALESCE(active.credits, 0)
      ) AS reserved_balance_mismatches,
      (
        SELECT count(*)::int
        FROM credit_grant grant_row
        WHERE grant_row.source = 'rollover'
          AND NOT (
            grant_row.expires_at IS NOT NULL
            AND grant_row.expires_at BETWEEN
              grant_row.created_at + interval '59 days 23 hours'
              AND grant_row.created_at + interval '60 days 1 hour'
            AND
            (SELECT count(*) FROM credit_transaction destination
             WHERE destination.grant_id = grant_row.id
               AND destination.type = 'rollover') = 1
            AND
            (SELECT count(*) FROM credit_transaction destination
             WHERE destination.grant_id = grant_row.id
               AND destination.reservation_id IS NULL
               AND destination.type = 'rollover'
               AND destination.idempotency_key =
                 grant_row.idempotency_key || ':grant'
               AND destination.user_id = grant_row.user_id
               AND destination.credits = grant_row.original_credits
               AND destination.source_id IS NOT DISTINCT FROM grant_row.source_id
               AND destination.balance_after = grant_row.original_credits
               AND destination.metadata IS NOT DISTINCT FROM grant_row.metadata) = 1
            AND
            (SELECT count(*) FROM credit_transaction source_txn
             WHERE source_txn.type = 'rollover'
               AND source_txn.metadata->>'rolloverGrantId' = grant_row.id::text) > 0
            AND
            (SELECT COALESCE(sum(source_txn.credits), 0)
             FROM credit_transaction source_txn
             WHERE source_txn.type = 'rollover'
               AND source_txn.metadata->>'rolloverGrantId' = grant_row.id::text)
              = grant_row.original_credits
            AND NOT EXISTS (
              SELECT 1
              FROM credit_transaction source_txn
              LEFT JOIN credit_grant source_grant
                ON source_grant.id = source_txn.grant_id
              WHERE source_txn.type = 'rollover'
                AND source_txn.metadata->>'rolloverGrantId' = grant_row.id::text
                AND NOT (
                  source_txn.user_id = grant_row.user_id
                  AND source_grant.user_id = grant_row.user_id
                  AND source_grant.id <> grant_row.id
                  AND source_grant.catalog_id = grant_row.catalog_id
                  AND source_grant.rollover_eligible
                  AND source_txn.reservation_id IS NULL
                  AND source_txn.idempotency_key =
                    grant_row.idempotency_key || ':source:' || source_grant.id
                  AND source_txn.source_id IS NOT DISTINCT FROM grant_row.source_id
                  AND source_txn.credits > 0
                  AND source_txn.credits <= source_grant.original_credits
                  AND source_txn.balance_after IS NOT NULL
                  AND source_txn.balance_after >= 0
                  AND source_txn.balance_after + source_txn.credits
                    <= source_grant.original_credits
                  AND source_txn.metadata =
                    jsonb_build_object('rolloverGrantId', grant_row.id)
                )
            )
            AND EXISTS (
              SELECT 1
              FROM credit_transaction source_txn
              WHERE source_txn.type = 'rollover'
                AND source_txn.metadata->>'rolloverGrantId' = grant_row.id::text
                AND source_txn.grant_id = grant_row.rollover_source_grant_id
            )
          )
      ) AS rollover_evidence_mismatches,
      (
        SELECT count(*)::int
        FROM credit_transaction ledger_txn
        WHERE ledger_txn.type = 'rollover'
          AND NOT (
            EXISTS (
              SELECT 1 FROM credit_grant destination
              WHERE destination.id = ledger_txn.grant_id
                AND destination.source = 'rollover'
                AND ledger_txn.reservation_id IS NULL
                AND ledger_txn.user_id = destination.user_id
                AND ledger_txn.idempotency_key =
                  destination.idempotency_key || ':grant'
                AND ledger_txn.credits = destination.original_credits
                AND ledger_txn.source_id IS NOT DISTINCT FROM destination.source_id
                AND ledger_txn.balance_after = destination.original_credits
                AND ledger_txn.metadata IS NOT DISTINCT FROM destination.metadata
            )
            OR EXISTS (
              SELECT 1
              FROM credit_grant destination
              JOIN credit_grant source_grant ON source_grant.id = ledger_txn.grant_id
              WHERE destination.source = 'rollover'
                AND ledger_txn.metadata =
                  jsonb_build_object('rolloverGrantId', destination.id)
                AND ledger_txn.reservation_id IS NULL
                AND ledger_txn.user_id = destination.user_id
                AND source_grant.user_id = destination.user_id
                AND source_grant.id <> destination.id
                AND source_grant.catalog_id = destination.catalog_id
                AND source_grant.rollover_eligible
                AND ledger_txn.idempotency_key =
                  destination.idempotency_key || ':source:' || source_grant.id
                AND ledger_txn.source_id IS NOT DISTINCT FROM destination.source_id
                AND ledger_txn.credits > 0
                AND ledger_txn.credits <= source_grant.original_credits
                AND ledger_txn.balance_after IS NOT NULL
                AND ledger_txn.balance_after >= 0
                AND ledger_txn.balance_after + ledger_txn.credits
                  <= source_grant.original_credits
            )
          )
      ) AS orphan_or_mismatched_rollover_transactions,
      (
        SELECT count(*)::int
        FROM credit_grant rollover
        WHERE rollover.source = 'rollover'
          AND NOT (
            EXISTS (
              SELECT 1
              FROM credit_grant renewal
              JOIN credit_transaction grant_txn
                ON grant_txn.grant_id = renewal.id
                AND grant_txn.type = 'grant'
              WHERE renewal.user_id = rollover.user_id
                AND renewal.source = 'subscription_renewal'
                AND grant_txn.metadata #>>
                  '{__meelni_subscription_renewal_completion,rolloverGrantId}'
                    = rollover.id::text
                AND grant_txn.metadata #>>
                  '{__meelni_subscription_renewal_completion,rolloverIdempotencyKey}'
                    = rollover.idempotency_key
            )
            OR EXISTS (
              SELECT 1
              FROM credit_grant renewal
              JOIN credit_transaction grant_txn
                ON grant_txn.grant_id = renewal.id
                AND grant_txn.type = 'grant'
              WHERE renewal.user_id = rollover.user_id
                AND renewal.catalog_id = rollover.catalog_id
                AND renewal.source = 'subscription_renewal'
                AND renewal.source_id IS NOT DISTINCT FROM rollover.source_id
                AND NOT (grant_txn.metadata ?
                  '__meelni_subscription_renewal_completion')
            )
          )
      ) AS orphan_rollover_grants,
      (
        SELECT count(*)::int
        FROM credit_grant renewal
        JOIN credit_transaction grant_txn
          ON grant_txn.grant_id = renewal.id AND grant_txn.type = 'grant'
        WHERE renewal.source = 'subscription_renewal'
          AND grant_txn.metadata ?
            '__meelni_subscription_renewal_completion'
          AND NOT CASE
            WHEN jsonb_typeof(
              grant_txn.metadata->
                '__meelni_subscription_renewal_completion'
            ) = 'object'
              AND jsonb_typeof(
                grant_txn.metadata->
                  '__meelni_subscription_renewal_completion'->'version'
              ) = 'number'
              AND grant_txn.metadata #>>
                '{__meelni_subscription_renewal_completion,version}' = '1'
              AND jsonb_typeof(
                grant_txn.metadata->
                  '__meelni_subscription_renewal_completion'->
                    'rolloverIdempotencyKey'
              ) = 'string'
              AND jsonb_typeof(
                grant_txn.metadata->
                  '__meelni_subscription_renewal_completion'->'rolledCredits'
              ) = 'number'
              AND grant_txn.metadata #>>
                '{__meelni_subscription_renewal_completion,rolledCredits}'
                ~ '^[0-9]+$'
              AND jsonb_typeof(
                grant_txn.metadata->
                  '__meelni_subscription_renewal_completion'->'sourceAllocations'
              ) = 'array'
            THEN CASE
              WHEN (grant_txn.metadata #>>
                '{__meelni_subscription_renewal_completion,rolledCredits}')::numeric = 0
              THEN grant_txn.metadata #>
                '{__meelni_subscription_renewal_completion,rolloverGrantId}'
                  = 'null'::jsonb
                AND grant_txn.metadata #>
                  '{__meelni_subscription_renewal_completion,rolloverExpiresAt}'
                    = 'null'::jsonb
                AND grant_txn.metadata #>
                  '{__meelni_subscription_renewal_completion,rolloverSourceGrantId}'
                    = 'null'::jsonb
                AND grant_txn.metadata #>
                  '{__meelni_subscription_renewal_completion,sourceAllocations}'
                    = '[]'::jsonb
                AND NOT EXISTS (
                  SELECT 1 FROM credit_grant rollover
                  WHERE rollover.user_id = renewal.user_id
                    AND rollover.source = 'rollover'
                    AND rollover.idempotency_key = grant_txn.metadata #>>
                      '{__meelni_subscription_renewal_completion,rolloverIdempotencyKey}'
                )
              ELSE jsonb_typeof(
                grant_txn.metadata->
                  '__meelni_subscription_renewal_completion'->'rolloverGrantId'
              ) = 'string'
                AND jsonb_typeof(
                  grant_txn.metadata->
                    '__meelni_subscription_renewal_completion'->'rolloverExpiresAt'
                ) = 'string'
                AND grant_txn.metadata #>>
                  '{__meelni_subscription_renewal_completion,rolloverExpiresAt}'
                    ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
                AND jsonb_typeof(
                  grant_txn.metadata->
                    '__meelni_subscription_renewal_completion'->'rolloverSourceGrantId'
                ) = 'string'
                AND jsonb_array_length(
                  grant_txn.metadata #>
                    '{__meelni_subscription_renewal_completion,sourceAllocations}'
                ) > 0
                AND NOT EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                    grant_txn.metadata #>
                      '{__meelni_subscription_renewal_completion,sourceAllocations}'
                  ) allocation
                  WHERE jsonb_typeof(allocation) <> 'object'
                    OR jsonb_typeof(allocation->'grantId') <> 'string'
                    OR jsonb_typeof(allocation->'credits') <> 'number'
                    OR allocation->>'credits' !~ '^[1-9][0-9]*$'
                    OR jsonb_typeof(allocation->'balanceAfter') <> 'number'
                    OR allocation->>'balanceAfter' !~ '^[0-9]+$'
                )
                AND EXISTS (
                  SELECT 1 FROM credit_grant rollover
                  WHERE rollover.id::text = grant_txn.metadata #>>
                    '{__meelni_subscription_renewal_completion,rolloverGrantId}'
                    AND rollover.user_id = renewal.user_id
                    AND rollover.source = 'rollover'
                    AND rollover.catalog_id = renewal.catalog_id
                    AND rollover.source_id IS NOT DISTINCT FROM renewal.source_id
                    AND rollover.idempotency_key = grant_txn.metadata #>>
                      '{__meelni_subscription_renewal_completion,rolloverIdempotencyKey}'
                    AND rollover.original_credits =
                      (grant_txn.metadata #>>
                        '{__meelni_subscription_renewal_completion,rolledCredits}')::numeric
                    AND rollover.expires_at =
                      (grant_txn.metadata #>>
                        '{__meelni_subscription_renewal_completion,rolloverExpiresAt}')::timestamptz
                    AND rollover.rollover_source_grant_id::text =
                      grant_txn.metadata #>>
                        '{__meelni_subscription_renewal_completion,rolloverSourceGrantId}'
                    AND grant_txn.metadata #>
                      '{__meelni_subscription_renewal_completion,sourceAllocations}'
                      = (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'grantId', source_txn.grant_id,
                            'credits', source_txn.credits,
                            'balanceAfter', source_txn.balance_after
                          ) ORDER BY source_txn.grant_id
                        )
                        FROM credit_transaction source_txn
                        WHERE source_txn.type = 'rollover'
                          AND source_txn.metadata =
                            jsonb_build_object('rolloverGrantId', rollover.id)
                      )
                )
            END
            ELSE false
          END
      ) AS subscription_renewal_evidence_mismatches,
      (
        (SELECT count(*) FROM credit_reservation_grant allocation
         JOIN credit_reservation reservation
           ON reservation.id = allocation.reservation_id
         JOIN credit_grant grant_row ON grant_row.id = allocation.grant_id
         WHERE reservation.user_id <> grant_row.user_id)
        +
        (SELECT count(*) FROM credit_transaction ledger_txn
         LEFT JOIN credit_grant grant_row ON grant_row.id = ledger_txn.grant_id
         LEFT JOIN credit_reservation reservation
           ON reservation.id = ledger_txn.reservation_id
         WHERE (grant_row.id IS NOT NULL
                AND grant_row.user_id <> ledger_txn.user_id)
            OR (reservation.id IS NOT NULL
                AND reservation.user_id <> ledger_txn.user_id))
        +
        (SELECT count(*) FROM credit_transaction source_txn
         JOIN credit_grant destination
           ON destination.id::text = source_txn.metadata->>'rolloverGrantId'
         WHERE source_txn.type = 'rollover'
           AND destination.user_id <> source_txn.user_id)
      )::int AS cross_user_references
  `;

  return counts ?? emptyCreditLedgerIntegrity();
}

async function expectedMigrations() {
  const migrationRoot = resolve(process.cwd(), "lib/db/migrations");
  const journal = JSON.parse(
    await readFile(resolve(migrationRoot, "meta/_journal.json"), "utf8")
  ) as {
    entries: Array<{ tag: string; when: number }>;
  };

  return Promise.all(
    journal.entries.map(async (entry) => {
      const body = await readFile(
        resolve(migrationRoot, `${entry.tag}.sql`),
        "utf8"
      );
      return {
        when: entry.when,
        hash: createHash("sha256").update(body).digest("hex"),
      };
    })
  );
}
