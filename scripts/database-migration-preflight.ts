import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config } from "dotenv";
import postgres from "postgres";

import {
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
  RELAUNCH_SCHEMA_FINGERPRINT,
  SESSION_LIFECYCLE_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";

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

void run(databaseUrl)
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

async function run(url: string) {
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
      if (![2, 6, 7].includes(migrations.length)) {
        throw new Error(
          `Expected 2 pre-reconciliation, 6 relaunch, or 7 lifecycle migrations; found ${migrations.length}`
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
        }[]
      >`
        SELECT
          to_regclass('public.user_achievement') IS NOT NULL AS achievement,
          to_regclass('public.bookmarked_question') IS NOT NULL AS bookmark,
          to_regclass('public.practice_set_question') IS NOT NULL
            AS practice_set_question
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
        | "session_lifecycle";
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
      } else {
        startingContract = "session_lifecycle";
      }
      if (migrations.length >= 6) {
        if (
          summary.tables !== 23 ||
          summary.rls_tables !== 23 ||
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
            : SESSION_LIFECYCLE_SCHEMA_FINGERPRINT;
        if (schemaFingerprint !== expectedFingerprint) {
          throw new Error(
            "Reconciled database differs from the exact launch schema contract"
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
          : migrations.length === 7
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
        migrationCount: migrations.length,
        startingContract,
        schemaContract:
          migrations.length === 7
            ? SESSION_LIFECYCLE_SCHEMA_FINGERPRINT
            : migrations.length === 6
              ? RELAUNCH_SCHEMA_FINGERPRINT
              : "pending",
        lifecycleBackfill:
          migrations.length === 6
            ? { phase: "preview", counts: lifecycleBackfillCounts }
            : migrations.length === 7
              ? { phase: "applied", counts: lifecycleBackfillCounts }
              : { phase: "not_ready", counts: [] },
        ...summary,
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end();
  }
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
