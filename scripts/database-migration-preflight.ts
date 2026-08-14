import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { config } from "dotenv";
import postgres from "postgres";

import { inspectDatabaseBootstrapState } from "./database-bootstrap-preflight.mjs";
import {
  ANALYTICS_CONSENT_SCHEMA_FINGERPRINT,
  ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT,
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT,
  DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT,
  DURABLE_CONTACT_SCHEMA_FINGERPRINT,
  FEEDBACK_V2_SCHEMA_FINGERPRINT,
  DIMENSION_COVERAGE_SCHEMA_FINGERPRINT,
  PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT,
  PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT,
  FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT,
  VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT,
  SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT,
  RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT,
  QUESTION_PROVENANCE_SCHEMA_FINGERPRINT,
  FOCUSED_PRACTICE_SCHEMA_FINGERPRINT,
  SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  getStableStartDatabaseSchemaContract,
  INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT,
  INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
  RELAUNCH_SCHEMA_FINGERPRINT,
  SESSION_LIFECYCLE_SCHEMA_FINGERPRINT,
  TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT,
  TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT,
  TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT,
  FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT,
  FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT,
  FEEDBACK_QUALITY_SCHEMA_FINGERPRINT,
  RUNTIME_SETTLEMENT_SCHEMA_FINGERPRINT,
  STABLE_START_SCHEMA_FINGERPRINT,
  CREDIT_RECOVERY_SCHEMA_FINGERPRINT,
  BILLING_TRUTH_SCHEMA_FINGERPRINT,
  INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT,
  SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT,
  WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";
import {
  canonicalEnvironmentForEnvFile,
  getSupabaseEnvironmentIdentityPolicy,
} from "./supabase-environment-guard.mjs";

const LEGACY_RUNTIME_SETTLEMENT_MIGRATION_HASH =
  "39a7508699f29fb5ab5619088ca09d900d49f9b5afac9b86e64c0db894b372e2";
const LEGACY_RUNTIME_SETTLEMENT_THROUGH_0022_SCHEMA_FINGERPRINT =
  "ca1f6074c933164b9b26425e8b835123dc14363efe19c03c96829ce5d09aa013";
const LEGACY_RUNTIME_SETTLEMENT_WITH_ANALYTICS_CONSENT_SCHEMA_FINGERPRINT =
  "9fc4bbd34c87e1617110348ce88bbb1c068859a07fdc48ff10c9138d04f92056";
const HISTORICAL_PREVIEW_MIGRATION_HASHES = [
  "4fc47aafade67f243276521d3541261adcbffd084f6c8e3be9eb33abc607b046",
  "1e69634a9abef39e5787369005278f81abf80896ec9318bb86e3eb4b61ed782d",
  "cc11ee565d384af9f5adc65197245dbce92b1a9f408af4874c7d0f0fe405775b",
] as const;
const HISTORICAL_PREVIEW_THROUGH_0025_SCHEMA_FINGERPRINT =
  "8320f3c455a93395c27de612a8e55c57bfddd3ae86a564f5339a9a21d1726290";

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

      const bootstrapState = await inspectDatabaseBootstrapState(tx);
      if (bootstrapState.status === "ready_for_clean_bootstrap") {
        return {
          status: bootstrapState.status,
          connectionMode: "direct_or_session",
          environmentIdentity,
          migrationCount: 0,
          startingContract: "pristine",
          schemaContract: "pending",
          lifecycleBackfill: { phase: "not_ready", counts: [] },
        };
      }

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
      if (
        ![
          2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
          24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        ].includes(migrations.length)
      ) {
        throw new Error(
          `Expected 2 pre-reconciliation through 40 shadow-artifact migrations; found ${migrations.length}`
        );
      }
      const legacyRuntimeSettlementLineage =
        migrations[13]?.hash === LEGACY_RUNTIME_SETTLEMENT_MIGRATION_HASH;
      const historicalPreviewLineage =
        migrations.length >= 26 &&
        HISTORICAL_PREVIEW_MIGRATION_HASHES.every(
          (hash, offset) => migrations[23 + offset]?.hash === hash
        );
      if (
        legacyRuntimeSettlementLineage &&
        ![
          23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
          40,
        ].includes(migrations.length)
      ) {
        throw new Error(
          "Legacy runtime-settlement lineage is supported only through the exact 0022 to 0039 reconciliation states"
        );
      }
      migrations.forEach((migration, index) => {
        const expectedMigration = expected[index];
        const acceptedLegacyRuntimeHash =
          index === 13 &&
          legacyRuntimeSettlementLineage &&
          migration.hash === LEGACY_RUNTIME_SETTLEMENT_MIGRATION_HASH;
        const acceptedHistoricalPreviewHash =
          historicalPreviewLineage &&
          index >= 23 &&
          index <= 25 &&
          migration.hash === HISTORICAL_PREVIEW_MIGRATION_HASHES[index - 23];
        if (
          !expectedMigration ||
          (!acceptedLegacyRuntimeHash &&
            !acceptedHistoricalPreviewHash &&
            migration.hash !== expectedMigration.hash) ||
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
          unsafe_table_owners: number;
          unsupported_tiers: number;
          legacy_premium_trials: number;
          unsafe_policies: number;
          unique_contracts: number;
          server_owned_billing_client_privileges: number;
          server_owned_billing_service_privileges: number;
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
          (SELECT count(*)::int
            FROM pg_class relation
            JOIN pg_namespace namespace
              ON namespace.oid = relation.relnamespace
            LEFT JOIN pg_class anchor
              ON anchor.oid = to_regclass('public.interview_session')
            WHERE namespace.nspname = 'public'
              AND relation.relkind = 'r'
              AND relation.relname IN (
                'transcript_runtime_writer',
                'transcript_runtime_settlement',
                'transcript_evidence_writer_cutoff',
                'transcript_interruption_marker',
                'transcript_turn',
                'public_demo_rate_limit',
                'public_demo_session'
              )
              AND (
                anchor.oid IS NULL OR relation.relowner <> anchor.relowner
              )) AS unsafe_table_owners,
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
              )) AS unique_contracts,
          (SELECT count(*)::int
            FROM information_schema.table_privileges
            WHERE table_schema = 'public'
              AND table_name IN (
                'billing_adjustment',
                'billing_payment_state',
                'credit_rollover_lot',
                'credit_rollover_lot_allocation'
              )
              AND grantee IN ('PUBLIC', 'anon', 'authenticated'))
            AS server_owned_billing_client_privileges,
          (SELECT count(*)::int
            FROM information_schema.table_privileges
            WHERE table_schema = 'public'
              AND table_name IN (
                'billing_adjustment',
                'billing_payment_state',
                'credit_rollover_lot',
                'credit_rollover_lot_allocation'
              )
              AND grantee = 'service_role')
            AS server_owned_billing_service_privileges
      `;

      if (!summaryBase) {
        throw new Error("Database preflight returned no summary");
      }
      const summary = {
        ...summaryBase,
        achievement_duplicates: achievementDuplicates,
        bookmark_duplicates: bookmarkDuplicates,
        practice_set_duplicates: practiceSetDuplicates,
        invoice_status_duplicate_rows:
          migrations.length >= 15
            ? Number(
                (
                  await tx<{ count: number }[]>`
                    SELECT count(*)::int AS count FROM (
                      SELECT id, row_number() OVER (
                        PARTITION BY stripe_invoice_id, status
                        ORDER BY created_at ASC, id ASC
                      ) AS duplicate_rank
                      FROM payment_history
                      WHERE stripe_invoice_id IS NOT NULL
                    ) ranked
                    WHERE duplicate_rank > 1
                  `
                )[0]?.count ?? 0
              )
            : 0,
      };
      const creditLedgerIntegrity = optionalTables.credit_ledger
        ? await getCreditLedgerIntegrity(tx)
        : emptyCreditLedgerIntegrity();
      const stableStartIntegrity =
        migrations.length >= 14
          ? await getStableStartIntegrity(tx, migrations.length >= 15)
          : emptyStableStartIntegrity();
      const stableStartLaunchReady =
        migrations.length >= 15 &&
        Object.values(stableStartIntegrity).every((count) => count === 0);
      const creditRecoveryIntegrity =
        migrations.length >= 16
          ? await getCreditRecoveryIntegrity(tx)
          : { terminal_missing_policy: 0, settled_policy_mismatches: 0 };
      const creditRecoveryLaunchReady =
        migrations.length >= 16 &&
        Object.values(creditRecoveryIntegrity).every((count) => count === 0);
      const billingAdjustmentIntegrity =
        migrations.length >= 17
          ? await getBillingAdjustmentIntegrity(tx)
          : {
              correlation_mismatches: 0,
              incomplete_withdrawal_evidence: 0,
              revoked_grants_without_active_withdrawal: 0,
              payment_state_mismatches: 0,
              payment_state_evidence_mismatches: 0,
              payment_state_marker_mismatches: 0,
              rollover_lot_balance_mismatches: 0,
              rollover_lot_allocation_mismatches: 0,
              rollover_lot_reference_mismatches: 0,
              payment_state_provenance_mismatches: 0,
            };
      const billingAdjustmentLaunchReady =
        migrations.length >= 15 &&
        Object.values(billingAdjustmentIntegrity).every((count) => count === 0);
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
        | "deadline_room_cleanup"
        | "interview_reconnect"
        | "interview_reconnect_db_time"
        | "transcript_ingest"
        | "transcript_privacy"
        | "runtime_settlement"
        | "stable_start"
        | "credit_recovery"
        | "billing_truth"
        | "webhook_convergence"
        | "invoice_convergence"
        | "subscription_resource_convergence"
        | "durable_livekit_deletion"
        | "feedback_v2"
        | "server_owned_billing_privileges"
        | "analytics_consent"
        | "runtime_settlement_reconciliation_required"
        | "runtime_settlement_reconciled"
        | "preview_lineage_reconciliation_required"
        | "public_demo_limits"
        | "question_provenance"
        | "focused_practice_attempts"
        | "durable_contact_submissions"
        | "transcript_watermarks"
        | "feedback_outcomes"
        | "dimension_coverage"
        | "scoreless_focused_practice"
        | "feedback_quality_signals"
        | "public_demo_preview_allowance"
        | "durable_runtime_settlement_command"
        | "feedback_stage_attempt_history"
        | "verified_prefix_partial_scorecards"
        | "shadow_feedback_artifacts";
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
      } else if (migrations.length === 9) {
        startingContract = "deadline_room_cleanup";
      } else if (migrations.length === 10) {
        startingContract = "interview_reconnect";
      } else if (migrations.length === 11) {
        startingContract = "interview_reconnect_db_time";
      } else if (migrations.length === 12) {
        startingContract = "transcript_ingest";
      } else if (migrations.length === 13) {
        startingContract = "transcript_privacy";
      } else if (migrations.length === 14) {
        startingContract = "runtime_settlement";
      } else if (migrations.length === 15) {
        startingContract = "stable_start";
      } else if (migrations.length === 16) {
        startingContract = "credit_recovery";
      } else if (migrations.length === 17) {
        startingContract = "billing_truth";
      } else if (migrations.length === 18) {
        startingContract = "webhook_convergence";
      } else if (migrations.length === 19) {
        startingContract = "invoice_convergence";
      } else if (migrations.length === 20) {
        startingContract = "subscription_resource_convergence";
      } else if (migrations.length === 21) {
        startingContract = "durable_livekit_deletion";
      } else if (migrations.length === 22) {
        startingContract = "feedback_v2";
      } else if (
        legacyRuntimeSettlementLineage &&
        [23, 24].includes(migrations.length)
      ) {
        startingContract = "runtime_settlement_reconciliation_required";
      } else if (migrations.length === 23) {
        startingContract = "server_owned_billing_privileges";
      } else if (migrations.length === 24) {
        startingContract = "analytics_consent";
      } else if (migrations.length === 25) {
        startingContract = "runtime_settlement_reconciled";
      } else if (historicalPreviewLineage && migrations.length === 26) {
        startingContract = "preview_lineage_reconciliation_required";
      } else if (migrations.length === 27) {
        startingContract = "public_demo_limits";
      } else if (migrations.length === 28) {
        startingContract = "question_provenance";
      } else if (migrations.length === 29) {
        startingContract = "focused_practice_attempts";
      } else if (migrations.length === 30) {
        startingContract = "durable_contact_submissions";
      } else if (migrations.length === 31) {
        startingContract = "transcript_watermarks";
      } else if (migrations.length === 32) {
        startingContract = "feedback_outcomes";
      } else if (migrations.length === 33) {
        startingContract = "dimension_coverage";
      } else if (migrations.length === 34) {
        startingContract = "scoreless_focused_practice";
      } else if (migrations.length === 35) {
        startingContract = "feedback_quality_signals";
      } else if (migrations.length === 36) {
        startingContract = "public_demo_preview_allowance";
      } else if (migrations.length === 37) {
        startingContract = "durable_runtime_settlement_command";
      } else if (migrations.length === 38) {
        startingContract = "feedback_stage_attempt_history";
      } else if (migrations.length === 39) {
        startingContract = "verified_prefix_partial_scorecards";
      } else {
        startingContract = "shadow_feedback_artifacts";
      }
      if (migrations.length >= 6) {
        const expectedTableCount =
          migrations.length >= 40
            ? 42
            : migrations.length >= 38
              ? 41
              : migrations.length >= 37
              ? 40
              : migrations.length >= 35
                ? 39
                : migrations.length >= 31
                  ? 37
                  : migrations.length >= 30
                    ? 36
                    : migrations.length >= 29
                      ? 33
                      : migrations.length >= 26
                        ? 32
                        : legacyRuntimeSettlementLineage &&
                            [23, 24].includes(migrations.length)
                          ? 29
                          : migrations.length >= 17
                            ? 30
                            : migrations.length >= 14
                              ? 26
                              : migrations.length === 13
                                ? 24
                                : 23;
        if (
          summary.tables !== expectedTableCount ||
          summary.rls_tables !== expectedTableCount ||
          (!(historicalPreviewLineage && migrations.length === 26) &&
            summary.unsafe_table_owners !== 0) ||
          summary.unsafe_policies !== 0 ||
          summary.unique_contracts !== 3 ||
          (migrations.length >= 23 &&
            (summary.server_owned_billing_client_privileges !== 0 ||
              summary.server_owned_billing_service_privileges !== 28))
        ) {
          throw new Error(
            "Reconciled database does not satisfy the launch schema contract"
          );
        }
        const schemaFingerprint = databaseSchemaFingerprint(
          migrations.length >= 15
            ? await getStableStartDatabaseSchemaContract(tx)
            : await getDatabaseSchemaContract(tx)
        );
        const expectedFingerprint =
          migrations.length === 40
            ? SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT
            : migrations.length === 39
              ? VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT
              : migrations.length === 38
              ? FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT
              : migrations.length === 37
                ? RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT
                : migrations.length === 36
                  ? PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT
                  : migrations.length === 35
                    ? FEEDBACK_QUALITY_SCHEMA_FINGERPRINT
                    : migrations.length === 34
                      ? FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT
                      : migrations.length === 33
                        ? DIMENSION_COVERAGE_SCHEMA_FINGERPRINT
                        : migrations.length === 32
                          ? FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT
                          : migrations.length === 31
                            ? TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT
                            : migrations.length === 30
                              ? DURABLE_CONTACT_SCHEMA_FINGERPRINT
                              : migrations.length === 29
                                ? FOCUSED_PRACTICE_SCHEMA_FINGERPRINT
                                : migrations.length === 28
                                  ? QUESTION_PROVENANCE_SCHEMA_FINGERPRINT
                                  : historicalPreviewLineage &&
                                      migrations.length === 26
                                    ? HISTORICAL_PREVIEW_THROUGH_0025_SCHEMA_FINGERPRINT
                                    : migrations.length >= 26
                                      ? PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT
                                      : legacyRuntimeSettlementLineage &&
                                          migrations.length === 23
                                        ? LEGACY_RUNTIME_SETTLEMENT_THROUGH_0022_SCHEMA_FINGERPRINT
                                        : legacyRuntimeSettlementLineage &&
                                            migrations.length === 24
                                          ? LEGACY_RUNTIME_SETTLEMENT_WITH_ANALYTICS_CONSENT_SCHEMA_FINGERPRINT
                                          : migrations.length >= 24
                                            ? ANALYTICS_CONSENT_SCHEMA_FINGERPRINT
                                            : migrations.length === 6
                                              ? RELAUNCH_SCHEMA_FINGERPRINT
                                              : migrations.length === 7
                                                ? SESSION_LIFECYCLE_SCHEMA_FINGERPRINT
                                                : migrations.length === 8
                                                  ? ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT
                                                  : migrations.length === 9
                                                    ? DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT
                                                    : migrations.length === 10
                                                      ? INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT
                                                      : migrations.length === 11
                                                        ? INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT
                                                        : migrations.length ===
                                                            12
                                                          ? TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT
                                                          : migrations.length ===
                                                              13
                                                            ? TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT
                                                            : migrations.length ===
                                                                14
                                                              ? RUNTIME_SETTLEMENT_SCHEMA_FINGERPRINT
                                                              : migrations.length ===
                                                                  15
                                                                ? STABLE_START_SCHEMA_FINGERPRINT
                                                                : migrations.length ===
                                                                    16
                                                                  ? CREDIT_RECOVERY_SCHEMA_FINGERPRINT
                                                                  : migrations.length ===
                                                                      17
                                                                    ? BILLING_TRUTH_SCHEMA_FINGERPRINT
                                                                    : migrations.length ===
                                                                        18
                                                                      ? WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT
                                                                      : migrations.length ===
                                                                          19
                                                                        ? INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT
                                                                        : migrations.length ===
                                                                            20
                                                                          ? SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT
                                                                          : migrations.length ===
                                                                              21
                                                                            ? DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT
                                                                            : migrations.length ===
                                                                                22
                                                                              ? FEEDBACK_V2_SCHEMA_FINGERPRINT
                                                                              : migrations.length ===
                                                                                  23
                                                                                ? SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT
                                                                                : ANALYTICS_CONSENT_SCHEMA_FINGERPRINT;
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
          historicalPreviewLineage && migrations.length === 26
            ? "preview_lineage_reconciliation_required"
            : legacyRuntimeSettlementLineage &&
                [23, 24].includes(migrations.length)
              ? "runtime_settlement_reconciliation_required"
              : migrations.length === 2
                ? "ready_to_reconcile"
                : migrations.length === 6
                  ? "ready_for_session_lifecycle"
                  : "reconciled",
        connectionMode: "direct_or_session",
        environmentIdentity,
        migrationCount: migrations.length,
        startingContract,
        schemaContract:
          migrations.length === 40
            ? SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT
            : migrations.length === 39
              ? VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT
              : migrations.length === 38
              ? FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT
              : migrations.length === 37
                ? RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT
                : migrations.length === 36
                  ? PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT
                  : migrations.length === 35
                    ? FEEDBACK_QUALITY_SCHEMA_FINGERPRINT
                    : migrations.length === 34
                      ? FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT
                      : migrations.length === 33
                        ? DIMENSION_COVERAGE_SCHEMA_FINGERPRINT
                        : migrations.length === 32
                          ? FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT
                          : migrations.length === 31
                            ? TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT
                            : migrations.length === 30
                              ? DURABLE_CONTACT_SCHEMA_FINGERPRINT
                              : migrations.length === 29
                                ? FOCUSED_PRACTICE_SCHEMA_FINGERPRINT
                                : migrations.length === 28
                                  ? QUESTION_PROVENANCE_SCHEMA_FINGERPRINT
                                  : historicalPreviewLineage &&
                                      migrations.length === 26
                                    ? HISTORICAL_PREVIEW_THROUGH_0025_SCHEMA_FINGERPRINT
                                    : migrations.length >= 26
                                      ? PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT
                                      : legacyRuntimeSettlementLineage &&
                                          migrations.length === 23
                                        ? LEGACY_RUNTIME_SETTLEMENT_THROUGH_0022_SCHEMA_FINGERPRINT
                                        : legacyRuntimeSettlementLineage &&
                                            migrations.length === 24
                                          ? LEGACY_RUNTIME_SETTLEMENT_WITH_ANALYTICS_CONSENT_SCHEMA_FINGERPRINT
                                          : migrations.length >= 24
                                            ? ANALYTICS_CONSENT_SCHEMA_FINGERPRINT
                                            : migrations.length === 23
                                              ? SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT
                                              : migrations.length === 22
                                                ? FEEDBACK_V2_SCHEMA_FINGERPRINT
                                                : migrations.length === 21
                                                  ? DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT
                                                  : migrations.length === 20
                                                    ? SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT
                                                    : migrations.length === 19
                                                      ? INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT
                                                      : migrations.length === 18
                                                        ? WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT
                                                        : migrations.length ===
                                                            17
                                                          ? BILLING_TRUTH_SCHEMA_FINGERPRINT
                                                          : migrations.length ===
                                                              16
                                                            ? CREDIT_RECOVERY_SCHEMA_FINGERPRINT
                                                            : migrations.length ===
                                                                15
                                                              ? STABLE_START_SCHEMA_FINGERPRINT
                                                              : migrations.length ===
                                                                  14
                                                                ? RUNTIME_SETTLEMENT_SCHEMA_FINGERPRINT
                                                                : migrations.length ===
                                                                    13
                                                                  ? TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT
                                                                  : migrations.length ===
                                                                      12
                                                                    ? TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT
                                                                    : migrations.length ===
                                                                        11
                                                                      ? INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT
                                                                      : migrations.length ===
                                                                          10
                                                                        ? INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT
                                                                        : migrations.length ===
                                                                            9
                                                                          ? DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT
                                                                          : migrations.length ===
                                                                              8
                                                                            ? ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT
                                                                            : migrations.length ===
                                                                                7
                                                                              ? SESSION_LIFECYCLE_SCHEMA_FINGERPRINT
                                                                              : migrations.length ===
                                                                                  6
                                                                                ? RELAUNCH_SCHEMA_FINGERPRINT
                                                                                : "pending",
        lifecycleBackfill:
          migrations.length === 6
            ? { phase: "preview", counts: lifecycleBackfillCounts }
            : migrations.length >= 7
              ? { phase: "applied", counts: lifecycleBackfillCounts }
              : { phase: "not_ready", counts: [] },
        creditLedgerIntegrity,
        stableStartIntegrity,
        stableStartLaunchReady,
        creditRecoveryIntegrity,
        creditRecoveryLaunchReady,
        billingAdjustmentIntegrity,
        billingAdjustmentLaunchReady,
        migrationLineage: legacyRuntimeSettlementLineage
          ? "legacy_runtime_settlement"
          : "canonical",
        previewTailLineage: historicalPreviewLineage
          ? "historical_preview"
          : "canonical",
        previewLineageReconciliationPending:
          historicalPreviewLineage && migrations.length === 26,
        runtimeSettlementReconciliationPending:
          legacyRuntimeSettlementLineage &&
          [23, 24].includes(migrations.length),
        ...summary,
      };
    });

    console.log(JSON.stringify(result, null, 2));
    if (process.env.MEELNI_LAUNCH_STRICT === "1") {
      if (!("stableStartLaunchReady" in result)) {
        throw new Error(
          "Clean database bootstrap is not launch ready; apply the canonical migration chain and rerun preflight"
        );
      }
      if (result.migrationCount !== expected.length) {
        throw new Error(
          `Strict launch preflight requires the exact latest migration count ${expected.length}; found ${result.migrationCount}`
        );
      }
      if (
        !result.stableStartLaunchReady ||
        (result.migrationCount >= 14 && !result.creditRecoveryLaunchReady) ||
        (result.migrationCount >= 15 && !result.billingAdjustmentLaunchReady)
      ) {
        throw new Error(
          "Interview credit launch readiness checks are not clean; inspect stableStartIntegrity, creditRecoveryIntegrity, and billingAdjustmentIntegrity"
        );
      }
    }
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

interface StableStartIntegrity {
  legacy_nonterminal_sessions: number;
  legacy_active_reservations: number;
  malformed_or_duplicate_v1_attempts: number;
  cross_user_or_missing_session_correlations: number;
  duplicate_v1_reservations: number;
  duplicate_v1_rooms: number;
  multiple_session_questions: number;
  incomplete_usable_evidence: number;
  invalid_usable_transcript_evidence: number;
  usable_without_consume: number;
  consumed_without_usable: number;
  activated_and_delivered_still_active: number;
  terminal_v1_active_reservations: number;
  non_ready_or_stale_v1_active_reservations: number;
}

function emptyStableStartIntegrity(): StableStartIntegrity {
  return {
    legacy_nonterminal_sessions: 0,
    legacy_active_reservations: 0,
    malformed_or_duplicate_v1_attempts: 0,
    cross_user_or_missing_session_correlations: 0,
    duplicate_v1_reservations: 0,
    duplicate_v1_rooms: 0,
    multiple_session_questions: 0,
    incomplete_usable_evidence: 0,
    invalid_usable_transcript_evidence: 0,
    usable_without_consume: 0,
    consumed_without_usable: 0,
    activated_and_delivered_still_active: 0,
    terminal_v1_active_reservations: 0,
    non_ready_or_stale_v1_active_reservations: 0,
  };
}

async function getStableStartIntegrity(
  tx: postgres.TransactionSql,
  stableStartApplied: boolean
): Promise<StableStartIntegrity> {
  if (!stableStartApplied) {
    const [counts] = await tx<
      {
        legacy_nonterminal_sessions: number;
        legacy_active_reservations: number;
        multiple_session_questions: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM interview_session
          WHERE lifecycle_state NOT IN
            ('completed', 'abandoned', 'failed'))
          AS legacy_nonterminal_sessions,
        (SELECT count(*)::int FROM credit_reservation
          WHERE status = 'active') AS legacy_active_reservations,
        (SELECT count(*)::int FROM (
          SELECT session_id FROM session_question
          GROUP BY session_id HAVING count(*) > 1
        ) duplicate_questions) AS multiple_session_questions
    `;
    return {
      ...emptyStableStartIntegrity(),
      legacy_nonterminal_sessions: Number(
        counts?.legacy_nonterminal_sessions ?? 0
      ),
      legacy_active_reservations: Number(
        counts?.legacy_active_reservations ?? 0
      ),
      multiple_session_questions: Number(
        counts?.multiple_session_questions ?? 0
      ),
    };
  }

  const [counts] = await tx<StableStartIntegrity[]>`
    WITH qualifying_turn AS (
      SELECT session_id, event_id
      FROM transcript_turn
      WHERE contract_version = 2
        AND speaker = 'interviewer'
        AND delivery_state = 'delivered'
        AND event_id IS NOT NULL
        AND text IS NOT NULL
        AND btrim(text) <> ''
    )
    SELECT
      (SELECT count(*)::int FROM interview_session
        WHERE start_contract_version = 0
          AND lifecycle_state NOT IN ('completed', 'abandoned', 'failed'))
        AS legacy_nonterminal_sessions,
      (SELECT count(*)::int FROM credit_reservation
        WHERE start_contract_version = 0 AND status = 'active')
        AS legacy_active_reservations,
      (
        SELECT count(*)::int FROM (
          SELECT id FROM interview_session
          WHERE start_contract_version = 1 AND NOT (
            start_attempt_id IS NOT NULL
            AND id = start_attempt_id
            AND start_request_fingerprint ~ '^[0-9a-f]{64}$'
            AND livekit_room_name = 'interview-' || start_attempt_id::text
          )
          UNION ALL
          SELECT (array_agg(id ORDER BY id))[1] FROM interview_session
          WHERE start_contract_version = 1
          GROUP BY user_id, start_attempt_id HAVING count(*) > 1
        ) malformed_or_duplicate
      ) AS malformed_or_duplicate_v1_attempts,
      (
        SELECT count(*)::int FROM (
          SELECT reservation.id
          FROM credit_reservation reservation
          LEFT JOIN interview_session session
            ON session.id = reservation.session_id
            AND session.user_id = reservation.user_id
            AND session.start_attempt_id = reservation.start_attempt_id
            AND session.start_contract_version = 1
          WHERE reservation.start_contract_version = 1
            AND session.id IS NULL
          UNION ALL
          SELECT question.id
          FROM session_question question
          LEFT JOIN interview_session session
            ON session.id = question.session_id
            AND session.start_attempt_id = question.start_attempt_id
            AND session.start_contract_version = 1
          WHERE question.start_contract_version = 1
            AND session.id IS NULL
        ) invalid_correlations
      ) AS cross_user_or_missing_session_correlations,
      (
        SELECT count(*)::int FROM (
          SELECT user_id, start_attempt_id FROM credit_reservation
          WHERE start_contract_version = 1
          GROUP BY user_id, start_attempt_id HAVING count(*) > 1
        ) duplicates
      ) AS duplicate_v1_reservations,
      (
        SELECT count(*)::int FROM (
          SELECT livekit_room_name FROM interview_session
          WHERE start_contract_version = 1
          GROUP BY livekit_room_name HAVING count(*) > 1
        ) duplicates
      ) AS duplicate_v1_rooms,
      (
        SELECT count(*)::int FROM (
          SELECT session_id FROM session_question
          GROUP BY session_id HAVING count(*) > 1
        ) duplicates
      ) AS multiple_session_questions,
      (SELECT count(*)::int FROM interview_session
        WHERE (usable_at IS NULL) <> (usable_transcript_event_id IS NULL)
          OR (start_contract_version = 0 AND usable_at IS NOT NULL))
        AS incomplete_usable_evidence,
      (SELECT count(*)::int
        FROM interview_session session
        LEFT JOIN qualifying_turn turn
          ON turn.session_id = session.id
          AND turn.event_id = session.usable_transcript_event_id
        WHERE session.usable_at IS NOT NULL AND turn.event_id IS NULL)
        AS invalid_usable_transcript_evidence,
      (SELECT count(*)::int
        FROM interview_session session
        LEFT JOIN credit_reservation reservation
          ON reservation.session_id = session.id
          AND reservation.user_id = session.user_id
          AND reservation.start_attempt_id = session.start_attempt_id
          AND reservation.start_contract_version = 1
        WHERE session.start_contract_version = 1
          AND session.usable_at IS NOT NULL
          AND (
            reservation.status IS NULL OR
            reservation.status NOT IN ('consumed', 'refunded')
          ))
        AS usable_without_consume,
      (SELECT count(*)::int
        FROM credit_reservation reservation
        LEFT JOIN interview_session session
          ON session.id = reservation.session_id
          AND session.user_id = reservation.user_id
          AND session.start_attempt_id = reservation.start_attempt_id
        WHERE reservation.start_contract_version = 1
          AND reservation.status = 'consumed'
          AND session.usable_at IS NULL)
        AS consumed_without_usable,
      (SELECT count(DISTINCT session.id)::int
        FROM interview_session session
        JOIN qualifying_turn turn ON turn.session_id = session.id
        JOIN credit_reservation reservation
          ON reservation.session_id = session.id
          AND reservation.user_id = session.user_id
          AND reservation.start_attempt_id = session.start_attempt_id
          AND reservation.start_contract_version = 1
        WHERE session.start_contract_version = 1
          AND session.activated_at IS NOT NULL
          AND session.usable_at IS NULL
          AND reservation.status = 'active')
        AS activated_and_delivered_still_active,
      (SELECT count(*)::int
        FROM credit_reservation reservation
        JOIN interview_session session
          ON session.id = reservation.session_id
          AND session.user_id = reservation.user_id
          AND session.start_attempt_id = reservation.start_attempt_id
          AND session.start_contract_version = 1
        WHERE reservation.start_contract_version = 1
          AND reservation.status = 'active'
          AND session.lifecycle_state IN ('completed', 'abandoned', 'failed'))
        AS terminal_v1_active_reservations,
      (SELECT count(*)::int
        FROM credit_reservation reservation
        JOIN interview_session session
          ON session.id = reservation.session_id
          AND session.user_id = reservation.user_id
          AND session.start_attempt_id = reservation.start_attempt_id
          AND session.start_contract_version = 1
        WHERE reservation.start_contract_version = 1
          AND reservation.status = 'active'
          AND session.lifecycle_state NOT IN ('completed', 'abandoned', 'failed')
          AND (
            session.provisioning_state <> 'ready'
            OR reservation.expires_at <= now()
          )) AS non_ready_or_stale_v1_active_reservations
  `;

  return counts ?? emptyStableStartIntegrity();
}

async function getCreditRecoveryIntegrity(tx: postgres.TransactionSql) {
  const [counts] = await tx<
    {
      terminal_missing_policy: number;
      settled_policy_mismatches: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int
       FROM interview_session
       WHERE start_contract_version = 1
         AND lifecycle_state IN ('completed', 'abandoned', 'failed')
         AND credit_settled_at IS NULL) AS terminal_missing_policy,
      (SELECT count(*)::int
       FROM interview_session session
       JOIN credit_reservation reservation
         ON reservation.session_id = session.id
        AND reservation.user_id = session.user_id
        AND reservation.start_attempt_id = session.start_attempt_id
        AND reservation.start_contract_version = 1
       WHERE session.start_contract_version = 1
         AND session.credit_settled_at IS NOT NULL
         AND NOT (
           (session.credit_settlement_action = 'release'
             AND reservation.status = 'released') OR
           (session.credit_settlement_action = 'refund'
             AND reservation.status = 'refunded'
             AND session.billing_fault IN ('provider', 'integrity')) OR
           (session.credit_settlement_action = 'retain'
             AND reservation.status = 'consumed'
             AND session.billing_fault = 'user')
         )) AS settled_policy_mismatches
  `;
  return (
    counts ?? {
      terminal_missing_policy: 0,
      settled_policy_mismatches: 0,
    }
  );
}

async function getBillingAdjustmentIntegrity(tx: postgres.TransactionSql) {
  const [counts] = await tx<
    {
      correlation_mismatches: number;
      incomplete_withdrawal_evidence: number;
      revoked_grants_without_active_withdrawal: number;
      payment_state_mismatches: number;
      payment_state_evidence_mismatches: number;
      payment_state_marker_mismatches: number;
      rollover_lot_balance_mismatches: number;
      rollover_lot_allocation_mismatches: number;
      rollover_lot_reference_mismatches: number;
      payment_state_provenance_mismatches: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int
       FROM billing_adjustment adjustment
       LEFT JOIN payment_history payment ON payment.id = adjustment.payment_history_id
       LEFT JOIN credit_grant grant_row ON grant_row.id = adjustment.credit_grant_id
       WHERE (payment.id IS NOT NULL AND payment.user_id <> adjustment.user_id)
          OR (grant_row.id IS NOT NULL AND grant_row.user_id <> adjustment.user_id))
        AS correlation_mismatches,
      (SELECT count(*)::int
       FROM billing_adjustment
       WHERE direction = 'withdraw'
         AND (payment_history_id IS NULL OR credit_grant_id IS NULL))
        AS incomplete_withdrawal_evidence,
      (SELECT count(*)::int
       FROM credit_grant grant_row
       WHERE grant_row.revoked_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM billing_payment_state state
           WHERE state.credit_grant_id = grant_row.id
             AND state.target_credits = state.source_credits
             AND grant_row.revocation_key =
               'payment:' || COALESCE(
                 state.payment_history_id::text,
                 state.credit_grant_id::text
               )
         )) AS revoked_grants_without_active_withdrawal
      ,(SELECT count(*)::int
        FROM billing_payment_state state
        JOIN credit_grant grant_row ON grant_row.id = state.credit_grant_id
        LEFT JOIN payment_history payment ON payment.id = state.payment_history_id
        WHERE state.user_id <> grant_row.user_id
           OR state.source_credits <> grant_row.original_credits
           OR (state.payment_history_id IS NOT NULL AND (
             payment.user_id <> state.user_id
             OR payment.credit_grant_id <> state.credit_grant_id
           ))) AS payment_state_mismatches
      ,(SELECT count(*)::int
        FROM billing_payment_state state
        WHERE state.revoked_credits <>
          COALESCE((
            SELECT sum((entry->>'credits')::int)
            FROM jsonb_array_elements(state.grant_revocations) entry
          ), 0) +
          COALESCE((
            SELECT sum((entry->>'credits')::int)
            FROM jsonb_array_elements(state.allocation_revocations) entry
          ), 0)) AS payment_state_evidence_mismatches
      ,(SELECT count(*)::int
        FROM billing_payment_state state
        JOIN credit_grant grant_row ON grant_row.id = state.credit_grant_id
        WHERE (state.target_credits = state.source_credits) <>
          (grant_row.revoked_at IS NOT NULL)) AS payment_state_marker_mismatches
      ,(SELECT count(*)::int
        FROM credit_grant grant_row
        WHERE grant_row.source = 'rollover'
          AND (
            NOT EXISTS (
              SELECT 1 FROM credit_rollover_lot lot
              WHERE lot.rollover_grant_id = grant_row.id
            )
            OR grant_row.original_credits <> COALESCE((
              SELECT sum(lot.original_credits)
              FROM credit_rollover_lot lot
              WHERE lot.rollover_grant_id = grant_row.id
            ), 0)
            OR grant_row.remaining_credits <> COALESCE((
              SELECT sum(lot.remaining_credits)
              FROM credit_rollover_lot lot
              WHERE lot.rollover_grant_id = grant_row.id
            ), 0)
            OR grant_row.reserved_credits <> COALESCE((
              SELECT sum(lot.reserved_credits)
              FROM credit_rollover_lot lot
              WHERE lot.rollover_grant_id = grant_row.id
            ), 0)
          )) AS rollover_lot_balance_mismatches
      ,(SELECT count(*)::int
        FROM credit_reservation_grant allocation
        JOIN credit_grant grant_row ON grant_row.id = allocation.grant_id
        WHERE grant_row.source = 'rollover'
          AND (
            allocation.credits <> COALESCE((
              SELECT sum(lot_allocation.credits)
              FROM credit_rollover_lot_allocation lot_allocation
              WHERE lot_allocation.reservation_grant_id = allocation.id
            ), 0)
            OR allocation.revoked_credits <> COALESCE((
              SELECT sum(lot_allocation.revoked_credits)
              FROM credit_rollover_lot_allocation lot_allocation
              WHERE lot_allocation.reservation_grant_id = allocation.id
            ), 0)
          )) AS rollover_lot_allocation_mismatches
      ,((SELECT count(*)
        FROM credit_rollover_lot lot
        JOIN credit_grant destination ON destination.id = lot.rollover_grant_id
        JOIN credit_grant source_grant ON source_grant.id = lot.source_grant_id
        WHERE destination.source <> 'rollover'
          OR lot.user_id <> destination.user_id
          OR lot.user_id <> source_grant.user_id
          OR destination.catalog_id <> source_grant.catalog_id
          OR NOT EXISTS (
            SELECT 1 FROM credit_transaction source_txn
            WHERE source_txn.type = 'rollover'
              AND source_txn.grant_id = source_grant.id
              AND source_txn.metadata->>'rolloverGrantId' = destination.id::text
              AND jsonb_typeof(source_txn.metadata->'version') = 'number'
              AND source_txn.metadata->>'version' = '1'
              AND source_txn.metadata->>'expiresAt' =
                to_char(destination.expires_at AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              AND source_txn.metadata->>'issuedAt' =
                to_char((destination.expires_at - interval '60 days')
                  AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              AND source_txn.credits = lot.original_credits
          )) + (SELECT count(*)
        FROM credit_rollover_lot_allocation lot_allocation
        JOIN credit_reservation_grant allocation
          ON allocation.id = lot_allocation.reservation_grant_id
        JOIN credit_rollover_lot lot
          ON lot.id = lot_allocation.rollover_lot_id
        WHERE allocation.grant_id <> lot.rollover_grant_id))::int
          AS rollover_lot_reference_mismatches
      ,((SELECT count(*)
        FROM billing_payment_state state
        CROSS JOIN LATERAL jsonb_array_elements(state.grant_revocations) entry
        LEFT JOIN credit_rollover_lot lot
          ON lot.id::text = entry->>'rolloverLotId'
        WHERE (entry ? 'rolloverLotId' AND (
            lot.id IS NULL
            OR lot.source_grant_id <> state.credit_grant_id
            OR lot.rollover_grant_id::text <> entry->>'grantId'
          )) OR (NOT (entry ? 'rolloverLotId')
            AND entry->>'grantId' <> state.credit_grant_id::text))
        + (SELECT count(*)
        FROM billing_payment_state state
        CROSS JOIN LATERAL
          jsonb_array_elements(state.allocation_revocations) entry
        LEFT JOIN credit_rollover_lot_allocation lot_allocation
          ON lot_allocation.id::text = entry->>'rolloverLotAllocationId'
        LEFT JOIN credit_rollover_lot lot
          ON lot.id = lot_allocation.rollover_lot_id
        WHERE (entry ? 'rolloverLotAllocationId' AND (
            lot_allocation.id IS NULL
            OR lot.source_grant_id <> state.credit_grant_id
            OR lot_allocation.reservation_grant_id::text <>
              entry->>'allocationId'
          )) OR (NOT (entry ? 'rolloverLotAllocationId') AND NOT EXISTS (
            SELECT 1 FROM credit_reservation_grant allocation
            WHERE allocation.id::text = entry->>'allocationId'
              AND allocation.grant_id = state.credit_grant_id
          ))))::int AS payment_state_provenance_mismatches
  `;
  return (
    counts ?? {
      correlation_mismatches: 0,
      incomplete_withdrawal_evidence: 0,
      revoked_grants_without_active_withdrawal: 0,
      payment_state_mismatches: 0,
      payment_state_evidence_mismatches: 0,
      payment_state_marker_mismatches: 0,
      rollover_lot_balance_mismatches: 0,
      rollover_lot_allocation_mismatches: 0,
      rollover_lot_reference_mismatches: 0,
      payment_state_provenance_mismatches: 0,
    }
  );
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
                  AND source_txn.metadata->>'version' = '1'
                  AND jsonb_typeof(source_txn.metadata->'version') = 'number'
                  AND source_txn.metadata->>'expiresAt' =
                    to_char(grant_row.expires_at AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                  AND source_txn.metadata->>'issuedAt' =
                    to_char((grant_row.expires_at - interval '60 days')
                      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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
                AND ledger_txn.metadata->>'rolloverGrantId' = destination.id::text
                AND jsonb_typeof(ledger_txn.metadata->'version') = 'number'
                AND ledger_txn.metadata->>'version' = '1'
                AND ledger_txn.metadata->>'expiresAt' =
                  to_char(destination.expires_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                AND ledger_txn.metadata->>'issuedAt' =
                  to_char((destination.expires_at - interval '60 days')
                    AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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
                          AND source_txn.metadata->>'rolloverGrantId' = rollover.id::text
                          AND jsonb_typeof(source_txn.metadata->'version') = 'number'
                          AND source_txn.metadata->>'version' = '1'
                          AND source_txn.metadata->>'expiresAt' =
                            to_char(rollover.expires_at AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                          AND source_txn.metadata->>'issuedAt' =
                            to_char((rollover.expires_at - interval '60 days')
                              AT TIME ZONE 'UTC',
                              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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
