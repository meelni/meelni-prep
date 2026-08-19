import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import { fileURLToPath } from "node:url";

import { and, eq, ne, sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  buildStripeDeletionSubject,
  buildStripeDeletionSubjects,
  fingerprintStripeSubject,
} from "../lib/billing/stripe-privacy";
import { ACCOUNT_IDENTITY_LOCK_NAMESPACE } from "../lib/db/account-identity-lock";
import { withQuestionSyncLock } from "../lib/db/question-sync-lock";
import {
  compareStripeSubscriptionEventCursors,
  mayApplyStripeSubscriptionResource,
  stripeSubscriptionEventCursor,
} from "../lib/billing/stripe-subscription-event-order";
import { stripeSubscriptionCursorIsNewer } from "../lib/db/stripe-subscription-event-order";
import { subscription } from "../lib/db/schema";

import {
  ANALYTICS_CONSENT_SCHEMA_FINGERPRINT,
  BILLING_TRUTH_SCHEMA_FINGERPRINT,
  databaseSchemaFingerprint,
  CLEAN_0001_SCHEMA_FINGERPRINT,
  DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT,
  DURABLE_CONTACT_SCHEMA_FINGERPRINT,
  DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT,
  DIMENSION_COVERAGE_SCHEMA_FINGERPRINT,
  FEEDBACK_V2_SCHEMA_FINGERPRINT,
  FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT,
  FOCUSED_PRACTICE_SCHEMA_FINGERPRINT,
  FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT,
  FEEDBACK_QUALITY_SCHEMA_FINGERPRINT,
  FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT,
  VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT,
  SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT,
  MANAGED_SERVICE_ROLE_GRANTS_SCHEMA_FINGERPRINT,
  TOTAL_REQUIRED_SCORECARDS_SCHEMA_FINGERPRINT,
  QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT,
  getDatabaseSchemaContract,
  getDatabasePreMigrationContract,
  INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT,
  INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT,
  INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT,
  getStableStartDatabaseSchemaContract,
  SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT,
  LEGACY_RELAUNCH_SCHEMA_FINGERPRINT,
  PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT,
  PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT,
  RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT,
  QUESTION_PROVENANCE_SCHEMA_FINGERPRINT,
  SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT,
  TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT,
  TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT,
  TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT,
  WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT,
} from "./database-schema-contract";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "lib/db/migrations");
const CLEAN_DATABASE = "meelni_clean_test";
const UPGRADE_DATABASE = "meelni_upgrade_test";
const RUNTIME_RECONCILIATION_DATABASE = "meelni_runtime_reconciliation_test";
const PREVIEW_LINEAGE_RECONCILIATION_DATABASE =
  "meelni_preview_lineage_reconciliation_test";
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
const SESSION_DURABLE_COMMAND = "a4420000-0000-4000-8000-000000000442";
const SESSION_EXPIRED_COMMAND = "a4430000-0000-4000-8000-000000000443";
const SESSION_RETIRED_REWARD_GUARD = "abababab-abab-4bab-8bab-abababababab";
const SESSION_REPAIR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_RECONNECT_ORDER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SESSION_PROVIDER_START_FAILURE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SESSION_PROVISIONING_COMPLETE = "a1000000-0000-4000-8000-000000000001";
const SESSION_PROVISIONING_STALE = "a2000000-0000-4000-8000-000000000002";
const SESSION_PRESENCE_RECOVERY = "a3000000-0000-4000-8000-000000000003";
const SESSION_RECONNECT_BACKFILL_GRACE = "a4000000-0000-4000-8000-000000000004";
const SESSION_RECONNECT_BACKFILL_HARD = "a5000000-0000-4000-8000-000000000005";
const SESSION_RECONNECT_BACKFILL_TIE = "a6000000-0000-4000-8000-000000000006";
const SESSION_RECONNECT_BACKFILL_LEGACY =
  "a7000000-0000-4000-8000-000000000007";
const SESSION_DEADLINE_BACKFILL = "cccccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_INSUFFICIENT = "dddddddd-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_USER_END = "eeeeeeee-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_DEADLINE_DISPATCH_RECOVERY =
  "ffffffff-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_CORRUPT_DELETION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_RECREATION_RACE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SESSION_TRANSCRIPT_TWO = "b1000000-0000-4000-8000-000000000001";
const SESSION_TRANSCRIPT_DEADLINE = "b2000000-0000-4000-8000-000000000002";
const SESSION_TRANSCRIPT_DEADLINE_INVALID =
  "b3000000-0000-4000-8000-000000000003";
const SESSION_TRANSCRIPT_MARKER = "b4000000-0000-4000-8000-000000000004";
const SESSION_DELETION_MARKER = "b5000000-0000-4000-8000-000000000005";
const SESSION_RECONNECT_INTEGRITY_MISSING =
  "c1000000-0000-4000-8000-000000000001";
const SESSION_RECONNECT_INTEGRITY_DEGRADED =
  "c2000000-0000-4000-8000-000000000002";
const SESSION_RECONNECT_INTEGRITY_CANDIDATE_INTERRUPTED =
  "c3000000-0000-4000-8000-000000000003";
const SESSION_RECONNECT_INTEGRITY_VALID =
  "c4000000-0000-4000-8000-000000000004";
const SESSION_RECONNECT_INTEGRITY_INTERVIEWER_INTERRUPTED =
  "c6000000-0000-4000-8000-000000000006";
const STABLE_START_ATTEMPT = "f1111111-1111-4111-8111-111111111111";
const STABLE_START_QUESTION = "f2222222-2222-4222-8222-222222222222";
const SESSION_RUNTIME_WRITER_BACKFILL = "c5000000-0000-4000-8000-000000000005";
const FEEDBACK_OUTCOME_BACKFILL_SESSIONS = [
  "d1000000-0000-4000-8000-000000000001",
  "d1000000-0000-4000-8000-000000000002",
  "d1000000-0000-4000-8000-000000000003",
  "d1000000-0000-4000-8000-000000000004",
] as const;
const QUESTION_PROVENANCE_ACTIVE = "f3333333-3333-4333-8333-333333333333";
const QUESTION_PROVENANCE_INACTIVE = "f4444444-4444-4444-8444-444444444444";
const FOCUSED_PRACTICE_USER = "f5000000-0000-4000-8000-000000000001";
const FOCUSED_PRACTICE_OTHER_USER = "f5000000-0000-4000-8000-000000000002";
const FOCUSED_PRACTICE_SESSION = "f5000000-0000-4000-8000-000000000003";
const FOCUSED_PRACTICE_FEEDBACK = "f5000000-0000-4000-8000-000000000004";
const FOCUSED_PRACTICE_ATTEMPT = "f5000000-0000-4000-8000-000000000005";
const FOCUSED_PRACTICE_SCORELESS_SESSION =
  "f5000000-0000-4000-8000-000000000006";
const FOCUSED_PRACTICE_SCORELESS_FEEDBACK =
  "f5000000-0000-4000-8000-000000000007";
const FOCUSED_PRACTICE_SCORELESS_ATTEMPT =
  "f5000000-0000-4000-8000-000000000008";
const CONTACT_DELETE_USER = "12121212-1212-4212-8212-121212121212";
const CONTACT_DELETE_SESSION = "15151515-1515-4515-8515-151515151515";
const CONTACT_WINS_RACE_USER = "16161616-1616-4616-8616-161616161616";
const DELETION_WINS_RACE_USER = "17171717-1717-4717-8717-171717171717";
const FEEDBACK_QUALITY_USER = "18181818-1818-4818-8818-181818181818";
const FEEDBACK_QUALITY_OTHER_USER = "19191919-1919-4919-8919-191919191919";
const FEEDBACK_QUALITY_SESSION = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const FEEDBACK_QUALITY_FEEDBACK = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
const FEEDBACK_QUALITY_DELETION_USER = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c";
const FEEDBACK_QUALITY_DELETION_SESSION =
  "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d";
const FEEDBACK_QUALITY_DELETION_FEEDBACK =
  "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
const FEEDBACK_STAGE_ATTEMPT_USER = "1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f";
const FEEDBACK_STAGE_ATTEMPT_SESSION = "20202020-2020-4020-8020-202020202020";
const FEEDBACK_STAGE_ATTEMPT_FEEDBACK = "21212121-2121-4121-8121-212121212121";
const SHADOW_ARTIFACT_USER = "44500000-0000-4000-8000-000000000001";
const SHADOW_ARTIFACT_SESSION = "44500000-0000-4000-8000-000000000445";
const FEEDBACK_STAGE_ATTEMPT_EVENT = `feedback/generate.requested:${FEEDBACK_STAGE_ATTEMPT_SESSION}:1`;
const FEEDBACK_STAGE_ATTEMPT_FENCE = `v1:${createHash("sha256")
  .update(FEEDBACK_STAGE_ATTEMPT_EVENT)
  .digest("hex")}`;
const CONTACT_TRIAGE_ROLE = "meelni_contact_triage";
const CONTACT_OPERATOR_ONE = `meelni_contact_operator_one_${process.pid}`;
const CONTACT_OPERATOR_TWO = `meelni_contact_operator_two_${process.pid}`;
const CONTACT_OPERATOR_TEST_PASSWORD = randomUUID();

type StripeResourceWinnerRow = {
  stripe_subscription_id: string;
  stripe_resource_created_at: Date | string;
  stripe_resource_created_event_timestamp: Date | string;
  stripe_resource_created_event_id: string;
  retired_stripe_subscription_ids: string[];
  status: string;
  version: number;
};

function databaseTimestamp(value: Date | string): Date {
  const timestamp = value instanceof Date ? value : new Date(value);
  assert.ok(
    Number.isFinite(timestamp.getTime()),
    "database timestamp must normalize to a valid Date"
  );
  return timestamp;
}

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
  await verifyHistoricalPreviewFixtureHashes();
  await verifyLatestSnapshotTypes();
  const cleanUrl = databaseUrl(baseUrl, CLEAN_DATABASE);
  const upgradeUrl = databaseUrl(baseUrl, UPGRADE_DATABASE);
  const runtimeReconciliationUrl = databaseUrl(
    baseUrl,
    RUNTIME_RECONCILIATION_DATABASE
  );
  const previewLineageReconciliationUrl = databaseUrl(
    baseUrl,
    PREVIEW_LINEAGE_RECONCILIATION_DATABASE
  );
  const admin = postgres(baseUrl, { max: 1, prepare: false });
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${CLEAN_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(`CREATE DATABASE "${CLEAN_DATABASE}"`);
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${UPGRADE_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(`CREATE DATABASE "${UPGRADE_DATABASE}"`);
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${RUNTIME_RECONCILIATION_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(`CREATE DATABASE "${RUNTIME_RECONCILIATION_DATABASE}"`);
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${PREVIEW_LINEAGE_RECONCILIATION_DATABASE}" WITH (FORCE)`
  );
  await admin.unsafe(
    `CREATE DATABASE "${PREVIEW_LINEAGE_RECONCILIATION_DATABASE}"`
  );
  const clean = postgres(cleanUrl, { max: 20, prepare: false });

  try {
    await installSupabaseTestSurface(clean);
    await clean`CREATE EXTENSION hstore SCHEMA public`;
    runPreflight(cleanUrl, true, "ready_for_clean_bootstrap");
    await clean`CREATE TABLE public.bootstrap_partial_probe (id integer)`;
    runBlockedBootstrapPreflight(cleanUrl);
    await clean`DROP TABLE public.bootstrap_partial_probe`;
    await clean`
      CREATE FUNCTION public.bootstrap_unexpected_probe()
      RETURNS integer LANGUAGE sql IMMUTABLE AS 'SELECT 1'
    `;
    runBlockedBootstrapPreflight(cleanUrl);
    await clean`DROP FUNCTION public.bootstrap_unexpected_probe()`;
    runPreflight(cleanUrl, true, "ready_for_clean_bootstrap");
    await clean`DROP EXTENSION hstore`;
    runPreflight(cleanUrl, true, "ready_for_clean_bootstrap");
    const pristineStrictPreflight = runStrictPreflight(cleanUrl);
    assert.equal(pristineStrictPreflight.status, 1);
    assert.match(
      pristineStrictPreflight.stderr,
      /Clean database bootstrap is not launch ready/
    );
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
    const latestStrictPreflight = runStrictPreflight(cleanUrl);
    assert.equal(
      latestStrictPreflight.status,
      0,
      `Latest strict preflight failed: ${latestStrictPreflight.stderr || latestStrictPreflight.stdout}`
    );
    await seedAuthorizationFixtures(clean);
    await verifyDatabase(clean);
    await verifyQuestionProvenance(clean, false);
    await verifyFocusedPracticePersistence(clean, cleanUrl, true);
    await verifyFeedbackQualityPersistence(clean, cleanUrl, true);
    await verifyQuestionSyncTransactionAdapter(cleanUrl);
    await verifyQuestionLookupAdapters(cleanUrl);
    await verifyQuestionRankingAdapter(clean, cleanUrl);
    runAnalyticsConsentAdapterVerification(cleanUrl);
    await verifyCleanLifecycleDefaults(clean);
    await verifyLifecycleConcurrency(clean);
    await verifyProviderStartCleanupOwnership(clean, cleanUrl);
    await verifyRoomProvisioningAndPresenceFences(clean, cleanUrl);
    await verifyRoomRecoveryFairness(clean, cleanUrl);
    await verifyReconnectTransportOrdering(clean, cleanUrl);
    await verifyAtomicSessionCompletion(clean, cleanUrl, true);
    await verifyTranscriptIngest(clean, cleanUrl);
    await verifyReconnectTimeoutRuntimeIntegrity(clean, cleanUrl);
    await verifyFeedbackV2VersionTuple(clean);
    await verifyFeedbackProductionDatabaseLifecycle(clean, cleanUrl);
    await verifyAuthorization(clean);
    await verifyStripeSubscriptionOrdering(clean);
    await verifyDeletionWebhookConcurrency(clean, cleanUrl);
    await verifyDeletionTombstone(clean);
    await verifySharedLimiter(clean);
    await verifyDurableContactSubmission(clean, cleanUrl, true);
    await verifyPublicDemoLimits(clean);
    await verifyAtomicCreditLedger(clean, cleanUrl, "clean");
    assertZeroCreditLedgerIntegrity(
      runPreflight(cleanUrl, true, "reconciled")!
    );
    await verifyStableStartContract(clean);
    await verifyStableStartConcurrency(clean, cleanUrl);
    await verifyStableStartQuestionSelectionAuthority(clean, cleanUrl);
    await verifyProviderCreditRecovery(clean, cleanUrl);
    await verifyStableStartNegativePreflight(clean, cleanUrl);
    assertZeroStableStartV1Integrity(
      runPreflight(cleanUrl, true, "reconciled")!
    );
    await verifyShadowFeedbackArtifactPersistence(clean, cleanUrl, true);
    await verifyFeedbackStageAttemptPersistence(clean, true);

    const cleanContract = await getStableStartDatabaseSchemaContract(clean);
    const cleanFingerprint = databaseSchemaFingerprint(cleanContract);
    console.log(`Schema contract fingerprint: ${cleanFingerprint}`);
    assert.equal(cleanFingerprint, QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT);
    const migrationCountBefore = await migrationCount(clean);
    await migrate(drizzle(clean), { migrationsFolder: MIGRATIONS });
    assert.equal(await migrationCount(clean), migrationCountBefore);
    assert.equal(
      databaseSchemaFingerprint(
        await getStableStartDatabaseSchemaContract(clean)
      ),
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
      await seedQuestionProvenanceBackfillFixtures(upgrade);
      const lifecyclePreview = runPreflight(
        upgradeUrl,
        true,
        "ready_for_session_lifecycle"
      );
      assertLegacyCreditLedgerIntegrity(lifecyclePreview!);
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

      await seedDeadlineCleanupBackfillFixture(upgrade);
      const throughDeadlineCleanup = await createMigrationFolderThrough(8);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: throughDeadlineCleanup,
        });
      } finally {
        await rm(throughDeadlineCleanup, { recursive: true, force: true });
      }
      await verifyDeadlineCleanupBackfill(upgrade);
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT
      );

      const reconnectV1Folder = await createMigrationFolderThrough(9);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: reconnectV1Folder,
        });
      } finally {
        await rm(reconnectV1Folder, { recursive: true, force: true });
      }
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT
      );
      await seedReconnectCutoffOwnerFixtures(upgrade);
      const countsBefore = await protectedRowCounts(upgrade);
      const reconnectFinalFolder = await createMigrationFolderThrough(10);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: reconnectFinalFolder,
        });
      } finally {
        await rm(reconnectFinalFolder, { recursive: true, force: true });
      }
      await verifyReconnectCutoffOwnerBackfill(upgrade);
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT
      );

      const transcriptFolder = await createMigrationFolderThrough(11);
      try {
        await migrate(drizzle(upgrade), { migrationsFolder: transcriptFolder });
      } finally {
        await rm(transcriptFolder, { recursive: true, force: true });
      }
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT
      );

      const privacyFolder = await createMigrationFolderThrough(12);
      try {
        await migrate(drizzle(upgrade), { migrationsFolder: privacyFolder });
      } finally {
        await rm(privacyFolder, { recursive: true, force: true });
      }
      assert.equal(
        databaseSchemaFingerprint(await getDatabaseSchemaContract(upgrade)),
        TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT
      );
      assert.deepEqual(await protectedRowCounts(upgrade), countsBefore);

      await seedRuntimeWriterBackfillFixture(upgrade);
      const countsBeforeRuntimeSettlement = await protectedRowCounts(upgrade);
      const billingFolder = await createMigrationFolderThrough(16);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: billingFolder,
        });
      } finally {
        await rm(billingFolder, { recursive: true, force: true });
      }
      await verifyRuntimeWriterBackfill(upgrade);
      const billingPreflight = runPreflight(upgradeUrl, true, "reconciled")!;
      assert.equal(billingPreflight.startingContract, "billing_truth");
      assert.equal(
        billingPreflight.schemaContract,
        BILLING_TRUTH_SCHEMA_FINGERPRINT
      );
      const preInvoiceFolder = await createMigrationFolderThrough(17);
      try {
        await migrate(drizzle(upgrade), {
          migrationsFolder: preInvoiceFolder,
        });
      } finally {
        await rm(preInvoiceFolder, { recursive: true, force: true });
      }
      await seedLegacyInvoiceDuplicateFixtures(upgrade);
      const duplicatePreview = runPreflight(upgradeUrl, true, "reconciled")!;
      assert.equal(
        duplicatePreview.schemaContract,
        WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT
      );
      assert.equal(duplicatePreview.invoice_status_duplicate_rows, 1);
      await seedDivergentLegacyInvoiceDuplicate(upgrade);
      await assert.rejects(
        () => migrate(drizzle(upgrade), { migrationsFolder: MIGRATIONS }),
        /payment_history_invoice_status_financial_conflict/
      );
      await upgrade`
        DELETE FROM payment_history
        WHERE stripe_event_id = 'evt_legacy_invoice_conflict'
      `;
      const rollingContracts = [
        INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT,
        SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT,
        DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT,
        FEEDBACK_V2_SCHEMA_FINGERPRINT,
        SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT,
        ANALYTICS_CONSENT_SCHEMA_FINGERPRINT,
        ANALYTICS_CONSENT_SCHEMA_FINGERPRINT,
        PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT,
        PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT,
        QUESTION_PROVENANCE_SCHEMA_FINGERPRINT,
        FOCUSED_PRACTICE_SCHEMA_FINGERPRINT,
        DURABLE_CONTACT_SCHEMA_FINGERPRINT,
        TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT,
        FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT,
        DIMENSION_COVERAGE_SCHEMA_FINGERPRINT,
        FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT,
        FEEDBACK_QUALITY_SCHEMA_FINGERPRINT,
        PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT,
        RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT,
        FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT,
        VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT,
        SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT,
        MANAGED_SERVICE_ROLE_GRANTS_SCHEMA_FINGERPRINT,
        TOTAL_REQUIRED_SCORECARDS_SCHEMA_FINGERPRINT,
        QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT,
      ];
      let reconnectApplied: MigrationPreflightResult | null = null;
      for (let maxIndex = 18; maxIndex <= 42; maxIndex += 1) {
        const rollingFolder = await createMigrationFolderThrough(maxIndex);
        try {
          await migrate(drizzle(upgrade), {
            migrationsFolder: rollingFolder,
          });
        } finally {
          await rm(rollingFolder, { recursive: true, force: true });
        }
        reconnectApplied = runPreflight(upgradeUrl, true, "reconciled");
        assert.equal(reconnectApplied?.migrationCount, maxIndex + 1);
        assert.equal(
          reconnectApplied?.schemaContract,
          rollingContracts[maxIndex - 18]
        );
        if (maxIndex === 21) {
          const strictRollingPreflight = runStrictPreflight(upgradeUrl);
          assert.equal(strictRollingPreflight.status, 1);
          assert.match(
            `${strictRollingPreflight.stdout}\n${strictRollingPreflight.stderr}`,
            /Strict launch preflight requires the exact latest migration count 43; found 22/
          );
          await upgrade.unsafe(`
            GRANT ALL ON TABLE
              billing_adjustment,
              billing_payment_state,
              credit_rollover_lot,
              credit_rollover_lot_allocation
            TO anon, authenticated, service_role
          `);
        }
        if (maxIndex === 22) {
          await upgrade`
            UPDATE user_settings SET share_anonymous_data = true
          `;
        }
        if (maxIndex === 30) {
          await seedFeedbackOutcomeBackfillFixtures(upgrade);
        }
        if (maxIndex === 31) {
          await verifyFeedbackOutcomeBackfill(upgrade);
          await removeFeedbackOutcomeBackfillFixtures(upgrade);
        }
        if (maxIndex === 39) {
          await upgrade.unsafe(`
            GRANT ALL ON TABLE
              transcript_runtime_settlement_command,
              feedback_generation_stage_attempt,
              shadow_feedback_artifact
            TO service_role
          `);
          assert.notEqual(
            databaseSchemaFingerprint(
              await getStableStartDatabaseSchemaContract(upgrade)
            ),
            MANAGED_SERVICE_ROLE_GRANTS_SCHEMA_FINGERPRINT
          );
        }
      }
      assertLegacyCreditLedgerIntegrity(reconnectApplied!);
      assert.deepEqual(
        await protectedRowCounts(upgrade),
        countsBeforeRuntimeSettlement
      );
      await verifyDatabase(upgrade);
      await verifyShadowFeedbackArtifactPersistence(upgrade, upgradeUrl, false);
      await verifyFeedbackStageAttemptPersistence(upgrade, false);
      await verifyQuestionProvenance(upgrade, true);
      await verifyFocusedPracticePersistence(upgrade, upgradeUrl, false);
      await verifyFeedbackQualityPersistence(upgrade, upgradeUrl, false);
      await verifyLifecycleBackfill(upgrade);
      await verifyAtomicSessionCompletion(upgrade, upgradeUrl, false);
      await verifyTranscriptIngest(upgrade, upgradeUrl);
      await verifyReconnectTimeoutRuntimeIntegrity(upgrade, upgradeUrl);
      await verifyFeedbackV2VersionTuple(upgrade);
      await verifyAuthorization(upgrade);
      await verifyDurableContactSubmission(upgrade, upgradeUrl, false);
      await verifyAtomicCreditLedger(upgrade, upgradeUrl, "upgrade");
      await verifyStableStartContract(upgrade);
      const finalUpgradePreflight = runPreflight(
        upgradeUrl,
        true,
        "reconciled"
      )!;
      assertLegacyCreditLedgerIntegrity(finalUpgradePreflight);
      assertZeroStableStartV1Integrity(finalUpgradePreflight);
      assert.equal(finalUpgradePreflight.invoice_status_duplicate_rows, 0);
      await verifyLegacyInvoiceDuplicateQuarantine(upgrade);
      assert.equal(
        databaseSchemaFingerprint(
          await getStableStartDatabaseSchemaContract(upgrade)
        ),
        cleanFingerprint
      );
    } finally {
      await upgrade.end();
    }

    await verifyRuntimeSettlementReconciliation(runtimeReconciliationUrl);
    await verifyHistoricalPreviewReconciliation(
      previewLineageReconciliationUrl
    );

    console.log("Database migration verification passed.");
  } finally {
    await clean.end();
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${CLEAN_DATABASE}" WITH (FORCE)`
    );
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${UPGRADE_DATABASE}" WITH (FORCE)`
    );
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${RUNTIME_RECONCILIATION_DATABASE}" WITH (FORCE)`
    );
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${PREVIEW_LINEAGE_RECONCILIATION_DATABASE}" WITH (FORCE)`
    );
    await admin.unsafe(`DROP ROLE IF EXISTS ${CONTACT_OPERATOR_ONE}`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${CONTACT_OPERATOR_TWO}`);
    await admin.end();
  }
}

async function verifyHistoricalPreviewReconciliation(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 20, prepare: false });
  const consentUsers = [
    "e1000000-0000-4000-8000-000000000001",
    "e1000000-0000-4000-8000-000000000002",
    "e1000000-0000-4000-8000-000000000003",
  ];
  const historicalDemoSession = "e2000000-0000-4000-8000-000000000001";
  try {
    await installSupabaseTestSurface(sql);
    const historicalFolder = await createHistoricalPreviewMigrationFolder();
    try {
      await migrate(drizzle(sql), { migrationsFolder: historicalFolder });
    } finally {
      await rm(historicalFolder, { recursive: true, force: true });
    }

    assert.equal(await migrationCount(sql), 26);
    const historicalFingerprint = databaseSchemaFingerprint(
      await getStableStartDatabaseSchemaContract(sql)
    );
    console.log(
      `Historical Preview schema fingerprint: ${historicalFingerprint}`
    );
    assert.equal(
      historicalFingerprint,
      "8320f3c455a93395c27de612a8e55c57bfddd3ae86a564f5339a9a21d1726290"
    );
    const historicalPreflight = runPreflight(
      databaseUrl,
      true,
      "preview_lineage_reconciliation_required"
    )!;
    assert.equal(historicalPreflight.previewTailLineage, "historical_preview");
    assert.equal(historicalPreflight.previewLineageReconciliationPending, true);
    assert.equal(
      historicalPreflight.migrationLineage,
      "legacy_runtime_settlement"
    );

    await sql`
      UPDATE drizzle.__drizzle_migrations
      SET hash = 'e7e821c5ad6d29c91c1c72d752b1bd907bd6afa2d31da3ac290bd296acb17047'
      WHERE created_at = 1784277329897
    `;
    runLedgerMismatchPreflight(databaseUrl);
    await assert.rejects(
      () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
      /preview_lineage_reconciliation_unknown_ledger/
    );
    await sql`
      UPDATE drizzle.__drizzle_migrations
      SET hash = '4fc47aafade67f243276521d3541261adcbffd084f6c8e3be9eb33abc607b046'
      WHERE created_at = 1784277329897
    `;

    for (const [index, userId] of consentUsers.entries()) {
      await sql`
        INSERT INTO app_user (id, email)
        VALUES (
          ${userId}::uuid,
          ${`historical-consent-${index}@example.invalid`}
        )
      `;
    }
    await sql`
      INSERT INTO user_settings (
        user_id, analytics_consent, analytics_consent_version,
        analytics_consent_source, analytics_consent_updated_at
      ) VALUES
        (${consentUsers[0]}::uuid, 'undecided', NULL, NULL, NULL),
        (${consentUsers[1]}::uuid, 'accepted', 1, 'banner',
          '2026-07-18T00:00:00Z'::timestamptz),
        (${consentUsers[2]}::uuid, 'declined', 1, 'settings',
          '2026-07-18T00:01:00Z'::timestamptz)
    `;

    const [historicalReservation] = await sql<
      { decision: string; room_name: string }[]
    >`
      SELECT decision, room_name
      FROM public.reserve_public_demo_session(
        ${historicalDemoSession}::uuid,
        'preview',
        ${"c".repeat(64)},
        ${"d".repeat(64)}
      )
    `;
    assert.equal(historicalReservation?.decision, "provision");
    const [oldDeadline] = await sql<
      { created_at: Date | string; active_expires_at: Date | string }[]
    >`
      SELECT created_at, active_expires_at
      FROM public_demo_session
      WHERE id = ${historicalDemoSession}::uuid
    `;
    assert.ok(oldDeadline);
    const historicalDeadlineMs =
      databaseTimestamp(oldDeadline.active_expires_at).getTime() -
      databaseTimestamp(oldDeadline.created_at).getTime();
    assert.ok(historicalDeadlineMs >= 179_000);
    assert.ok(historicalDeadlineMs <= 181_000);

    await assert.rejects(
      () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
      /preview_lineage_reconciliation_active_demo_session/
    );
    assert.equal(await migrationCount(sql), 26);

    await sql`
      UPDATE public_demo_session
      SET status = 'failed',
        active_expires_at = created_at + interval '3 minutes'
      WHERE id = ${historicalDemoSession}::uuid
    `;

    await sql`GRANT SELECT ON public_demo_session TO authenticated`;
    try {
      await assert.rejects(
        () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
        /preview_lineage_reconciliation_shared_contract_mismatch/
      );
      assert.equal(await migrationCount(sql), 26);
    } finally {
      await sql`REVOKE SELECT ON public_demo_session FROM authenticated`;
    }

    await sql`
      GRANT EXECUTE ON FUNCTION prune_public_demo_abuse_data()
      TO service_role WITH GRANT OPTION
    `;
    try {
      await assert.rejects(
        () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
        /preview_lineage_reconciliation_public_demo_acl_mismatch/
      );
      assert.equal(await migrationCount(sql), 26);
    } finally {
      await sql`
        REVOKE GRANT OPTION FOR EXECUTE
        ON FUNCTION prune_public_demo_abuse_data() FROM service_role
      `;
    }

    await sql`
      CREATE POLICY "Preview reconciliation unsafe probe"
      ON public_demo_session FOR SELECT TO authenticated USING (true)
    `;
    try {
      await assert.rejects(
        () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
        /preview_lineage_reconciliation_shared_contract_mismatch/
      );
      assert.equal(await migrationCount(sql), 26);
    } finally {
      await sql`
        DROP POLICY IF EXISTS "Preview reconciliation unsafe probe"
        ON public_demo_session
      `;
    }

    await sql`
      DROP POLICY "Service role has full access to public_demo_session"
      ON public_demo_session
    `;
    await sql`
      CREATE POLICY "Service role has full access to public_demo_session"
      ON public_demo_session AS RESTRICTIVE FOR ALL TO service_role
      USING (true) WITH CHECK (true)
    `;
    try {
      await assert.rejects(
        () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
        /preview_lineage_reconciliation_shared_contract_mismatch/
      );
      assert.equal(await migrationCount(sql), 26);
    } finally {
      await sql`
        DROP POLICY "Service role has full access to public_demo_session"
        ON public_demo_session
      `;
      await sql`
        CREATE POLICY "Service role has full access to public_demo_session"
        ON public_demo_session FOR ALL TO service_role
        USING (true) WITH CHECK (true)
      `;
    }

    await sql`ALTER TABLE public_demo_session FORCE ROW LEVEL SECURITY`;
    try {
      await assert.rejects(
        () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
        /preview_lineage_reconciliation_shared_contract_mismatch/
      );
      assert.equal(await migrationCount(sql), 26);
    } finally {
      await sql`ALTER TABLE public_demo_session NO FORCE ROW LEVEL SECURITY`;
    }

    await sql.unsafe("DROP ROLE IF EXISTS preview_owner_probe");
    await sql`CREATE ROLE preview_owner_probe NOLOGIN`;
    let ledgerBefore: { hash: string; created_at: string }[] = [];
    try {
      await sql`
        ALTER TABLE transcript_runtime_writer OWNER TO preview_owner_probe
      `;
      const ownerDriftPreflight = runPreflight(
        databaseUrl,
        true,
        "preview_lineage_reconciliation_required"
      )!;
      assert.equal(
        ownerDriftPreflight.previewLineageReconciliationPending,
        true
      );

      ledgerBefore = await sql<{ hash: string; created_at: string }[]>`
        SELECT hash, created_at::text
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at
      `;
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
      assert.equal(await migrationCount(sql), 43);
    } finally {
      await sql`
        ALTER TABLE transcript_runtime_writer OWNER TO CURRENT_USER
      `;
      await sql.unsafe("DROP ROLE IF EXISTS preview_owner_probe");
    }
    const ledgerAfter = await sql<{ hash: string; created_at: string }[]>`
      SELECT hash, created_at::text
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at
    `;
    assert.deepEqual(
      Array.from(ledgerAfter.slice(0, 26)),
      Array.from(ledgerBefore)
    );
    const consentRows = await sql<
      {
        analytics_consent: string;
        analytics_consent_revision: number;
        analytics_consent_source: string | null;
      }[]
    >`
      SELECT analytics_consent,
        analytics_consent_revision::int AS analytics_consent_revision,
        analytics_consent_source
      FROM user_settings
      WHERE user_id = ANY(${consentUsers}::uuid[])
      ORDER BY analytics_consent
    `;
    assert.deepEqual(Array.from(consentRows), [
      {
        analytics_consent: "accepted",
        analytics_consent_revision: 1,
        analytics_consent_source: "banner",
      },
      {
        analytics_consent: "declined",
        analytics_consent_revision: 1,
        analytics_consent_source: "settings",
      },
      {
        analytics_consent: "undecided",
        analytics_consent_revision: 0,
        analytics_consent_source: null,
      },
    ]);
    const [reconciledDeadline] = await sql<
      { created_at: Date | string; active_expires_at: Date | string }[]
    >`
      SELECT created_at, active_expires_at
      FROM public_demo_session
      WHERE id = ${historicalDemoSession}::uuid
    `;
    assert.ok(reconciledDeadline);
    assert.equal(
      databaseTimestamp(reconciledDeadline.active_expires_at).getTime() -
        databaseTimestamp(reconciledDeadline.created_at).getTime(),
      120_000
    );
    assert.equal(
      databaseSchemaFingerprint(
        await getStableStartDatabaseSchemaContract(sql)
      ),
      QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT
    );
    const finalPreflight = runPreflight(databaseUrl, true, "reconciled")!;
    assert.equal(finalPreflight.previewTailLineage, "historical_preview");
    assert.equal(finalPreflight.previewLineageReconciliationPending, false);
    const strictPreflight = runStrictPreflight(databaseUrl);
    assert.equal(
      strictPreflight.status,
      0,
      `Historical reconciliation strict preflight failed:\n${strictPreflight.stdout}\n${strictPreflight.stderr}`
    );
    runAnalyticsConsentAdapterVerification(databaseUrl);
    await verifyPublicDemoLimits(sql);
  } finally {
    await sql.end();
  }
}

async function verifyRuntimeSettlementReconciliation(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 4, prepare: false });
  const reconciliationSql = await readFile(
    join(MIGRATIONS, "0024_runtime_settlement_reconciliation.sql"),
    "utf8"
  );
  try {
    await installSupabaseTestSurface(sql);

    const throughTranscriptPrivacy = await createMigrationFolderThrough(12);
    try {
      await migrate(drizzle(sql), {
        migrationsFolder: throughTranscriptPrivacy,
      });
    } finally {
      await rm(throughTranscriptPrivacy, { recursive: true, force: true });
    }

    await seedAuthorizationFixtures(sql);
    await sql`
      UPDATE interview_session
      SET status = 'completed',
        lifecycle_state = 'completed',
        terminal_reason = 'legacy_unknown',
        ending_at = '2026-07-10T05:01:00.000Z'::timestamptz,
        ended_at = '2026-07-10T05:01:00.000Z'::timestamptz
      WHERE id = ${SESSION_ONE}::uuid
    `;
    await sql`
      INSERT INTO transcript_turn (
        session_id, speaker, started_at, ended_at, text, audio_ms, section
      ) VALUES (
        ${SESSION_ONE}::uuid,
        'user',
        '2026-07-10T05:00:00.000Z'::timestamptz,
        '2026-07-10T05:00:01.000Z'::timestamptz,
        'Generic legacy transcript row',
        1000,
        'answer'
      )
    `;

    const legacyThrough0022 =
      await createLegacyRuntimeMigrationFolderThrough(22);
    try {
      await migrate(drizzle(sql), { migrationsFolder: legacyThrough0022 });
    } finally {
      await rm(legacyThrough0022, { recursive: true, force: true });
    }

    const [legacyLedger] = await sql<{ hash: string; created_at: string }[]>`
      SELECT hash, created_at::text
      FROM drizzle.__drizzle_migrations
      WHERE created_at = 1783892420196
    `;
    assert.deepEqual(legacyLedger, {
      hash: "39a7508699f29fb5ab5619088ca09d900d49f9b5afac9b86e64c0db894b372e2",
      created_at: "1783892420196",
    });
    const legacyThrough0022Preflight = runPreflight(
      databaseUrl,
      true,
      "runtime_settlement_reconciliation_required"
    )!;
    assert.equal(legacyThrough0022Preflight.migrationCount, 23);
    assert.equal(legacyThrough0022Preflight.tables, 29);
    assert.equal(legacyThrough0022Preflight.rls_tables, 29);
    assert.equal(
      databaseSchemaFingerprint(
        await getStableStartDatabaseSchemaContract(sql)
      ),
      "ca1f6074c933164b9b26425e8b835123dc14363efe19c03c96829ce5d09aa013"
    );

    const legacyThrough0023 =
      await createLegacyRuntimeMigrationFolderThrough(23);
    try {
      await migrate(drizzle(sql), { migrationsFolder: legacyThrough0023 });
    } finally {
      await rm(legacyThrough0023, { recursive: true, force: true });
    }
    const legacyConsentFingerprint = databaseSchemaFingerprint(
      await getStableStartDatabaseSchemaContract(sql)
    );
    assert.equal(
      legacyConsentFingerprint,
      "9fc4bbd34c87e1617110348ce88bbb1c068859a07fdc48ff10c9138d04f92056"
    );
    const legacyThrough0023Preflight = runPreflight(
      databaseUrl,
      true,
      "runtime_settlement_reconciliation_required"
    )!;
    assert.equal(legacyThrough0023Preflight.migrationCount, 24);
    assert.equal(legacyThrough0023Preflight.tables, 29);
    assert.equal(legacyThrough0023Preflight.rls_tables, 29);
    assert.equal(
      legacyThrough0023Preflight.schemaContract,
      legacyConsentFingerprint
    );

    await sql.unsafe(`DROP ROLE IF EXISTS runtime_owner_probe`);
    await sql.unsafe(`CREATE ROLE runtime_owner_probe NOLOGIN`);
    try {
      await sql.unsafe(
        `ALTER TABLE transcript_turn OWNER TO runtime_owner_probe`
      );
      try {
        await assert.rejects(
          () => sql.unsafe(reconciliationSql),
          /runtime_settlement_reconciliation_unknown_legacy_shape/
        );
        runOwnershipBlockedPreflight(databaseUrl);
      } finally {
        await sql.unsafe(`ALTER TABLE transcript_turn OWNER TO CURRENT_USER`);
      }
    } finally {
      await sql.unsafe(`DROP ROLE IF EXISTS runtime_owner_probe`);
    }

    await sql`
      ALTER TABLE transcript_turn ADD COLUMN writer_generation integer
    `;
    await assert.rejects(
      () => migrate(drizzle(sql), { migrationsFolder: MIGRATIONS }),
      /runtime_settlement_reconciliation_mixed_shape/
    );
    assert.equal(await migrationCount(sql), 24);
    await sql`
      ALTER TABLE transcript_turn DROP COLUMN writer_generation
    `;

    await sql`
      ALTER TABLE transcript_turn
      ALTER COLUMN delivery_state SET DEFAULT 'delivered'
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_unknown_legacy_shape/
    );
    await sql`
      ALTER TABLE transcript_turn ALTER COLUMN delivery_state DROP DEFAULT
    `;

    await sql.unsafe(`
      DROP POLICY "Service role has full access to transcript_interruption_marker"
      ON transcript_interruption_marker
    `);
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_unknown_legacy_shape/
    );
    await sql.unsafe(`
      CREATE POLICY "Service role has full access to transcript_interruption_marker"
      ON transcript_interruption_marker FOR ALL TO service_role
      USING (true) WITH CHECK (true)
    `);

    await sql`
      UPDATE drizzle.__drizzle_migrations
      SET hash = repeat('0', 64)
      WHERE created_at = 1783892420196
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_unknown_ledger/
    );
    await sql`
      UPDATE drizzle.__drizzle_migrations
      SET hash = '39a7508699f29fb5ab5619088ca09d900d49f9b5afac9b86e64c0db894b372e2'
      WHERE created_at = 1783892420196
    `;

    await sql`
      INSERT INTO transcript_runtime_settlement (
        session_id, contract_version, room_name, writer_id, state, settled_at
      ) VALUES (
        ${SESSION_ONE}::uuid, 1, 'legacy-room', 'legacy-writer', 'settled',
        '2026-07-10T05:01:00.000Z'::timestamptz
      )
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_nonempty_legacy_evidence/
    );
    await sql`DELETE FROM transcript_runtime_settlement`;

    const throughRuntimeReconciliation = await createMigrationFolderThrough(24);
    try {
      await migrate(drizzle(sql), {
        migrationsFolder: throughRuntimeReconciliation,
      });
    } finally {
      await rm(throughRuntimeReconciliation, { recursive: true, force: true });
    }

    assert.equal(await migrationCount(sql), 25);
    const reconciliationPreflight = runPreflight(
      databaseUrl,
      true,
      "reconciled"
    )!;
    assert.equal(
      reconciliationPreflight.startingContract,
      "runtime_settlement_reconciled"
    );
    assert.equal(
      reconciliationPreflight.migrationLineage,
      "legacy_runtime_settlement"
    );
    assert.equal(
      reconciliationPreflight.runtimeSettlementReconciliationPending,
      false
    );
    assert.equal(reconciliationPreflight.tables, 30);
    assert.equal(reconciliationPreflight.rls_tables, 30);
    assert.equal(
      databaseSchemaFingerprint(
        await getStableStartDatabaseSchemaContract(sql)
      ),
      ANALYTICS_CONSENT_SCHEMA_FINGERPRINT
    );

    const strictBeforePublicDemo = runStrictPreflight(databaseUrl);
    assert.equal(strictBeforePublicDemo.status, 1);
    assert.match(
      `${strictBeforePublicDemo.stdout}\n${strictBeforePublicDemo.stderr}`,
      /exact latest migration count 43; found 25/
    );

    const genericRows = await sql<
      {
        text: string | null;
        contract_version: number | null;
        writer_generation: number | null;
      }[]
    >`
      SELECT text, contract_version, writer_generation
      FROM transcript_turn
      WHERE session_id = ${SESSION_ONE}::uuid
        AND text = 'Generic legacy transcript row'
    `;
    assert.deepEqual(Array.from(genericRows), [
      {
        text: "Generic legacy transcript row",
        contract_version: null,
        writer_generation: null,
      },
    ]);

    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO public, pg_catalog`);
      const [before] = await tx<{ search_path: string }[]>`
        SELECT current_setting('search_path') AS search_path
      `;
      await tx.unsafe(reconciliationSql);
      const [after] = await tx<{ search_path: string }[]>`
        SELECT current_setting('search_path') AS search_path
      `;
      assert.equal(after?.search_path, before?.search_path);
    });
    assert.equal(await migrationCount(sql), 25);

    await sql.unsafe(`CREATE ROLE runtime_owner_probe NOLOGIN`);
    try {
      await sql.unsafe(
        `ALTER TABLE transcript_runtime_writer OWNER TO runtime_owner_probe`
      );
      try {
        await assert.rejects(
          () => sql.unsafe(reconciliationSql),
          /runtime_settlement_reconciliation_partial_current_shape/
        );
        runOwnershipBlockedPreflight(databaseUrl);
      } finally {
        await sql.unsafe(
          `ALTER TABLE transcript_runtime_writer OWNER TO CURRENT_USER`
        );
      }
    } finally {
      await sql.unsafe(`DROP ROLE IF EXISTS runtime_owner_probe`);
    }

    await sql`
      ALTER TABLE transcript_turn
      ALTER COLUMN writer_generation SET DEFAULT 1
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_partial_current_shape/
    );
    await sql`
      ALTER TABLE transcript_turn
      ALTER COLUMN writer_generation DROP DEFAULT
    `;

    await sql`
      GRANT SELECT ON transcript_runtime_writer TO authenticated
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_partial_current_shape/
    );
    await sql`
      REVOKE SELECT ON transcript_runtime_writer FROM authenticated
    `;

    await sql`DROP INDEX transcript_turn_chronological_idx`;
    await sql`
      CREATE INDEX transcript_turn_chronological_idx
      ON transcript_turn (session_id, started_at)
    `;
    await assert.rejects(
      () => sql.unsafe(reconciliationSql),
      /runtime_settlement_reconciliation_partial_current_shape/
    );
    await sql`DROP INDEX transcript_turn_chronological_idx`;
    await sql`
      CREATE INDEX transcript_turn_chronological_idx ON transcript_turn (
        session_id, started_at, writer_generation, writer_id, sequence,
        event_id, id
      )
    `;
    await sql.unsafe(reconciliationSql);

    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
    assert.equal(await migrationCount(sql), 43);
    const finalPreflight = runPreflight(databaseUrl, true, "reconciled")!;
    assert.equal(finalPreflight.startingContract, "question_ranking_indexes");
    assert.equal(finalPreflight.migrationLineage, "legacy_runtime_settlement");
    assert.equal(finalPreflight.runtimeSettlementReconciliationPending, false);
    assert.equal(finalPreflight.tables, 42);
    assert.equal(finalPreflight.rls_tables, 42);
    assert.equal(
      databaseSchemaFingerprint(
        await getStableStartDatabaseSchemaContract(sql)
      ),
      QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT
    );

    const strictPreflight = runStrictPreflight(databaseUrl);
    assert.equal(
      strictPreflight.status,
      0,
      `Reconciled strict preflight failed:\n${strictPreflight.stdout}\n${strictPreflight.stderr}`
    );
  } finally {
    await sql.end();
  }
}

async function verifyLatestSnapshotTypes() {
  const journal = JSON.parse(
    await readFile(join(ROOT, "lib/db/migrations/meta/_journal.json"), "utf8")
  ) as { entries: Array<{ idx: number }> };
  const latestIndex = journal.entries.at(-1)?.idx;
  assert.notEqual(latestIndex, undefined);
  const snapshot = JSON.parse(
    await readFile(
      join(
        ROOT,
        `lib/db/migrations/meta/${String(latestIndex).padStart(4, "0")}_snapshot.json`
      ),
      "utf8"
    )
  ) as {
    tables: Record<string, { columns: Record<string, { type: string }> }>;
  };
  assert.equal(
    snapshot.tables["public.account_deletion_request"].columns.attempts.type,
    "integer"
  );
  assert.equal(
    snapshot.tables["public.user_settings"].columns.analytics_consent_revision
      .type,
    "bigint"
  );
}

async function verifyHistoricalPreviewFixtureHashes() {
  const expected = [
    "4fc47aafade67f243276521d3541261adcbffd084f6c8e3be9eb33abc607b046",
    "1e69634a9abef39e5787369005278f81abf80896ec9318bb86e3eb4b61ed782d",
    "cc11ee565d384af9f5adc65197245dbce92b1a9f408af4874c7d0f0fe405775b",
  ];
  for (const [offset, expectedHash] of expected.entries()) {
    const body = await readFile(
      join(
        ROOT,
        `packages/test-fixtures/database/historical-preview-${String(offset + 23).padStart(4, "0")}.sql`
      )
    );
    assert.equal(createHash("sha256").update(body).digest("hex"), expectedHash);
  }
}

async function seedLegacyInvoiceDuplicateFixtures(sql: postgres.Sql) {
  await sql`
    INSERT INTO payment_history (
      user_id, stripe_invoice_id, stripe_event_id, amount_in_cents,
      currency, status, tier, failure_reason, created_at
    ) VALUES
      (${USER_ONE}::uuid, 'in_legacy_duplicate', 'evt_legacy_invoice_a',
       900, 'usd', 'failed', 'starter', 'Payment failed',
       '2026-07-10T00:00:00.000Z'::timestamptz),
      (${USER_ONE}::uuid, 'in_legacy_duplicate', 'evt_legacy_invoice_b',
       900, 'usd', 'failed', 'starter', 'Payment failed',
       '2026-07-10T00:00:01.000Z'::timestamptz)
  `;
}

async function verifyStripeSubscriptionOrdering(sql: postgres.Sql) {
  const userId = "78787878-7878-4787-8787-787878787878";
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${userId}::uuid, 'stripe-ordering@example.invalid')
  `;
  const database = drizzle(sql);
  type Candidate = {
    type: string;
    id: string;
    status: string;
    gracePeriodEnd: Date | null;
  };
  const failed: Candidate = {
    type: "invoice.payment_failed",
    id: "evt_failed",
    status: "past_due",
    gracePeriodEnd: new Date("2026-07-18T00:00:00.000Z"),
  };
  const updated: Candidate = {
    type: "customer.subscription.updated",
    id: "evt_updated",
    status: "active",
    gracePeriodEnd: null,
  };
  const deleted: Candidate = {
    type: "customer.subscription.deleted",
    id: "evt_deleted",
    status: "canceled",
    gracePeriodEnd: null,
  };
  const samePriorityLow: Candidate = {
    type: "customer.subscription.updated",
    id: "evt_Z",
    status: "paused",
    gracePeriodEnd: null,
  };
  const samePriorityHigh: Candidate = {
    type: "customer.subscription.updated",
    id: "evt_a",
    status: "active",
    gracePeriodEnd: null,
  };
  const apply = async (candidate: Candidate) => {
    const cursor = stripeSubscriptionEventCursor({
      type: candidate.type,
      id: candidate.id,
      created: 1_784_035_200,
    } as never);
    await database
      .update(subscription)
      .set({
        status: candidate.status,
        gracePeriodEnd: candidate.gracePeriodEnd,
        lastEventTimestamp: cursor.createdAt,
        lastEventPriority: cursor.priority,
        lastEventId: cursor.eventId,
      })
      .where(
        and(
          eq(subscription.userId, userId),
          candidate.type.startsWith("invoice.")
            ? ne(subscription.status, "canceled")
            : undefined,
          stripeSubscriptionCursorIsNewer(cursor)
        )
      );
  };
  const reset = async () => {
    await sql`DELETE FROM subscription WHERE user_id = ${userId}::uuid`;
    await sql`
      INSERT INTO subscription (user_id, tier, status)
      VALUES (${userId}::uuid, 'starter', 'active')
    `;
  };
  const permutations = [
    [failed, updated, deleted],
    [failed, deleted, updated],
    [updated, failed, deleted],
    [updated, deleted, failed],
    [deleted, failed, updated],
    [deleted, updated, failed],
  ];
  for (const candidates of permutations) {
    await reset();
    for (const candidate of candidates) await apply(candidate);
    const [row] = await sql<
      Array<{
        status: string;
        grace_period_end: Date | null;
        last_event_id: string;
      }>
    >`
      SELECT status, grace_period_end, last_event_id
      FROM subscription WHERE user_id = ${userId}::uuid
    `;
    assert.deepEqual(row, {
      status: "canceled",
      grace_period_end: null,
      last_event_id: "evt_deleted",
    });
  }
  for (const candidates of [
    [failed, updated],
    [updated, failed],
    [samePriorityLow, samePriorityHigh],
    [samePriorityHigh, samePriorityLow],
  ]) {
    await reset();
    for (const candidate of candidates) await apply(candidate);
    const [row] = await sql<
      Array<{
        status: string;
        grace_period_end: Date | null;
        last_event_id: string;
      }>
    >`
      SELECT status, grace_period_end, last_event_id
      FROM subscription WHERE user_id = ${userId}::uuid
    `;
    assert.deepEqual(row, {
      status: "active",
      grace_period_end: null,
      last_event_id: candidates.includes(samePriorityHigh)
        ? "evt_a"
        : "evt_updated",
    });
  }

  await verifyStripeSubscriptionReplacement(database, sql, userId);
}

async function verifyStripeSubscriptionReplacement(
  database: ReturnType<typeof drizzle>,
  sql: postgres.Sql,
  userId: string
) {
  const created = 1_784_035_200;
  const oldDeletion = stripeSubscriptionEventCursor({
    type: "customer.subscription.deleted",
    id: "evt_old_deleted",
    created,
  } as never);
  const oldCreation = stripeSubscriptionEventCursor({
    type: "customer.subscription.created",
    id: "evt_old_created",
    created: created - 100,
  } as never);
  const replacementCreation = stripeSubscriptionEventCursor({
    type: "customer.subscription.created",
    id: "evt_new_created",
    created,
  } as never);
  const replacementUpdate = stripeSubscriptionEventCursor({
    type: "customer.subscription.updated",
    id: "evt_new_updated",
    created: created + 1,
  } as never);
  const replacementInvoice = stripeSubscriptionEventCursor({
    type: "invoice.payment_succeeded",
    id: "evt_new_invoice",
    created: created + 2,
  } as never);
  const staleOldUpdate = stripeSubscriptionEventCursor({
    type: "customer.subscription.updated",
    id: "evt_old_late",
    created: created + 3,
  } as never);
  const staleOldInvoice = stripeSubscriptionEventCursor({
    type: "invoice.payment_failed",
    id: "evt_old_invoice_late",
    created: created + 4,
  } as never);

  await sql`DELETE FROM subscription WHERE user_id = ${userId}::uuid`;
  await sql`
    INSERT INTO subscription (
      user_id, tier, status, stripe_subscription_id,
      stripe_resource_created_at,
      stripe_resource_created_event_timestamp,
      stripe_resource_created_event_id,
      last_event_timestamp, last_event_priority, last_event_id
    ) VALUES (
      ${userId}::uuid, 'starter', 'canceled', 'sub_old',
      ${oldCreation.createdAt.toISOString()}::timestamptz,
      ${oldCreation.createdAt.toISOString()}::timestamptz,
      ${oldCreation.eventId},
      ${oldDeletion.createdAt.toISOString()}::timestamptz,
      ${oldDeletion.priority}, ${oldDeletion.eventId}
    )
  `;

  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_old",
      currentStatus: "canceled",
      currentResourceProof: {
        resourceCreatedAt: oldCreation.createdAt,
        createdEventCursor: oldCreation,
      },
      retiredResourceIds: [],
      candidateResourceId: "sub_new",
      candidateResourceProof: {
        resourceCreatedAt: replacementCreation.createdAt,
        createdEventCursor: replacementCreation,
      },
      eventType: "customer.subscription.created",
    }),
    true
  );
  assert.ok(
    compareStripeSubscriptionEventCursors(replacementCreation, oldDeletion) < 0
  );

  await database
    .update(subscription)
    .set({
      stripeSubscriptionId: "sub_new",
      stripeResourceCreatedAt: replacementCreation.createdAt,
      stripeResourceCreatedEventTimestamp: replacementCreation.createdAt,
      stripeResourceCreatedEventId: replacementCreation.eventId,
      retiredStripeSubscriptionIds: drizzleSql`array_append(${subscription.retiredStripeSubscriptionIds}, 'sub_old')`,
      status: "trialing",
      lastEventTimestamp: replacementCreation.createdAt,
      lastEventPriority: replacementCreation.priority,
      lastEventId: replacementCreation.eventId,
    })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, "sub_old")
      )
    );

  await database
    .update(subscription)
    .set({
      status: "past_due",
      gracePeriodEnd: new Date("2026-07-20T00:00:00.000Z"),
      lastEventTimestamp: staleOldInvoice.createdAt,
      lastEventPriority: staleOldInvoice.priority,
      lastEventId: staleOldInvoice.eventId,
    })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, "sub_old"),
        stripeSubscriptionCursorIsNewer(staleOldInvoice)
      )
    );

  await database
    .update(subscription)
    .set({
      status: "active",
      lastEventTimestamp: replacementUpdate.createdAt,
      lastEventPriority: replacementUpdate.priority,
      lastEventId: replacementUpdate.eventId,
    })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, "sub_new"),
        stripeSubscriptionCursorIsNewer(replacementUpdate)
      )
    );

  await database
    .update(subscription)
    .set({
      status: "active",
      gracePeriodEnd: null,
      lastEventTimestamp: replacementInvoice.createdAt,
      lastEventPriority: replacementInvoice.priority,
      lastEventId: replacementInvoice.eventId,
    })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, "sub_new"),
        stripeSubscriptionCursorIsNewer(replacementInvoice)
      )
    );

  await database
    .update(subscription)
    .set({
      status: "past_due",
      lastEventTimestamp: staleOldUpdate.createdAt,
      lastEventPriority: staleOldUpdate.priority,
      lastEventId: staleOldUpdate.eventId,
    })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, "sub_old"),
        stripeSubscriptionCursorIsNewer(staleOldUpdate)
      )
    );

  const [row] = await sql<
    Array<{
      stripe_subscription_id: string;
      status: string;
      last_event_id: string;
      retired_stripe_subscription_ids: string[];
    }>
  >`
    SELECT stripe_subscription_id, status, last_event_id,
           retired_stripe_subscription_ids
    FROM subscription
    WHERE user_id = ${userId}::uuid
  `;
  assert.deepEqual(row, {
    stripe_subscription_id: "sub_new",
    status: "active",
    last_event_id: "evt_new_invoice",
    retired_stripe_subscription_ids: ["sub_old"],
  });

  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: "sub_new",
      currentStatus: "canceled",
      currentResourceProof: {
        resourceCreatedAt: replacementCreation.createdAt,
        createdEventCursor: replacementCreation,
      },
      retiredResourceIds: row.retired_stripe_subscription_ids,
      candidateResourceId: "sub_old",
      candidateResourceProof: {
        resourceCreatedAt: oldCreation.createdAt,
        createdEventCursor: oldCreation,
      },
      eventType: "customer.subscription.created",
    }),
    false,
    "a delayed created event for a retired resource must not resurrect it"
  );

  await verifyConcurrentStripeSubscriptionReplacement(
    database,
    sql,
    userId,
    created
  );
}

async function verifyConcurrentStripeSubscriptionReplacement(
  database: ReturnType<typeof drizzle>,
  sql: postgres.Sql,
  userId: string,
  created: number
) {
  await sql`DELETE FROM subscription WHERE user_id = ${userId}::uuid`;
  await sql`
    INSERT INTO subscription (
      user_id, tier, status, stripe_subscription_id, version,
      stripe_resource_created_at,
      stripe_resource_created_event_timestamp,
      stripe_resource_created_event_id
    ) VALUES (
      ${userId}::uuid, 'starter', 'canceled', 'sub_concurrent_old', 1,
      to_timestamp(${created - 100}), to_timestamp(${created - 100}),
      'evt_concurrent_old_created'
    )
  `;

  const candidates = [
    {
      resourceId: "sub_concurrent_a",
      proof: stripeSubscriptionEventCursor({
        type: "customer.subscription.created",
        id: "evt_concurrent_a_created",
        created: created + 1,
      } as never),
    },
    {
      resourceId: "sub_concurrent_b",
      proof: stripeSubscriptionEventCursor({
        type: "customer.subscription.created",
        id: "evt_concurrent_b_created",
        created: created + 2,
      } as never),
    },
  ] as const;
  const replace = (
    candidate: (typeof candidates)[number],
    expectedResourceId: string,
    expectedVersion: number
  ) =>
    database
      .update(subscription)
      .set({
        stripeSubscriptionId: candidate.resourceId,
        status: "active",
        version: expectedVersion + 1,
        stripeResourceCreatedAt: candidate.proof.createdAt,
        stripeResourceCreatedEventTimestamp: candidate.proof.createdAt,
        stripeResourceCreatedEventId: candidate.proof.eventId,
        lastEventTimestamp: candidate.proof.createdAt,
        lastEventPriority: candidate.proof.priority,
        lastEventId: candidate.proof.eventId,
        retiredStripeSubscriptionIds: drizzleSql`array_append(${subscription.retiredStripeSubscriptionIds}, ${expectedResourceId})`,
      })
      .where(
        and(
          eq(subscription.userId, userId),
          eq(subscription.stripeSubscriptionId, expectedResourceId),
          eq(subscription.version, expectedVersion)
        )
      )
      .returning({ id: subscription.id });

  const results = await Promise.all([
    replace(candidates[0], "sub_concurrent_old", 1),
    replace(candidates[1], "sub_concurrent_old", 1),
  ]);
  assert.equal(
    results.filter((result) => result.length === 1).length,
    1,
    "the first CAS round must elect one concurrent resource"
  );

  let [winner] = await sql<Array<StripeResourceWinnerRow>>`
    SELECT stripe_subscription_id, stripe_resource_created_at,
           stripe_resource_created_event_timestamp,
           stripe_resource_created_event_id, retired_stripe_subscription_ids,
           status, version
    FROM subscription WHERE user_id = ${userId}::uuid
  `;
  const loser = candidates.find(
    (candidate) => candidate.resourceId !== winner!.stripe_subscription_id
  )!;
  const loserMaySupersede = mayApplyStripeSubscriptionResource({
    currentResourceId: winner!.stripe_subscription_id,
    currentStatus: winner!.status,
    currentResourceProof: {
      resourceCreatedAt: databaseTimestamp(winner!.stripe_resource_created_at),
      createdEventCursor: {
        createdAt: databaseTimestamp(
          winner!.stripe_resource_created_event_timestamp
        ),
        priority: 30,
        eventId: winner!.stripe_resource_created_event_id,
      },
    },
    retiredResourceIds: winner!.retired_stripe_subscription_ids,
    candidateResourceId: loser.resourceId,
    candidateResourceProof: {
      resourceCreatedAt: loser.proof.createdAt,
      createdEventCursor: loser.proof,
    },
    eventType: "customer.subscription.created",
  });
  if (loserMaySupersede) {
    const retry = await replace(
      loser,
      winner!.stripe_subscription_id,
      winner!.version
    );
    assert.equal(retry.length, 1);
  }

  [winner] = await sql<Array<StripeResourceWinnerRow>>`
    SELECT stripe_subscription_id, stripe_resource_created_at,
           stripe_resource_created_event_timestamp,
           stripe_resource_created_event_id, retired_stripe_subscription_ids,
           status, version
    FROM subscription WHERE user_id = ${userId}::uuid
  `;
  assert.equal(winner!.stripe_subscription_id, "sub_concurrent_b");
  assert.equal(winner!.status, "active");
  assert.ok(
    winner!.retired_stripe_subscription_ids.includes("sub_concurrent_old")
  );
  if (results[0].length === 1) {
    assert.ok(
      winner!.retired_stripe_subscription_ids.includes("sub_concurrent_a")
    );
    assert.equal(winner!.version, 3);
  } else {
    assert.deepEqual(winner!.retired_stripe_subscription_ids, [
      "sub_concurrent_old",
    ]);
    assert.equal(winner!.version, 2);
  }

  assert.equal(
    mayApplyStripeSubscriptionResource({
      currentResourceId: winner!.stripe_subscription_id,
      currentStatus: winner!.status,
      currentResourceProof: {
        resourceCreatedAt: databaseTimestamp(
          winner!.stripe_resource_created_at
        ),
        createdEventCursor: candidates[1].proof,
      },
      retiredResourceIds: winner!.retired_stripe_subscription_ids,
      candidateResourceId: candidates[0].resourceId,
      candidateResourceProof: {
        resourceCreatedAt: candidates[0].proof.createdAt,
        createdEventCursor: candidates[0].proof,
      },
      eventType: "customer.subscription.created",
    }),
    false,
    "the older concurrent candidate must be a no-op after convergence"
  );

  const maximalReplay = await database
    .update(subscription)
    .set({ status: "past_due" })
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.stripeSubscriptionId, candidates[1].resourceId),
        stripeSubscriptionCursorIsNewer(candidates[1].proof)
      )
    )
    .returning({ id: subscription.id });
  assert.equal(maximalReplay.length, 0);
}

async function seedDivergentLegacyInvoiceDuplicate(sql: postgres.Sql) {
  await sql`
    INSERT INTO payment_history (
      user_id, stripe_invoice_id, stripe_event_id, amount_in_cents,
      currency, status, tier, failure_reason, created_at
    ) VALUES (
      ${USER_ONE}::uuid, 'in_legacy_duplicate',
      'evt_legacy_invoice_conflict', 1900, 'usd', 'failed', 'starter',
      'Payment failed', '2026-07-10T00:00:02.000Z'::timestamptz
    )
  `;
}

async function verifyLegacyInvoiceDuplicateQuarantine(sql: postgres.Sql) {
  const rows = await sql<
    Array<{
      stripe_invoice_id: string | null;
      status: string;
      failure_reason: string | null;
    }>
  >`
    SELECT stripe_invoice_id, status, failure_reason
    FROM payment_history
    WHERE stripe_event_id IN ('evt_legacy_invoice_a', 'evt_legacy_invoice_b')
    ORDER BY created_at, id
  `;
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      {
        stripe_invoice_id: "in_legacy_duplicate",
        status: "failed",
        failure_reason: "Payment failed",
      },
      {
        stripe_invoice_id: null,
        status: "canceled",
        failure_reason: "legacy_duplicate_quarantined",
      },
    ]
  );
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
    `CLI migration failed:\n${result.stderr}\n${result.stdout}`
  );
  assert.match(result.stdout, /Database target fingerprint:/);
}

function runOwnershipBlockedPreflight(databaseUrl: string) {
  const result = spawnSync("npm", ["run", "db:preflight"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /Reconciled database does not satisfy the launch schema contract/
  );
}

function runAnalyticsConsentAdapterVerification(databaseUrl: string) {
  const result = spawnSync(
    "npm",
    ["exec", "--", "tsx", "scripts/verify-analytics-consent-adapter.ts"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    }
  );
  assert.equal(
    result.status,
    0,
    `Analytics consent adapter verification failed:\n${result.stderr}\n${result.stdout}`
  );
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

function runBlockedBootstrapPreflight(databaseUrl: string) {
  const result = spawnSync("npm", ["run", "db:preflight"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /public application schema is not empty/);
}

function runLedgerMismatchPreflight(databaseUrl: string) {
  const result = spawnSync("npm", ["run", "db:preflight"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Migration ledger mismatch at position (23|24|25)/
  );
}

function runStrictPreflight(databaseUrl: string) {
  return spawnSync("npm", ["run", "db:preflight"], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      MEELNI_LAUNCH_STRICT: "1",
    },
  });
}

interface MigrationPreflightCount {
  projected_legacy_status: string;
  lifecycle_state: string;
  terminal_reason: string;
  rows: number;
}

interface MigrationPreflightResult {
  migrationCount: number;
  schemaContract: string;
  startingContract: string;
  migrationLineage: "canonical" | "legacy_runtime_settlement";
  previewTailLineage: "canonical" | "historical_preview";
  previewLineageReconciliationPending: boolean;
  runtimeSettlementReconciliationPending: boolean;
  tables: number;
  rls_tables: number;
  invoice_status_duplicate_rows: number;
  lifecycleBackfill: {
    phase: "not_ready" | "preview" | "applied";
    counts: MigrationPreflightCount[];
  };
  creditLedgerIntegrity: CreditLedgerIntegrity;
  stableStartIntegrity: StableStartIntegrity;
  stableStartLaunchReady: boolean;
  creditRecoveryIntegrity: {
    terminal_missing_policy: number;
    settled_policy_mismatches: number;
  };
  creditRecoveryLaunchReady: boolean;
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
    rollover_evidence_mismatches: 2,
    orphan_or_mismatched_rollover_transactions: 2,
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

function assertZeroStableStartV1Integrity(result: MigrationPreflightResult) {
  const {
    legacy_nonterminal_sessions: _legacySessions,
    legacy_active_reservations: _legacyReservations,
    ...versionOneIntegrity
  } = result.stableStartIntegrity;
  void _legacySessions;
  void _legacyReservations;
  assert.ok(
    Object.values(versionOneIntegrity).every((count) => count === 0),
    `Expected version-1 stable-start integrity counts to be zero: ${JSON.stringify(
      result.stableStartIntegrity
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

async function createLegacyRuntimeMigrationFolderThrough(
  maxIndex: number
): Promise<string> {
  assert.ok(maxIndex >= 13);
  const folder = await createMigrationFolderThrough(maxIndex);
  await copyFile(
    join(
      ROOT,
      "packages/test-fixtures/database/legacy-runtime-settlement-0013.sql"
    ),
    join(folder, "0013_runtime_settlement.sql")
  );
  return folder;
}

async function createHistoricalPreviewMigrationFolder(): Promise<string> {
  const folder = await createLegacyRuntimeMigrationFolderThrough(25);
  await Promise.all(
    [23, 24, 25].map((index) =>
      copyFile(
        join(
          ROOT,
          `packages/test-fixtures/database/historical-preview-${String(index).padStart(4, "0")}.sql`
        ),
        join(
          folder,
          [
            "0023_explicit_analytics_consent.sql",
            "0024_runtime_settlement_reconciliation.sql",
            "0025_public_demo_limits.sql",
          ][index - 23]
        )
      )
    )
  );
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

async function seedRuntimeWriterBackfillFixture(sql: postgres.Sql) {
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      livekit_room_name, started_at, activated_at
    ) VALUES (
      ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      'runtime-writer-backfill-room',
      '2026-07-10T05:00:00.000Z'::timestamptz,
      '2026-07-10T05:00:00.000Z'::timestamptz
    )
  `;
  await sql`
    INSERT INTO transcript_turn (
      session_id, contract_version, event_id, writer_id, sequence, room_name,
      speaker, started_at, ended_at, text, audio_ms, section, delivery_state
    ) VALUES
      (
        ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid, 2, 'backfill-a:1',
        'backfill-writer-a', 1, 'runtime-writer-backfill-room', 'user',
        '2026-07-10T05:00:01.000Z'::timestamptz,
        '2026-07-10T05:00:02.000Z'::timestamptz,
        'Legacy rolling-window event A', 1000, 'answer', 'delivered'
      ),
      (
        ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid, 2, 'backfill-b:1',
        'backfill-writer-b', 1, 'runtime-writer-backfill-room', 'interviewer',
        '2026-07-10T05:00:03.000Z'::timestamptz,
        '2026-07-10T05:00:04.000Z'::timestamptz,
        'Legacy rolling-window event B', 1000, 'follow_up', 'delivered'
      )
  `;
  await sql`
    INSERT INTO transcript_interruption_marker (
      session_id, contract_version, event_id, writer_id, sequence, room_name,
      speaker, occurred_at, reason
    ) VALUES (
      ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid, 1, 'backfill-b:2',
      'backfill-writer-b', 2, 'runtime-writer-backfill-room', 'interviewer',
      '2026-07-10T05:00:05.000Z'::timestamptz,
      'no_provider_confirmed_prefix'
    )
  `;
}

async function seedValidTranscriptIntegrityFixture(
  sql: postgres.Sql,
  input: {
    sessionId: string;
    roomName: string;
    writerId: string;
    startedAt: string;
    settledAt: string;
  }
) {
  const startedAt = Date.parse(input.startedAt);
  const at = (offsetMs: number) => new Date(startedAt + offsetMs).toISOString();
  await sql`
    INSERT INTO transcript_runtime_writer (
      session_id, generation, contract_version, room_name, writer_id,
      registered_at, last_observed_sequence, committed_sequence,
      committed_event_id, committed_through_at
    ) VALUES (
      ${input.sessionId}::uuid, 1, 1, ${input.roomName}, ${input.writerId},
      ${input.startedAt}::timestamptz, 5, 5,
      ${`${input.writerId}:5`}, ${at(302_000)}::timestamptz
    )
  `;
  await sql`
    INSERT INTO transcript_turn (
      session_id, contract_version, event_id, writer_id, writer_generation,
      sequence, room_name, speaker, started_at, ended_at, text, audio_ms,
      section, delivery_state
    ) VALUES
      (
        ${input.sessionId}::uuid, 2, ${`${input.writerId}:1`},
        ${input.writerId}, 1, 1, ${input.roomName}, 'user', ${at(0)}::timestamptz,
        ${at(1_000)}::timestamptz,
        'I would begin by clarifying the target customer problem and defining the measurable outcome before considering solutions.',
        1000, 'answer', 'delivered'
      ),
      (
        ${input.sessionId}::uuid, 2, ${`${input.writerId}:2`},
        ${input.writerId}, 1, 2, ${input.roomName}, 'interviewer', ${at(60_000)}::timestamptz,
        ${at(61_000)}::timestamptz,
        'Which customer segment would you prioritize first and why?',
        1000, 'follow_up', 'delivered'
      ),
      (
        ${input.sessionId}::uuid, 2, ${`${input.writerId}:3`},
        ${input.writerId}, 1, 3, ${input.roomName}, 'user', ${at(180_000)}::timestamptz,
        ${at(181_000)}::timestamptz,
        'I would compare reach severity strategic alignment confidence and implementation effort before selecting the first segment.',
        1000, 'answer', 'delivered'
      ),
      (
        ${input.sessionId}::uuid, 2, ${`${input.writerId}:4`},
        ${input.writerId}, 1, 4, ${input.roomName}, 'interviewer', ${at(240_000)}::timestamptz,
        ${at(241_000)}::timestamptz,
        'How would you know whether the product change worked?',
        1000, 'follow_up', 'delivered'
      ),
      (
        ${input.sessionId}::uuid, 2, ${`${input.writerId}:5`},
        ${input.writerId}, 1, 5, ${input.roomName}, 'user', ${at(301_000)}::timestamptz,
        ${at(302_000)}::timestamptz,
        'I would measure retained customer value with adoption quality and operational guardrail metrics explaining movement in the outcome.',
        1000, 'answer', 'delivered'
      )
  `;
  await sql`
    INSERT INTO transcript_runtime_settlement (
      session_id, writer_generation, contract_version, room_name, writer_id,
      state, settled_at
    ) VALUES (
      ${input.sessionId}::uuid, 1, 1, ${input.roomName}, ${input.writerId},
      'settled', ${input.settledAt}::timestamptz
    )
  `;
}

async function verifyRuntimeWriterBackfill(sql: postgres.Sql) {
  const writers = await sql<
    { writer_id: string; generation: number; registered_at: Date }[]
  >`
    SELECT writer_id, generation, registered_at
    FROM transcript_runtime_writer
    WHERE session_id = ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid
    ORDER BY generation
  `;
  assert.deepEqual(
    writers.map(({ writer_id, generation }) => ({ writer_id, generation })),
    [
      { writer_id: "backfill-writer-a", generation: 1 },
      { writer_id: "backfill-writer-b", generation: 2 },
    ]
  );
  const evidence = await sql<
    { writer_id: string; writer_generation: number }[]
  >`
    SELECT writer_id, writer_generation
    FROM transcript_turn
    WHERE session_id = ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid
    UNION ALL
    SELECT writer_id, writer_generation
    FROM transcript_interruption_marker
    WHERE session_id = ${SESSION_RUNTIME_WRITER_BACKFILL}::uuid
    ORDER BY writer_id, writer_generation
  `;
  assert.deepEqual(
    evidence.map(({ writer_id, writer_generation }) => ({
      writer_id,
      writer_generation,
    })),
    [
      { writer_id: "backfill-writer-a", writer_generation: 1 },
      { writer_id: "backfill-writer-b", writer_generation: 2 },
      { writer_id: "backfill-writer-b", writer_generation: 2 },
    ]
  );
}

async function seedReconnectCutoffOwnerFixtures(sql: postgres.Sql) {
  const startedAt = "2026-07-10T08:00:00.000Z";
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, livekit_room_name, config,
      started_at, lifecycle_state, lifecycle_version, reconnect_deadline_at,
      last_transport_event_at, last_transport_event_id,
      last_transport_event_name
    ) VALUES
      (
        ${SESSION_RECONNECT_BACKFILL_GRACE}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'reconnect-backfill-grace-room', '{"duration": 15}'::jsonb,
        ${startedAt}::timestamptz, 'reconnecting', 4,
        ${startedAt}::timestamptz + interval '5 minutes',
        ${startedAt}::timestamptz + interval '4 minutes 30 seconds',
        'backfill-grace-loss', 'participant_left'
      ),
      (
        ${SESSION_RECONNECT_BACKFILL_HARD}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'reconnect-backfill-hard-room', '{"duration": 15}'::jsonb,
        ${startedAt}::timestamptz, 'reconnecting', 5,
        ${startedAt}::timestamptz + interval '15 minutes',
        ${startedAt}::timestamptz + interval '14 minutes 50 seconds',
        'backfill-hard-loss', 'participant_left'
      ),
      (
        ${SESSION_RECONNECT_BACKFILL_TIE}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'reconnect-backfill-tie-room', '{"duration": 45}'::jsonb,
        ${startedAt}::timestamptz, 'reconnecting', 6,
        ${startedAt}::timestamptz + interval '45 minutes',
        ${startedAt}::timestamptz + interval '44 minutes 30 seconds',
        'backfill-tie-loss', 'participant_left'
      ),
      (
        ${SESSION_RECONNECT_BACKFILL_LEGACY}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'reconnect-backfill-legacy-room', '{"duration": "15"}'::jsonb,
        ${startedAt}::timestamptz, 'reconnecting', 7,
        ${startedAt}::timestamptz + interval '30 minutes',
        ${startedAt}::timestamptz + interval '29 minutes 50 seconds',
        'backfill-legacy-loss', 'participant_left'
      )
  `;
}

async function verifyReconnectCutoffOwnerBackfill(sql: postgres.Sql) {
  const rows = await sql<
    Array<{ id: string; reconnect_deadline_owner: string | null }>
  >`
    SELECT id::text, reconnect_deadline_owner
    FROM interview_session
    WHERE id IN (
      ${SESSION_RECONNECT_BACKFILL_GRACE}::uuid,
      ${SESSION_RECONNECT_BACKFILL_HARD}::uuid,
      ${SESSION_RECONNECT_BACKFILL_TIE}::uuid,
      ${SESSION_RECONNECT_BACKFILL_LEGACY}::uuid
    )
    ORDER BY id
  `;
  assert.deepEqual(
    new Map(rows.map((row) => [row.id, row.reconnect_deadline_owner])),
    new Map([
      [SESSION_RECONNECT_BACKFILL_GRACE, "reconnect_grace"],
      [SESSION_RECONNECT_BACKFILL_HARD, "hard_deadline"],
      [SESSION_RECONNECT_BACKFILL_TIE, "hard_deadline"],
      [SESSION_RECONNECT_BACKFILL_LEGACY, "hard_deadline"],
    ])
  );

  const { listInterviewReconnectSchedules } = await import(
    "../lib/db/session-reconnects"
  );
  const schedules = await listInterviewReconnectSchedules(250, drizzle(sql));
  const seededSessionIds = new Set([
    SESSION_RECONNECT_BACKFILL_GRACE,
    SESSION_RECONNECT_BACKFILL_HARD,
    SESSION_RECONNECT_BACKFILL_TIE,
    SESSION_RECONNECT_BACKFILL_LEGACY,
  ]);
  const seededSchedules = schedules.filter((schedule) =>
    seededSessionIds.has(schedule.sessionId)
  );
  assert.deepEqual(
    seededSchedules.map((schedule) => schedule.sessionId),
    [SESSION_RECONNECT_BACKFILL_GRACE]
  );
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
        '{"version": "1", "rolloverGrantId": "10000000-0000-4000-8000-000000000008", "issuedAt": "2026-07-01T00:07:00.000Z", "expiresAt": "2026-08-30T00:07:00.000Z"}'::jsonb,
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

async function verifyProviderStartCleanupOwnership(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { createDrizzleInterviewSessionLifecycleStore },
    { transitionInterviewSessionWorkflow },
  ] = await Promise.all([
    import("../lib/db/session-lifecycle"),
    import("../lib/workflows/transition-interview-session"),
  ]);
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, livekit_room_name,
      lifecycle_state, lifecycle_version
    ) VALUES (
      ${SESSION_PROVIDER_START_FAILURE}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'provider-start-failure-room',
      'created',
      1
    )
  `;

  const [databaseClockBefore] = await sql<{ observed_at: Date }[]>`
    SELECT clock_timestamp() AS observed_at
  `;
  const connecting = await transitionInterviewSessionWorkflow(
    {
      sessionId: SESSION_PROVIDER_START_FAILURE,
      to: "connecting",
    },
    {
      lifecycleStore: createDrizzleInterviewSessionLifecycleStore(drizzle(sql)),
      now: () => new Date("2026-07-10T07:59:00.000Z"),
    }
  );
  assert.equal(connecting.ok, true);
  const [databaseClockAfter] = await sql<{ observed_at: Date }[]>`
    SELECT clock_timestamp() AS observed_at
  `;

  const provisioned = await sql<
    {
      lifecycle_state: string;
      lifecycle_version: number;
      room_cleanup_pending: boolean;
      room_provisioning_pending: boolean;
      room_provisioning_started_at: Date | null;
    }[]
  >`
    SELECT lifecycle_state, lifecycle_version, room_cleanup_pending,
      room_provisioning_pending, room_provisioning_started_at
    FROM interview_session
    WHERE id = ${SESSION_PROVIDER_START_FAILURE}::uuid
  `;
  const provisioningLeaseStartedAt = provisioned[0]
    ?.room_provisioning_started_at
    ? new Date(provisioned[0].room_provisioning_started_at)
    : null;
  assert.ok(databaseClockBefore?.observed_at);
  assert.ok(databaseClockAfter?.observed_at);
  assert.ok(provisioningLeaseStartedAt);
  assert.ok(
    provisioningLeaseStartedAt.getTime() >=
      new Date(databaseClockBefore.observed_at).getTime()
  );
  assert.ok(
    provisioningLeaseStartedAt.getTime() <=
      new Date(databaseClockAfter.observed_at).getTime()
  );
  assert.deepEqual(
    provisioned[0] && {
      ...provisioned[0],
      room_provisioning_started_at: provisioningLeaseStartedAt,
    },
    {
      lifecycle_state: "connecting",
      lifecycle_version: 2,
      room_cleanup_pending: true,
      room_provisioning_pending: true,
      room_provisioning_started_at: provisioningLeaseStartedAt,
    }
  );

  const result = await transitionInterviewSessionWorkflow(
    {
      sessionId: SESSION_PROVIDER_START_FAILURE,
      to: "failed",
      terminalReason: "provider_failure",
    },
    {
      lifecycleStore: createDrizzleInterviewSessionLifecycleStore(drizzle(sql)),
      now: () => new Date("2026-07-10T08:00:00.000Z"),
    }
  );
  assert.equal(result.ok, true);

  const stored = await sql<
    {
      lifecycle_state: string;
      terminal_reason: string;
      room_cleanup_pending: boolean;
      room_cleanup_attempted_at: Date | null;
      room_provisioning_pending: boolean;
      room_provisioning_started_at: Date | null;
    }[]
  >`
    SELECT lifecycle_state, terminal_reason, room_cleanup_pending,
      room_cleanup_attempted_at, room_provisioning_pending,
      room_provisioning_started_at
    FROM interview_session
    WHERE id = ${SESSION_PROVIDER_START_FAILURE}::uuid
  `;
  assert.deepEqual(
    stored[0] && {
      ...stored[0],
      room_provisioning_started_at: stored[0].room_provisioning_started_at
        ? new Date(stored[0].room_provisioning_started_at)
        : null,
    },
    {
      lifecycle_state: "failed",
      terminal_reason: "provider_failure",
      room_cleanup_pending: true,
      room_cleanup_attempted_at: null,
      room_provisioning_pending: true,
      room_provisioning_started_at: provisioningLeaseStartedAt,
    }
  );
}

async function verifyRoomProvisioningAndPresenceFences(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const { createDrizzleInterviewReconnectStore } = await import(
    "../lib/db/session-reconnects"
  );
  const store = createDrizzleInterviewReconnectStore(drizzle(sql));
  const [clock] = await sql<{ observed_at: Date }[]>`
    SELECT clock_timestamp() AS observed_at
  `;
  assert.ok(clock?.observed_at);
  const provisioningStartedAt = new Date(clock.observed_at);
  const reconnectDeadlineAt = new Date(
    provisioningStartedAt.getTime() + 5 * 60_000
  );

  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, livekit_room_name,
      lifecycle_state, lifecycle_version, room_cleanup_pending,
      room_provisioning_pending, room_provisioning_started_at,
      reconnect_deadline_at, reconnect_deadline_owner
    ) VALUES
      (
        ${SESSION_PROVISIONING_COMPLETE}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'provisioning-complete-room', 'connecting', 2, true, true,
        ${provisioningStartedAt.toISOString()}, NULL, NULL
      ),
      (
        ${SESSION_PROVISIONING_STALE}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'provisioning-stale-room', 'connecting', 4, true, true,
        ${provisioningStartedAt.toISOString()}, NULL, NULL
      ),
      (
        ${SESSION_PRESENCE_RECOVERY}::uuid, ${USER_ONE}::uuid,
        'product_sense', 'voice_video', 'in_progress',
        'presence-recovery-room', 'reconnecting', 6, false, false,
        NULL, ${reconnectDeadlineAt.toISOString()}, 'reconnect_grace'
      )
  `;

  const wrongCompletion = await store.completeRoomProvisioning({
    sessionId: SESSION_PROVISIONING_COMPLETE,
    expectedVersion: 1,
  });
  assert.equal(wrongCompletion.applied, false);
  const completed = await store.completeRoomProvisioning({
    sessionId: SESSION_PROVISIONING_COMPLETE,
    expectedVersion: 2,
  });
  assert.equal(completed.applied, true);
  if (completed.applied) {
    assert.equal(completed.current.roomCleanupPending, false);
    assert.equal(completed.current.roomProvisioningPending, false);
    assert.equal(completed.current.roomProvisioningStartedAt, null);
  }

  const tooFresh = await store.claimStaleProvisioning({
    sessionId: SESSION_PROVISIONING_STALE,
    expectedVersion: 4,
    provisioningStartedAt,
    transitionedAt: provisioningStartedAt,
  });
  assert.equal(tooFresh.applied, false);
  const [staleLease] = await sql<{ room_provisioning_started_at: Date }[]>`
    UPDATE interview_session
    SET room_provisioning_started_at =
      date_trunc('milliseconds', clock_timestamp())
        - interval '5 minutes' - interval '1 millisecond'
    WHERE id = ${SESSION_PROVISIONING_STALE}::uuid
    RETURNING room_provisioning_started_at
  `;
  assert.ok(staleLease?.room_provisioning_started_at);
  const staleProvisioningStartedAt = new Date(
    staleLease.room_provisioning_started_at
  );
  const wrongVersion = await store.claimStaleProvisioning({
    sessionId: SESSION_PROVISIONING_STALE,
    expectedVersion: 3,
    provisioningStartedAt: staleProvisioningStartedAt,
    transitionedAt: new Date(),
  });
  assert.equal(wrongVersion.applied, false);
  const claimed = await store.claimStaleProvisioning({
    sessionId: SESSION_PROVISIONING_STALE,
    expectedVersion: 4,
    provisioningStartedAt: staleProvisioningStartedAt,
    transitionedAt: new Date(),
  });
  assert.equal(claimed.applied, true);
  if (claimed.applied) {
    assert.equal(claimed.current.state, "failed");
    assert.equal(claimed.current.version, 5);
    assert.equal(claimed.current.roomCleanupPending, true);
    assert.equal(claimed.current.roomProvisioningPending, true);
  }

  const equalDeadline = await store.recoverFromPresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 6,
    deadlineAt: reconnectDeadlineAt,
    joinedAt: reconnectDeadlineAt,
    transitionedAt: reconnectDeadlineAt,
  });
  assert.equal(equalDeadline.applied, false);
  const staleVersion = await store.recoverFromPresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 5,
    deadlineAt: reconnectDeadlineAt,
    joinedAt: new Date(reconnectDeadlineAt.getTime() - 1),
    transitionedAt: reconnectDeadlineAt,
  });
  assert.equal(staleVersion.applied, false);
  const recovered = await store.recoverFromPresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 6,
    deadlineAt: reconnectDeadlineAt,
    joinedAt: new Date(reconnectDeadlineAt.getTime() - 1),
    transitionedAt: reconnectDeadlineAt,
  });
  assert.equal(recovered.applied, true);
  if (recovered.applied) {
    assert.equal(recovered.current.state, "active");
    assert.equal(recovered.current.reconnectDeadlineAt, null);
  }

  const [dueClock] = await sql<{ observed_at: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS observed_at
  `;
  assert.ok(dueClock?.observed_at);
  const dueObservedAt = new Date(dueClock.observed_at);
  const dueDeadlineAt = new Date(dueObservedAt.getTime() - 1_000);
  await sql`
    UPDATE interview_session
    SET lifecycle_state = 'reconnecting', lifecycle_version = 7,
      reconnect_deadline_at = ${dueDeadlineAt.toISOString()}::timestamptz,
      reconnect_deadline_owner = 'hard_deadline'
    WHERE id = ${SESSION_PRESENCE_RECOVERY}::uuid
  `;

  const hardDeadlineOwned = await store.recoverFromDuePresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 7,
    deadlineAt: dueDeadlineAt,
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(hardDeadlineOwned.applied, false);

  await sql`
    UPDATE interview_session
    SET reconnect_deadline_owner = 'reconnect_grace'
    WHERE id = ${SESSION_PRESENCE_RECOVERY}::uuid
  `;
  const staleDueVersion = await store.recoverFromDuePresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 6,
    deadlineAt: dueDeadlineAt,
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(staleDueVersion.applied, false);
  const preCutoffOnly = await store.recoverFromPresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 7,
    deadlineAt: dueDeadlineAt,
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(preCutoffOnly.applied, false);
  const staleDueDeadline = await store.recoverFromDuePresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 7,
    deadlineAt: new Date(dueDeadlineAt.getTime() + 1),
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(staleDueDeadline.applied, false);
  const dueRecovered = await store.recoverFromDuePresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 7,
    deadlineAt: dueDeadlineAt,
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(dueRecovered.applied, true);
  if (dueRecovered.applied) {
    assert.equal(dueRecovered.current.state, "active");
    assert.equal(dueRecovered.current.version, 8);
    assert.equal(dueRecovered.current.reconnectDeadlineAt, null);
  }
  const dueReplay = await store.recoverFromDuePresence({
    sessionId: SESSION_PRESENCE_RECOVERY,
    expectedVersion: 7,
    deadlineAt: dueDeadlineAt,
    joinedAt: new Date(dueDeadlineAt.getTime() - 1),
    transitionedAt: dueObservedAt,
  });
  assert.equal(dueReplay.applied, false);
}

async function verifyReconnectTransportOrdering(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { createDrizzleInterviewReconnectStore },
    { handleLiveKitInterviewEventWorkflow },
  ] = await Promise.all([
    import("../lib/db/session-reconnects"),
    import("../lib/workflows/handle-livekit-interview-event"),
  ]);
  const [databaseClock] = await sql<{ observed_at: Date }[]>`
    SELECT date_trunc('milliseconds', clock_timestamp()) AS observed_at
  `;
  assert.ok(databaseClock?.observed_at);
  const occurredAt = new Date(databaseClock.observed_at);
  const startedAt = new Date(occurredAt.getTime() - 15 * 60_000);
  const roomName = "migration-reconnect-order-room";
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, livekit_room_name, config,
      lifecycle_state, lifecycle_version, activated_at, runtime_ready_at,
      started_at
    ) VALUES (
      ${SESSION_RECONNECT_ORDER}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      ${roomName},
      '{"duration": 30}'::jsonb,
      'active',
      3,
      ${new Date(startedAt.getTime() + 2_000).toISOString()}::timestamptz,
      ${new Date(startedAt.getTime() + 1_000).toISOString()}::timestamptz,
      ${startedAt.toISOString()}::timestamptz
    )
  `;

  const store = createDrizzleInterviewReconnectStore(drizzle(sql));
  const workflowDeps = {
    store,
    scheduleReconnect: async () => undefined,
    settleCredit: async () => undefined,
    now: () => occurredAt,
  };
  const disconnected = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01-left",
      eventName: "participant_left",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(disconnected.disposition, "reconnecting");

  const joined = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01_Z",
      eventName: "participant_joined",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(joined.disposition, "recovered");
  assert.equal(joined.lifecycle?.state, "active");
  assert.equal(joined.lifecycle?.lastTransportEventName, "participant_joined");

  const ordinalLater = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01_a",
      eventName: "participant_joined",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(ordinalLater.disposition, "ignored");
  assert.equal(ordinalLater.lifecycle?.lastTransportEventId, "EV_01_a");

  const ordinalEarlier = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01-A",
      eventName: "participant_joined",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(ordinalEarlier.disposition, "ignored");
  assert.equal(ordinalEarlier.lifecycle?.lastTransportEventId, "EV_01_a");

  const exactReplay = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01_a",
      eventName: "participant_joined",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(exactReplay.disposition, "duplicate");

  const divergentReuse = await handleLiveKitInterviewEventWorkflow(
    {
      eventId: "EV_01_a",
      eventName: "participant_left",
      roomName,
      participantIdentity: USER_ONE,
      participantKind: 0,
      occurredAt,
    },
    workflowDeps
  );
  assert.equal(divergentReuse.ok, false);
  assert.equal(divergentReuse.disposition, "conflict");

  const delayedLeave = await store.applyTransportTransition({
    sessionId: SESSION_RECONNECT_ORDER,
    expectedState: "active",
    expectedVersion: 5,
    nextState: "reconnecting",
    reconnectDeadlineAt: new Date(occurredAt.getTime() + 30_000),
    reconnectDeadlineOwner: "reconnect_grace",
    transportEventAt: occurredAt,
    transportEventId: "delayed-left-at-tie",
    transportEventName: "participant_left",
    recordTransportEvent: true,
    transitionedAt: occurredAt,
  });
  assert.equal(delayedLeave.applied, false);

  const stored = await store.getById(SESSION_RECONNECT_ORDER);
  assert.equal(stored?.state, "active");
  assert.equal(stored?.version, 5);
  assert.equal(stored?.lastTransportEventName, "participant_joined");
  assert.equal(stored?.lastTransportEventId, "EV_01_a");

  const [ordinalOrder] = await sql<{ ids: string[] }[]>`
    SELECT array_agg(value ORDER BY value COLLATE "C") AS ids
    FROM unnest(ARRAY[
      'EV_01-A', 'EV_01-Z', 'EV_01_A', 'EV_01_Z', 'EV_01_a', 'EV_01_ä'
    ]::text[]) AS value
  `;
  assert.deepEqual(ordinalOrder?.ids, [
    "EV_01-A",
    "EV_01-Z",
    "EV_01_A",
    "EV_01_Z",
    "EV_01_a",
    "EV_01_ä",
  ]);
}

async function verifyRoomRecoveryFairness(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const { listInterviewRoomCleanupSessions } = await import(
    "../lib/db/session-reconnects"
  );
  const database = drizzle(sql);
  const healthySessionId = "a4000000-0000-4000-8000-000000000004";

  await sql`
    UPDATE interview_session
    SET room_cleanup_attempted_at = clock_timestamp()
    WHERE room_cleanup_pending OR room_provisioning_pending
  `;
  await sql`
    INSERT INTO interview_session (
      user_id, round_type, mode, status, livekit_room_name,
      lifecycle_state, lifecycle_version, terminal_reason, ended_at,
      room_cleanup_pending, room_provisioning_pending,
      room_provisioning_started_at
    )
    SELECT ${USER_ONE}::uuid, 'product_sense', 'voice_video', 'error',
      'poison-credit-' || sequence, 'failed', 3, 'provider_failure',
      clock_timestamp(), false, true,
      clock_timestamp() - interval '10 minutes' -
        (sequence * interval '1 millisecond')
    FROM generate_series(1, 251) AS sequence
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, livekit_room_name,
      lifecycle_state, lifecycle_version, terminal_reason, ended_at,
      room_cleanup_pending, room_provisioning_pending,
      room_provisioning_started_at
    ) VALUES (
      ${healthySessionId}::uuid, ${USER_ONE}::uuid, 'product_sense',
      'voice_video', 'error', 'healthy-room-cleanup', 'failed', 3,
      'provider_failure', clock_timestamp(), true, false, NULL
    )
  `;

  const firstPage = await listInterviewRoomCleanupSessions(250, database);
  assert.equal(firstPage.length, 250);
  assert.equal(
    firstPage.some((row) => row.sessionId === healthySessionId),
    false
  );

  await sql`
    UPDATE interview_session
    SET room_cleanup_attempted_at = clock_timestamp()
    WHERE id IN ${sql(firstPage.map((row) => row.sessionId))}
  `;
  const secondPage = await listInterviewRoomCleanupSessions(250, database);
  assert.equal(
    secondPage.some((row) => row.sessionId === healthySessionId),
    true
  );

  await sql`
    DELETE FROM interview_session
    WHERE livekit_room_name LIKE 'poison-credit-%'
      OR id = ${healthySessionId}::uuid
  `;
}

async function verifyAtomicSessionCompletion(
  sql: postgres.Sql,
  databaseUrl: string,
  runDeadlineCleanupComposition: boolean
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { acceptUserInterviewEnd },
    { finalizeInterviewSession },
    { createDrizzleFeedbackDispatchStore },
    {
      acknowledgeInterviewDeadlineRoomCleanup,
      claimInterviewDeadline,
      getInterviewDeadlineSession,
      listInterviewDeadlineSchedules,
    },
    { createDrizzleInterviewReconnectStore },
    {
      createDrizzleTranscriptRuntimeSettlementStore,
      getTranscriptRuntimeSettlementReadiness,
    },
    { expireRuntimeSettlementCommand },
    { enforceInterviewDeadlineWorkflow },
    { dispatchFeedbackGenerationWorkflow },
    { dispatchInterviewSessionSettlement, settleInterviewSessionWorkflow },
    schema,
  ] = await Promise.all([
    import("../lib/db/accept-user-interview-end"),
    import("../lib/db/end-interview-session"),
    import("../lib/db/feedback-dispatch"),
    import("../lib/db/session-deadlines"),
    import("../lib/db/session-reconnects"),
    import("../lib/db/transcripts"),
    import("../lib/db/runtime-settlement-commands"),
    import("../lib/workflows/enforce-interview-deadline"),
    import("../lib/workflows/dispatch-feedback-generation"),
    import("../lib/workflows/end-interview-session"),
    import("../lib/db/schema"),
  ]);
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at, started_at,
      livekit_room_name
    ) VALUES (
      ${SESSION_ATOMIC_END}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      1,
      now(),
      '2026-07-10T05:00:00.000Z'::timestamptz,
      'atomic-end-room'
    )
  `;
  await seedValidTranscriptIntegrityFixture(sql, {
    sessionId: SESSION_ATOMIC_END,
    roomName: "atomic-end-room",
    writerId: "atomic-end-writer",
    startedAt: "2026-07-10T05:00:00.000Z",
    settledAt: "2026-07-10T05:45:00.000Z",
  });
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at, started_at,
      livekit_room_name
    ) VALUES (
      ${SESSION_DURABLE_COMMAND}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      3,
      now(),
      now() - interval '1 minute',
      'durable-command-room'
    )
  `;
  await sql`
    INSERT INTO transcript_runtime_writer (
      session_id, generation, contract_version, room_name, writer_id,
      registered_at
    ) VALUES (
      ${SESSION_DURABLE_COMMAND}::uuid, 2, 1,
      'durable-command-room', 'durable-command-writer',
      now() - interval '59 seconds'
    )
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at, started_at,
      livekit_room_name
    ) VALUES (
      ${SESSION_EXPIRED_COMMAND}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      3,
      now(),
      now() - interval '1 minute',
      'expired-command-room'
    )
  `;
  await sql`
    INSERT INTO transcript_runtime_writer (
      session_id, generation, contract_version, room_name, writer_id,
      registered_at
    ) VALUES (
      ${SESSION_EXPIRED_COMMAND}::uuid, 2, 1,
      'expired-command-room', 'expired-command-writer',
      now() - interval '59 seconds'
    )
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status,
      lifecycle_state, lifecycle_version, activated_at, started_at,
      livekit_room_name
    ) VALUES (
      ${SESSION_RETIRED_REWARD_GUARD}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      1,
      now(),
      '2026-07-10T05:00:00.000Z'::timestamptz,
      'retired-reward-guard-room'
    )
  `;
  await seedValidTranscriptIntegrityFixture(sql, {
    sessionId: SESSION_RETIRED_REWARD_GUARD,
    roomName: "retired-reward-guard-room",
    writerId: "retired-reward-guard-writer",
    startedAt: "2026-07-10T05:00:00.000Z",
    settledAt: "2026-07-10T05:45:00.000Z",
  });
  const clients = Array.from({ length: 10 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const databases = clients.map((client) => drizzle(client, { schema }));

  try {
    await sql`
      UPDATE app_user
      SET streak_current = 4,
        streak_longest = 9,
        last_practice_date = '2026-07-01T00:00:00.000Z'::timestamptz
      WHERE id = ${USER_ONE}::uuid
    `;
    await sql`
      INSERT INTO user_achievement (user_id, achievement_id)
      VALUES (${USER_ONE}::uuid, 'legacy_reward_guard')
      ON CONFLICT (user_id, achievement_id) DO NOTHING
    `;
    const rewardGuardCompletion = await settleInterviewSessionWorkflow(
      {
        sessionId: SESSION_RETIRED_REWARD_GUARD,
        actor: { type: "user", userId: USER_ONE },
        requestedTerminalReason: "user_end",
      },
      {
        authorize: async () => true,
        finalize: (input) => finalizeInterviewSession(input, databases[0]!),
        settleCredit: async () => undefined,
      }
    );
    assert.equal(rewardGuardCompletion.ok, true);
    const [legacyRewardState] = await sql<
      {
        streak_current: number;
        streak_longest: number;
        last_practice_unchanged: boolean;
        achievement_count: number;
      }[]
    >`
      SELECT streak_current,
        streak_longest,
        last_practice_date = '2026-07-01T00:00:00.000Z'::timestamptz
          AS last_practice_unchanged,
        (SELECT count(*)::int
          FROM user_achievement
          WHERE user_id = ${USER_ONE}::uuid
            AND achievement_id = 'legacy_reward_guard') AS achievement_count
      FROM app_user
      WHERE id = ${USER_ONE}::uuid
    `;
    assert.deepEqual(legacyRewardState, {
      streak_current: 4,
      streak_longest: 9,
      last_practice_unchanged: true,
      achievement_count: 1,
    });

    const results = await Promise.all(
      databases.map((database, index) =>
        finalizeInterviewSession(
          index % 2 === 0
            ? {
                sessionId: SESSION_ATOMIC_END,
                actor: { type: "user", userId: USER_ONE },
                requestedTerminalReason: "user_end",
              }
            : {
                sessionId: SESSION_ATOMIC_END,
                actor: { type: "system", source: "hard_deadline" },
                requestedTerminalReason: "time_limit",
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
    const [frozenEvidence] = await sql<
      {
        version: number;
        state: string;
        writer_count: number;
        committed_sequence: number;
      }[]
    >`
      SELECT session.transcript_evidence_version AS version,
        session.transcript_evidence_state AS state,
        count(cutoff.writer_generation)::int AS writer_count,
        max(cutoff.committed_sequence)::int AS committed_sequence
      FROM interview_session session
      LEFT JOIN transcript_evidence_writer_cutoff cutoff
        ON cutoff.session_id = session.id
      WHERE session.id = ${SESSION_ATOMIC_END}::uuid
      GROUP BY session.id
    `;
    assert.deepEqual(frozenEvidence, {
      version: 1,
      state: "complete",
      writer_count: 1,
      committed_sequence: 5,
    });

    const accepted = await acceptUserInterviewEnd(
      { sessionId: SESSION_DURABLE_COMMAND, userId: USER_ONE },
      databases[0]
    );
    assert.equal(accepted.ok && accepted.disposition, "accepted");
    const replayed = await acceptUserInterviewEnd(
      { sessionId: SESSION_DURABLE_COMMAND, userId: USER_ONE },
      databases[1]
    );
    assert.equal(replayed.ok && replayed.disposition, "already_ending");
    const [durableCommand] = await sql<
      {
        lifecycle_version: number;
        command_id: string;
        room_name: string;
        writer_id: string;
        writer_generation: number;
        cutoff_at: Date;
        expires_at: Date;
      }[]
    >`
      SELECT lifecycle_version, command_id, room_name, writer_id,
        writer_generation, cutoff_at, expires_at
      FROM transcript_runtime_settlement_command
      WHERE session_id = ${SESSION_DURABLE_COMMAND}::uuid
    `;
    assert.equal(durableCommand?.lifecycle_version, 4);
    assert.equal(
      durableCommand?.command_id,
      `runtime-settlement:${SESSION_DURABLE_COMMAND}:4`
    );
    assert.equal(durableCommand?.room_name, "durable-command-room");
    assert.equal(durableCommand?.writer_id, "durable-command-writer");
    assert.equal(durableCommand?.writer_generation, 2);
    assert.equal(
      databaseTimestamp(durableCommand!.expires_at).getTime() -
        databaseTimestamp(durableCommand!.cutoff_at).getTime(),
      20_000
    );

    const settlementStore = createDrizzleTranscriptRuntimeSettlementStore(
      databases[0]
    );
    const durableSettlement = {
      contract_version: 1 as const,
      event_type: "runtime_settlement" as const,
      session_id: SESSION_DURABLE_COMMAND,
      room_name: "durable-command-room",
      writer_id: "durable-command-writer",
      writer_generation: 2,
      state: "settled" as const,
      settled_at: databaseTimestamp(durableCommand!.cutoff_at).toISOString(),
    };
    const persistedSettlement =
      await settlementStore.persist(durableSettlement);
    assert.equal(
      persistedSettlement.ok && persistedSettlement.disposition,
      "created"
    );
    const replayedSettlement = await settlementStore.persist(durableSettlement);
    assert.equal(
      replayedSettlement.ok && replayedSettlement.disposition,
      "existing"
    );
    const [acknowledgedCommand] = await sql<
      { state: string; terminal_reason: string }[]
    >`
      SELECT state, terminal_reason
      FROM transcript_runtime_settlement_command
      WHERE session_id = ${SESSION_DURABLE_COMMAND}::uuid
    `;
    assert.deepEqual(acknowledgedCommand, {
      state: "acknowledged",
      terminal_reason: "settled",
    });

    const expiredAccepted = await acceptUserInterviewEnd(
      { sessionId: SESSION_EXPIRED_COMMAND, userId: USER_ONE },
      databases[0]
    );
    assert.equal(expiredAccepted.ok && expiredAccepted.disposition, "accepted");
    const [expiredCommand] = await sql<
      { command_id: string; cutoff_at: Date | string }[]
    >`
      SELECT command_id, cutoff_at
      FROM transcript_runtime_settlement_command
      WHERE session_id = ${SESSION_EXPIRED_COMMAND}::uuid
    `;
    await expireRuntimeSettlementCommand(
      expiredCommand!.command_id,
      databases[0]
    );
    assert.deepEqual(
      await settlementStore.persist({
        contract_version: 1,
        event_type: "runtime_settlement",
        session_id: SESSION_EXPIRED_COMMAND,
        room_name: "expired-command-room",
        writer_id: "expired-command-writer",
        writer_generation: 2,
        state: "settled",
        settled_at: databaseTimestamp(expiredCommand!.cutoff_at).toISOString(),
      }),
      { ok: false, reason: "settlement_conflict" }
    );
    const [expiredProof] = await sql<
      {
        settlements: number;
        evidence_version: number | null;
        evidence_state: string | null;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM transcript_runtime_settlement
          WHERE session_id = ${SESSION_EXPIRED_COMMAND}::uuid) AS settlements,
        transcript_evidence_version AS evidence_version,
        transcript_evidence_state AS evidence_state
      FROM interview_session
      WHERE id = ${SESSION_EXPIRED_COMMAND}::uuid
    `;
    assert.deepEqual(expiredProof, {
      settlements: 0,
      evidence_version: null,
      evidence_state: null,
    });
    assert.deepEqual(
      await getTranscriptRuntimeSettlementReadiness(
        SESSION_EXPIRED_COMMAND,
        databases[0]
      ),
      {
        writerCount: 1,
        settledCount: 0,
        degradedCount: 0,
        missingCount: 1,
        currentWriterGeneration: 2,
        currentWriterState: null,
        unhealthyWriterCount: 0,
        gapWriterCount: 0,
        ready: false,
      }
    );

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
      const deadlineReconnectStore = createDrizzleInterviewReconnectStore(
        databases[0]!
      );
      const deadlineDeps = {
        getSession: getInterviewDeadlineSession,
        claimDue: (input: Parameters<typeof claimInterviewDeadline>[0]) =>
          claimInterviewDeadline(input, databases[0]!),
        scheduleDeadline: async () => undefined,
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
              finalize: (
                input: Parameters<typeof finalizeInterviewSession>[0]
              ) => finalizeInterviewSession(input, databases[0]!),
              settleCredit: async () => undefined,
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
        markRoomCleanupComplete: (sessionId: string) =>
          deadlineReconnectStore.markRoomCleanupComplete({ sessionId }),
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
        assert.equal(concurrentUserEnd.deadlineRoomCleanupStatus, "pending");
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
      await seedValidTranscriptIntegrityFixture(sql, {
        sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
        roomName: "interview-deadline-dispatch-recovery-room",
        writerId: "deadline-dispatch-recovery-writer",
        startedAt: "2026-07-10T06:00:00.000Z",
        settledAt: "2026-07-10T06:30:00.000Z",
      });
      const eligibleDeadline = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
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
      assert.equal(
        blockedClaims.every((claim) => claim === null),
        true
      );

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
          claimDue: (input: Parameters<typeof claimInterviewDeadline>[0]) =>
            claimInterviewDeadline(input, databases[0]!),
          scheduleDeadline: async () => undefined,
          settleSession: () =>
            settleInterviewSessionWorkflow(
              {
                sessionId: SESSION_DEADLINE_DISPATCH_RECOVERY,
                actor: { type: "system", source: "hard_deadline" },
                requestedTerminalReason: "time_limit",
              },
              {
                authorize: async () => true,
                finalize: (
                  input: Parameters<typeof finalizeInterviewSession>[0]
                ) => finalizeInterviewSession(input, databases[0]!),
                settleCredit: async () => undefined,
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
                  reportFailure: () => undefined,
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
          markRoomCleanupComplete: (sessionId) =>
            deadlineReconnectStore.markRoomCleanupComplete({ sessionId }),
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
      await seedValidTranscriptIntegrityFixture(sql, {
        sessionId: SESSION_DEADLINE_USER_END,
        roomName: "interview-deadline-user-end-room",
        writerId: "deadline-user-end-writer",
        startedAt: "2026-07-10T06:00:00.000Z",
        settledAt: "2026-07-10T06:30:00.000Z",
      });
      const userEndWinner = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_USER_END,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
        },
        databases[0]!
      );
      assert.equal(userEndWinner.ok, true);
      const deadlineLoser = await finalizeInterviewSession(
        {
          sessionId: SESSION_DEADLINE_USER_END,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
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

async function verifyTranscriptIngest(sql: postgres.Sql, databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    {
      createDrizzleTranscriptIngestStore,
      createDrizzleTranscriptInterruptionMarkerStore,
      createDrizzleTranscriptRuntimeSettlementStore,
      createDrizzleTranscriptRuntimeWriterStore,
      getTranscriptRuntimeSettlementReadiness,
    },
    { finalizeInterviewSession },
    { claimInterviewDeadline },
    { createTranscriptEvent },
    { calculateSessionStatsFromTurns, validateSessionStats },
    schema,
  ] = await Promise.all([
    import("../lib/db/transcripts"),
    import("../lib/db/end-interview-session"),
    import("../lib/db/session-deadlines"),
    import("@meelni/agent"),
    import("../lib/evaluation/session-validator"),
    import("../lib/db/schema"),
  ]);

  await sql`
    UPDATE interview_session
    SET livekit_room_name = 'transcript-room-one',
        lifecycle_state = 'active',
        started_at = '2026-07-10T04:59:00.000Z'::timestamptz,
        activated_at = COALESCE(activated_at, now())
    WHERE id = ${SESSION_ONE}::uuid
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      lifecycle_version, livekit_room_name, config, started_at, activated_at
    ) VALUES
      (
        ${SESSION_TRANSCRIPT_DEADLINE}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'active',
        1,
        'transcript-deadline-room',
        '{"duration":30}'::jsonb,
        '2026-07-10T05:00:00.000Z'::timestamptz,
        now()
      ),
      (
        ${SESSION_TRANSCRIPT_DEADLINE_INVALID}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'active',
        1,
        'transcript-deadline-invalid-room',
        '{"duration":30}'::jsonb,
        '2026-07-10T05:00:00.000Z'::timestamptz,
        now()
      )
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      livekit_room_name, started_at, activated_at
    ) VALUES (
      ${SESSION_TRANSCRIPT_MARKER}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      'transcript-marker-room',
      '2026-07-10T05:00:00.000Z'::timestamptz,
      now()
    ) ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO transcript_turn (
      session_id, speaker, started_at, ended_at, text, audio_ms, section
    ) VALUES
      (${SESSION_TRANSCRIPT_MARKER}::uuid, 'interviewer', '2026-07-10T05:00:00Z', '2026-07-10T05:00:05Z', 'Start with the goal.', 5000, 'prompt'),
      (${SESSION_TRANSCRIPT_MARKER}::uuid, 'user', '2026-07-10T05:00:10Z', '2026-07-10T05:01:30Z', 'I would clarify the goal and identify a specific customer segment before choosing the most important problem.', 80000, 'answer'),
      (${SESSION_TRANSCRIPT_MARKER}::uuid, 'interviewer', '2026-07-10T05:02:00Z', '2026-07-10T05:02:05Z', 'Continue with the problem.', 5000, 'follow_up'),
      (${SESSION_TRANSCRIPT_MARKER}::uuid, 'user', '2026-07-10T05:03:00Z', '2026-07-10T05:04:30Z', 'The core problem is fragmented context, so I would prioritize a workflow that reduces repeated coordination and uncertainty.', 90000, 'answer'),
      (${SESSION_TRANSCRIPT_MARKER}::uuid, 'user', '2026-07-10T05:05:00Z', '2026-07-10T05:06:30Z', 'I would measure task completion and retained weekly use while guarding against low quality engagement and notification fatigue.', 90000, 'answer')
    ON CONFLICT DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      livekit_room_name, started_at, activated_at
    ) VALUES (
      ${SESSION_TRANSCRIPT_TWO}::uuid,
      ${USER_ONE}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      'transcript-room-two',
      '2026-07-10T04:59:00.000Z'::timestamptz,
      now()
    ) ON CONFLICT (id) DO UPDATE
      SET livekit_room_name = EXCLUDED.livekit_room_name,
          lifecycle_state = 'active',
          started_at = EXCLUDED.started_at,
          activated_at = COALESCE(interview_session.activated_at, now())
  `;

  const clients = Array.from({ length: 10 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const stores = clients.map((client) =>
    createDrizzleTranscriptIngestStore(drizzle(client, { schema }))
  );
  const markerStore = createDrizzleTranscriptInterruptionMarkerStore(
    drizzle(clients[0]!, { schema })
  );
  const settlementStore = createDrizzleTranscriptRuntimeSettlementStore(
    drizzle(clients[0]!, { schema })
  );
  const writerStore = createDrizzleTranscriptRuntimeWriterStore(
    drizzle(clients[0]!, { schema })
  );
  for (const registration of [
    {
      session_id: SESSION_ONE,
      room_name: "transcript-room-one",
      writer_id: "migration-writer",
    },
    {
      session_id: SESSION_TRANSCRIPT_TWO,
      room_name: "transcript-room-two",
      writer_id: "terminal-race-writer",
    },
    {
      session_id: SESSION_TRANSCRIPT_DEADLINE,
      room_name: "transcript-deadline-room",
      writer_id: "deadline-writer",
    },
    {
      session_id: SESSION_TRANSCRIPT_DEADLINE_INVALID,
      room_name: "transcript-deadline-invalid-room",
      writer_id: "deadline-invalid-writer",
    },
    {
      session_id: SESSION_TRANSCRIPT_MARKER,
      room_name: "transcript-marker-room",
      writer_id: "migration-marker-writer",
    },
  ]) {
    const registered = await writerStore.register({
      contract_version: 1,
      event_type: "runtime_writer_registration",
      ...registration,
      registered_at: "2026-07-10T05:00:00.000Z",
    });
    assert.equal(registered.ok, true);
  }
  const event = createTranscriptEvent({
    event_id: "migration-writer:message-1",
    writer_id: "migration-writer",
    writer_generation: 1,
    sequence: 1,
    session_id: SESSION_ONE,
    room_name: "transcript-room-one",
    speaker: "user",
    text: "Identical text must remain distinct when event identity differs.",
    started_at: "2026-07-10T05:00:00.000Z",
    ended_at: "2026-07-10T05:00:04.000Z",
    audio_duration_ms: 4_000,
    section: "product_sense",
    delivery_state: "delivered",
  });

  try {
    const concurrent = await Promise.all(
      stores.map((store) =>
        store.persist({
          principal: { kind: "authenticated_user", userId: USER_ONE },
          event,
        })
      )
    );
    assert.equal(
      concurrent.filter(
        (result) => result.ok && result.disposition === "created"
      ).length,
      1
    );
    assert.equal(
      concurrent.filter(
        (result) => result.ok && result.disposition === "existing"
      ).length,
      9
    );

    const second = createTranscriptEvent({
      ...event,
      event_id: "migration-writer:message-2",
      sequence: Number.MAX_SAFE_INTEGER,
      started_at: "2026-07-10T05:00:05.000Z",
      ended_at: "2026-07-10T05:00:09.000Z",
    });
    assert.deepEqual(
      await stores[0]!
        .persist({
          principal: { kind: "authenticated_user", userId: USER_ONE },
          event: second,
        })
        .then((result) => result.ok && result.disposition),
      "created"
    );

    const crossSession = createTranscriptEvent({
      ...event,
      session_id: SESSION_TRANSCRIPT_TWO,
      room_name: "transcript-room-two",
    });
    assert.deepEqual(
      await stores[0]!.persist({
        principal: { kind: "authenticated_user", userId: USER_ONE },
        event: crossSession,
      }),
      { ok: false, reason: "event_conflict" }
    );

    const sequenceConflict = createTranscriptEvent({
      ...event,
      event_id: "migration-writer:other-message",
    });
    assert.deepEqual(
      await stores[0]!.persist({
        principal: { kind: "authenticated_user", userId: USER_ONE },
        event: sequenceConflict,
      }),
      { ok: false, reason: "writer_sequence_conflict" }
    );

    const stored = await sql<
      { event_id: string; text: string; sequence: string }[]
    >`
      SELECT event_id, text, sequence::text
      FROM transcript_turn
      WHERE session_id = ${SESSION_ONE}::uuid AND event_id IS NOT NULL
      ORDER BY started_at, writer_generation, writer_id, sequence, event_id, id
    `;
    assert.deepEqual(
      stored.map(({ event_id }) => event_id),
      ["migration-writer:message-1", "migration-writer:message-2"]
    );
    assert.equal(stored[0]?.text, stored[1]?.text);
    assert.equal(stored[1]?.sequence, String(Number.MAX_SAFE_INTEGER));

    const replacementRegistration = {
      contract_version: 1 as const,
      event_type: "runtime_writer_registration" as const,
      session_id: SESSION_ONE,
      room_name: "transcript-room-one",
      writer_id: "a-replacement-writer",
      registered_at: "2026-07-10T05:09:00.000Z",
    };
    const replacement = await writerStore.register(replacementRegistration);
    assert.equal(replacement.ok && replacement.disposition, "created");
    assert.equal(replacement.ok && replacement.writerGeneration, 2);
    const replacementEvent = createTranscriptEvent({
      ...event,
      event_id: "a-replacement-writer:message-1",
      writer_id: "a-replacement-writer",
      writer_generation: 2,
      sequence: 1,
      started_at: "2026-07-10T05:00:05.000Z",
      ended_at: "2026-07-10T05:00:09.000Z",
    });
    assert.equal(
      (
        await stores[0]!.persist({
          principal: { kind: "voice_runtime" },
          event: replacementEvent,
        })
      ).ok,
      true
    );
    const generationOrdered = await sql<{ event_id: string }[]>`
      SELECT event_id
      FROM transcript_turn
      WHERE session_id = ${SESSION_ONE}::uuid AND event_id IS NOT NULL
      ORDER BY started_at, writer_generation, writer_id, sequence, event_id, id
    `;
    assert.deepEqual(
      generationOrdered.map(({ event_id }) => event_id),
      [
        "migration-writer:message-1",
        "migration-writer:message-2",
        "a-replacement-writer:message-1",
      ]
    );
    assert.deepEqual(
      await writerStore.register({
        contract_version: 1,
        event_type: "runtime_writer_registration",
        session_id: SESSION_ONE,
        room_name: "transcript-room-one",
        writer_id: "migration-writer",
        registered_at: "2026-07-10T05:00:00.000Z",
      }),
      { ok: false, reason: "writer_fenced" }
    );
    const fencedWriterReplay = await stores[0]!.persist({
      principal: { kind: "voice_runtime" },
      event,
    });
    assert.equal(
      fencedWriterReplay.ok && fencedWriterReplay.disposition,
      "existing"
    );
    assert.deepEqual(
      await stores[0]!.persist({
        principal: { kind: "voice_runtime" },
        event: createTranscriptEvent({
          ...event,
          event_id: "migration-writer:message-after-replacement",
          sequence: 3,
          started_at: "2026-07-10T05:09:01.000Z",
          ended_at: "2026-07-10T05:09:02.000Z",
          audio_duration_ms: 1_000,
        }),
      }),
      { ok: false, reason: "writer_fenced" }
    );
    assert.equal(
      (
        await settlementStore.persist({
          contract_version: 1,
          event_type: "runtime_settlement",
          session_id: SESSION_ONE,
          room_name: "transcript-room-one",
          writer_id: "migration-writer",
          writer_generation: 1,
          state: "degraded",
          settled_at: "2026-07-10T05:10:00.000Z",
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await settlementStore.persist({
          contract_version: 1,
          event_type: "runtime_settlement",
          session_id: SESSION_ONE,
          room_name: "transcript-room-one",
          writer_id: "a-replacement-writer",
          writer_generation: 2,
          state: "settled",
          settled_at: "2026-07-10T05:11:00.000Z",
        })
      ).ok,
      true
    );
    assert.deepEqual(
      await getTranscriptRuntimeSettlementReadiness(
        SESSION_ONE,
        drizzle(clients[0]!, { schema })
      ),
      {
        writerCount: 2,
        settledCount: 1,
        degradedCount: 1,
        missingCount: 0,
        currentWriterGeneration: 2,
        currentWriterState: "settled",
        unhealthyWriterCount: 0,
        gapWriterCount: 1,
        ready: false,
      }
    );

    const terminalRaceEvent = createTranscriptEvent({
      ...event,
      event_id: "terminal-race-writer:message-1",
      writer_id: "terminal-race-writer",
      session_id: SESSION_TRANSCRIPT_TWO,
      room_name: "transcript-room-two",
    });
    const [ingestResult, completionResult] = await Promise.all([
      stores[0]!.persist({
        principal: { kind: "authenticated_user", userId: USER_ONE },
        event: terminalRaceEvent,
      }),
      finalizeInterviewSession(
        {
          sessionId: SESSION_TRANSCRIPT_TWO,
          actor: { type: "user", userId: USER_ONE },
          requestedTerminalReason: "user_end",
        },
        drizzle(clients[1]!, { schema })
      ),
    ]);
    assert.equal(completionResult.ok, true);
    const terminalRaceRows = await sql<{ rows: number }[]>`
      SELECT count(*)::int AS rows
      FROM transcript_turn
      WHERE session_id = ${SESSION_TRANSCRIPT_TWO}::uuid
    `;
    const durableRows = terminalRaceRows[0]?.rows ?? 0;
    assert.ok(
      (ingestResult.ok && ingestResult.disposition === "created") ||
        (!ingestResult.ok && ingestResult.reason === "session_closed")
    );
    if (completionResult.ok) {
      assert.equal(completionResult.stats.totalTurns, durableRows);
    }

    const deadlineEvents = [
      {
        speaker: "user" as const,
        text: "I would clarify the customer problem, target segment, constraints, and measurable outcome first.",
        started_at: "2026-07-10T05:00:00.000Z",
        ended_at: "2026-07-10T05:00:01.000Z",
      },
      {
        speaker: "interviewer" as const,
        text: "Please continue.",
        started_at: "2026-07-10T05:01:00.000Z",
        ended_at: "2026-07-10T05:01:01.000Z",
      },
      {
        speaker: "user" as const,
        text: "I would compare reach, severity, strategic fit, confidence, and implementation effort before prioritizing.",
        started_at: "2026-07-10T05:03:00.000Z",
        ended_at: "2026-07-10T05:03:01.000Z",
      },
      {
        speaker: "interviewer" as const,
        text: "What would you measure?",
        started_at: "2026-07-10T05:04:00.000Z",
        ended_at: "2026-07-10T05:04:01.000Z",
      },
      {
        speaker: "user" as const,
        text: "The primary metric would reflect retained customer value, with adoption and guardrail metrics diagnosing movement.",
        started_at: "2026-07-10T05:05:01.000Z",
        ended_at: "2026-07-10T05:05:02.000Z",
      },
    ].map((input, index) =>
      createTranscriptEvent({
        event_id: `deadline-writer:message-${index + 1}`,
        writer_id: "deadline-writer",
        writer_generation: 1,
        sequence: index + 1,
        session_id: SESSION_TRANSCRIPT_DEADLINE,
        room_name: "transcript-deadline-room",
        speaker: input.speaker,
        text: input.text,
        started_at: input.started_at,
        ended_at: input.ended_at,
        audio_duration_ms: 1_000,
        section: "product_sense",
        delivery_state: "delivered",
      })
    );
    for (const deadlineEvent of deadlineEvents.slice(0, 4)) {
      const persisted = await stores[2]!.persist({
        principal: { kind: "voice_runtime" },
        event: deadlineEvent,
      });
      assert.equal(persisted.ok, true);
    }
    const preClaimTurns = await sql<
      {
        speaker: string;
        text: string | null;
        started_at: Date | null;
        ended_at: Date | null;
      }[]
    >`
      SELECT speaker, text, started_at, ended_at
      FROM transcript_turn
      WHERE session_id = ${SESSION_TRANSCRIPT_DEADLINE}::uuid
    `;
    const preClaimValidation = validateSessionStats(
      calculateSessionStatsFromTurns(
        preClaimTurns.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text,
          startedAt: turn.started_at ? new Date(turn.started_at) : null,
          endedAt: turn.ended_at ? new Date(turn.ended_at) : null,
        }))
      )
    );
    assert.equal(preClaimValidation.isValid, true);
    assert.equal(preClaimValidation.stats.totalTurns, 4);
    assert.equal(preClaimValidation.stats.substantiveResponses, 2);

    let cutoffConcurrentIngest!: ReturnType<(typeof stores)[number]["persist"]>;
    let deadlineClaim!: ReturnType<typeof claimInterviewDeadline>;
    const ingestClient = clients[3]!;
    const claimClient = clients[4]!;
    const [ingestBackend] = await ingestClient<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `;
    const [claimBackend] = await claimClient<{ pid: number }[]>`
      SELECT pg_backend_pid()::int AS pid
    `;
    await clients[8]!.begin(async (locked) => {
      await locked`
        SELECT id FROM interview_session
        WHERE id = ${SESSION_TRANSCRIPT_DEADLINE}::uuid
        FOR UPDATE
      `;
      cutoffConcurrentIngest = stores[3]!.persist({
        principal: { kind: "voice_runtime" },
        event: deadlineEvents[4]!,
      });
      await waitForDatabaseLock(sql, ingestBackend.pid);
      deadlineClaim = claimInterviewDeadline(
        {
          sessionId: SESSION_TRANSCRIPT_DEADLINE,
          expectedState: "active",
          expectedVersion: 1,
          deadlineAt: new Date("2026-07-10T05:30:00.000Z"),
          terminalReason: "time_limit",
        },
        drizzle(clients[4]!, { schema })
      );
      await waitForDatabaseLock(sql, claimBackend.pid);
    });
    const cutoffConcurrentIngestResult = await cutoffConcurrentIngest;
    assert.equal(
      cutoffConcurrentIngestResult.ok &&
        cutoffConcurrentIngestResult.disposition,
      "created"
    );
    assert.equal(await deadlineClaim, true);
    const postClaimEvent = createTranscriptEvent({
      ...deadlineEvents[4]!,
      event_id: "deadline-writer:message-6",
      sequence: 6,
      speaker: "interviewer",
      text: "This pre-cutoff event arrived during bounded deadline cleanup.",
      started_at: "2026-07-10T05:06:00.000Z",
      ended_at: "2026-07-10T05:06:01.000Z",
    });
    const postClaimIngest = await stores[5]!.persist({
      principal: { kind: "voice_runtime" },
      event: postClaimEvent,
    });
    assert.equal(postClaimIngest.ok && postClaimIngest.disposition, "created");
    assert.deepEqual(
      await stores[5]!.persist({
        principal: { kind: "voice_runtime" },
        event: createTranscriptEvent({
          ...postClaimEvent,
          event_id: "deadline-writer:message-7",
          sequence: 7,
          started_at: "2026-07-10T05:29:59.500Z",
          ended_at: "2026-07-10T05:30:00.001Z",
          audio_duration_ms: 501,
        }),
      }),
      { ok: false, reason: "event_time_out_of_bounds" }
    );
    assert.equal(
      (
        await settlementStore.persist({
          contract_version: 1,
          event_type: "runtime_settlement",
          session_id: SESSION_TRANSCRIPT_DEADLINE,
          room_name: "transcript-deadline-room",
          writer_id: "deadline-writer",
          writer_generation: 1,
          state: "settled",
          settled_at: "2026-07-10T05:30:00.000Z",
        })
      ).ok,
      true
    );

    const deadlineCompletion = await finalizeInterviewSession(
      {
        sessionId: SESSION_TRANSCRIPT_DEADLINE,
        actor: { type: "system", source: "hard_deadline" },
        requestedTerminalReason: "time_limit",
      },
      drizzle(clients[6]!, { schema })
    );
    assert.equal(deadlineCompletion.ok, true);
    if (deadlineCompletion.ok) {
      assert.equal(deadlineCompletion.lifecycle.state, "completed");
      assert.equal(deadlineCompletion.lifecycle.terminalReason, "time_limit");
      assert.equal(deadlineCompletion.stats.totalTurns, 5);
      assert.equal(deadlineCompletion.stats.userTurns, 3);
      assert.equal(deadlineCompletion.tier, "partial");
      assert.equal(deadlineCompletion.feedback.status, "pending");
      const replay = await stores[7]!.persist({
        principal: { kind: "voice_runtime" },
        event: deadlineEvents[4]!,
      });
      assert.equal(replay.ok && replay.disposition, "existing");
      const retry = await finalizeInterviewSession(
        {
          sessionId: SESSION_TRANSCRIPT_DEADLINE,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
        },
        drizzle(clients[7]!, { schema })
      );
      assert.equal(retry.ok, true);
      if (retry.ok) {
        assert.equal(retry.disposition, "existing");
        assert.deepEqual(retry.lifecycle, deadlineCompletion.lifecycle);
        assert.deepEqual(retry.stats, deadlineCompletion.stats);
        assert.equal(retry.feedback.id, deadlineCompletion.feedback.id);
      }
    }

    assert.equal(
      (
        await settlementStore.persist({
          contract_version: 1,
          event_type: "runtime_settlement",
          session_id: SESSION_TRANSCRIPT_DEADLINE_INVALID,
          room_name: "transcript-deadline-invalid-room",
          writer_id: "deadline-invalid-writer",
          writer_generation: 1,
          state: "settled",
          settled_at: "2026-07-10T05:30:00.000Z",
        })
      ).ok,
      true
    );
    assert.equal(
      await claimInterviewDeadline(
        {
          sessionId: SESSION_TRANSCRIPT_DEADLINE_INVALID,
          expectedState: "active",
          expectedVersion: 1,
          deadlineAt: new Date("2026-07-10T05:30:00.000Z"),
          terminalReason: "time_limit",
        },
        drizzle(clients[4]!, { schema })
      ),
      true
    );
    const invalidCompletion = await finalizeInterviewSession(
      {
        sessionId: SESSION_TRANSCRIPT_DEADLINE_INVALID,
        actor: { type: "system", source: "hard_deadline" },
        requestedTerminalReason: "time_limit",
      },
      drizzle(clients[6]!, { schema })
    );
    assert.equal(invalidCompletion.ok, true);
    if (invalidCompletion.ok) {
      assert.equal(invalidCompletion.lifecycle.state, "abandoned");
      assert.equal(
        invalidCompletion.lifecycle.terminalReason,
        "insufficient_signal"
      );
      assert.equal(invalidCompletion.lifecycle.version, 4);
      assert.equal(invalidCompletion.feedback.status, "skipped");
    }

    const marker = {
      contract_version: 1 as const,
      event_type: "integrity_unavailable" as const,
      event_id: "migration-writer:speech-unheard:unavailable",
      writer_id: "migration-marker-writer",
      writer_generation: 1,
      sequence: 1,
      session_id: SESSION_TRANSCRIPT_MARKER,
      room_name: "transcript-marker-room",
      speaker: "interviewer" as const,
      occurred_at: "2026-07-10T05:02:30.000Z",
      reason: "no_provider_confirmed_prefix" as const,
    };
    assert.equal((await markerStore.persist(marker)).ok, true);
    const markerReplay = await markerStore.persist(marker);
    assert.equal(markerReplay.ok && markerReplay.disposition, "existing");
    assert.deepEqual(
      await markerStore.persist({
        ...marker,
        event_id: "migration-writer:pre-session-marker",
        sequence: 99,
        occurred_at: "2026-07-10T04:59:59.999Z",
      }),
      { ok: false, reason: "event_time_out_of_bounds" }
    );
    assert.equal(
      (
        await markerStore.persist({
          ...marker,
          event_id: "migration-writer:user-unmeasured:unavailable",
          sequence: 2,
          speaker: "user",
          occurred_at: "2026-07-10T05:02:31.000Z",
          reason: "canonicalization_failed",
        })
      ).ok,
      true
    );
    const settlement = {
      contract_version: 1 as const,
      event_type: "runtime_settlement" as const,
      session_id: SESSION_TRANSCRIPT_MARKER,
      room_name: "transcript-marker-room",
      writer_id: "migration-marker-writer",
      writer_generation: 1,
      state: "degraded" as const,
      settled_at: "2026-07-10T05:02:32.000Z",
    };
    assert.deepEqual(
      await settlementStore.persist({
        ...settlement,
        settled_at: "2026-07-10T05:30:00.001Z",
      }),
      { ok: false, reason: "event_time_out_of_bounds" }
    );
    assert.equal((await settlementStore.persist(settlement)).ok, true);
    const settlementReplay = await settlementStore.persist(settlement);
    assert.equal(
      settlementReplay.ok && settlementReplay.disposition,
      "existing"
    );
    assert.deepEqual(
      await markerStore.persist({
        ...marker,
        event_id: "migration-writer:post-settlement-marker",
        sequence: 3,
        occurred_at: "2026-07-10T05:02:33.000Z",
      }),
      { ok: false, reason: "runtime_settled" }
    );
    assert.deepEqual(
      await stores[0]!.persist({
        principal: { kind: "voice_runtime" },
        event: createTranscriptEvent({
          ...event,
          event_id: "migration-writer:post-settlement-turn",
          writer_id: "migration-marker-writer",
          sequence: 4,
          session_id: SESSION_TRANSCRIPT_MARKER,
          room_name: "transcript-marker-room",
          started_at: "2026-07-10T05:02:34.000Z",
          ended_at: "2026-07-10T05:02:35.000Z",
          audio_duration_ms: 1_000,
        }),
      }),
      { ok: false, reason: "runtime_settled" }
    );
    const markerCompletion = await finalizeInterviewSession(
      {
        sessionId: SESSION_TRANSCRIPT_MARKER,
        actor: { type: "user", userId: USER_ONE },
        requestedTerminalReason: "user_end",
      },
      drizzle(clients[1]!, { schema })
    );
    assert.equal(markerCompletion.ok, true);
    if (markerCompletion.ok) {
      assert.equal(markerCompletion.lifecycle.state, "abandoned");
      assert.equal(
        markerCompletion.lifecycle.terminalReason,
        "insufficient_signal"
      );
      assert.equal(markerCompletion.feedback.status, "skipped");
      assert.equal(
        markerCompletion.feedback.statusReason,
        "transcript_integrity_degraded"
      );
      assert.equal(
        markerCompletion.feedback.outcomeReason,
        "transcript_integrity_degraded"
      );
    }
  } finally {
    await Promise.all(clients.map((client) => client.end()));
  }
}

async function verifyReconnectTimeoutRuntimeIntegrity(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { authorizeInterviewSessionEnd, finalizeInterviewSession },
    { createDrizzleInterviewReconnectStore },
    { getTranscriptRuntimeSettlementReadiness },
    { endInterviewSessionWorkflow },
    { enforceInterviewReconnectWorkflow },
    schema,
  ] = await Promise.all([
    import("../lib/db/end-interview-session"),
    import("../lib/db/session-reconnects"),
    import("../lib/db/transcripts"),
    import("../lib/workflows/end-interview-session"),
    import("../lib/workflows/enforce-interview-reconnect"),
    import("../lib/db/schema"),
  ]);
  const database = drizzle(sql, { schema });
  const deadlineAt = new Date("2026-07-10T08:00:30.000Z");
  const cases = [
    {
      sessionId: SESSION_RECONNECT_INTEGRITY_MISSING,
      settlement: null,
      interruption: null,
      expectedReason: "disconnect_timeout",
      expectedState: "completed",
      expectedFeedback: "pending",
      expectedEvidence: "partial",
      expectedModeConstraint: "evidence_limited_only",
    },
    {
      sessionId: SESSION_RECONNECT_INTEGRITY_DEGRADED,
      settlement: "degraded" as const,
      interruption: null,
      expectedReason: "insufficient_signal",
      expectedState: "abandoned",
      expectedFeedback: "skipped",
      expectedEvidence: "degraded",
      expectedModeConstraint: null,
    },
    {
      sessionId: SESSION_RECONNECT_INTEGRITY_CANDIDATE_INTERRUPTED,
      settlement: "settled" as const,
      interruption: {
        speaker: "user" as const,
        reason: "no_provider_confirmed_prefix" as const,
      },
      expectedReason: "insufficient_signal",
      expectedState: "abandoned",
      expectedFeedback: "skipped",
      expectedEvidence: "degraded",
      expectedModeConstraint: null,
    },
    {
      sessionId: SESSION_RECONNECT_INTEGRITY_INTERVIEWER_INTERRUPTED,
      settlement: "settled" as const,
      interruption: {
        speaker: "interviewer" as const,
        reason: "no_provider_confirmed_prefix" as const,
      },
      expectedReason: "disconnect_timeout",
      expectedState: "completed",
      expectedFeedback: "pending",
      expectedEvidence: "partial",
      expectedModeConstraint: "evidence_limited_only",
    },
    {
      sessionId: SESSION_RECONNECT_INTEGRITY_VALID,
      settlement: "settled" as const,
      interruption: null,
      expectedReason: "disconnect_timeout",
      expectedState: "completed",
      expectedFeedback: "pending",
      expectedEvidence: "complete",
      expectedModeConstraint: null,
    },
  ] as const;

  for (const [caseIndex, testCase] of cases.entries()) {
    const roomName = `reconnect-integrity-${caseIndex}`;
    await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, status, lifecycle_state,
        lifecycle_version, activated_at, started_at, livekit_room_name,
        config, last_transition_at, reconnect_deadline_at,
        reconnect_deadline_owner
      ) VALUES (
        ${testCase.sessionId}::uuid,
        ${USER_ONE}::uuid,
        'product_sense',
        'voice_video',
        'in_progress',
        'reconnecting',
        4,
        '2026-07-10T07:45:01.000Z'::timestamptz,
        '2026-07-10T07:45:00.000Z'::timestamptz,
        ${roomName},
        '{"duration":30}'::jsonb,
        '2026-07-10T08:00:00.000Z'::timestamptz,
        ${deadlineAt.toISOString()}::timestamptz,
        'reconnect_grace'
      )
    `;
    await sql`
      INSERT INTO transcript_turn (
        session_id, speaker, text, started_at, ended_at
      ) VALUES
        (${testCase.sessionId}::uuid, 'interviewer',
          'Please explain your product approach.',
          '2026-07-10T07:46:00.000Z'::timestamptz,
          '2026-07-10T07:46:01.000Z'::timestamptz),
        (${testCase.sessionId}::uuid, 'user',
          'I would begin with the target customer problem and define a measurable outcome before considering solutions.',
          '2026-07-10T07:47:00.000Z'::timestamptz,
          '2026-07-10T07:47:01.000Z'::timestamptz),
        (${testCase.sessionId}::uuid, 'interviewer',
          'How would you prioritize the opportunities?',
          '2026-07-10T07:49:00.000Z'::timestamptz,
          '2026-07-10T07:49:01.000Z'::timestamptz),
        (${testCase.sessionId}::uuid, 'user',
          'I would compare customer reach severity strategic alignment confidence and implementation effort before prioritizing.',
          '2026-07-10T07:50:00.000Z'::timestamptz,
          '2026-07-10T07:50:01.000Z'::timestamptz),
        (${testCase.sessionId}::uuid, 'user',
          'I would measure retained customer value supported by adoption quality and operational guardrail metrics.',
          '2026-07-10T07:52:00.000Z'::timestamptz,
          '2026-07-10T07:52:01.000Z'::timestamptz)
    `;
    await sql`
      INSERT INTO transcript_runtime_writer (
        session_id, generation, contract_version, room_name, writer_id,
        registered_at, last_observed_sequence, committed_sequence,
        committed_event_id, committed_through_at
      ) VALUES (
        ${testCase.sessionId}::uuid,
        1,
        1,
        ${roomName},
        ${`reconnect-integrity-writer-${caseIndex}`},
        '2026-07-10T07:45:00.000Z'::timestamptz,
        5,
        5,
        ${`reconnect-integrity-writer-${caseIndex}:5`},
        '2026-07-10T07:52:01.000Z'::timestamptz
      )
    `;
    await sql`
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY started_at, id)::int AS sequence
        FROM transcript_turn
        WHERE session_id = ${testCase.sessionId}::uuid
      )
      UPDATE transcript_turn turn_row
      SET contract_version = 2,
        event_id = ${`reconnect-integrity-writer-${caseIndex}:`} || ordered.sequence,
        writer_id = ${`reconnect-integrity-writer-${caseIndex}`},
        writer_generation = 1,
        sequence = ordered.sequence,
        room_name = ${roomName},
        audio_ms = 1000,
        section = CASE WHEN turn_row.speaker = 'user' THEN 'answer' ELSE 'follow_up' END,
        delivery_state = 'delivered'
      FROM ordered
      WHERE turn_row.id = ordered.id
    `;
    if (testCase.settlement) {
      await sql`
        INSERT INTO transcript_runtime_settlement (
          session_id, writer_generation, contract_version, room_name,
          writer_id, state, settled_at
        ) VALUES (
          ${testCase.sessionId}::uuid,
          1,
          1,
          ${roomName},
          ${`reconnect-integrity-writer-${caseIndex}`},
          ${testCase.settlement},
          ${deadlineAt.toISOString()}::timestamptz
        )
      `;
    }
    if (testCase.interruption) {
      await sql`
        INSERT INTO transcript_interruption_marker (
          session_id, contract_version, event_id, writer_id,
          writer_generation, sequence, room_name, speaker, occurred_at, reason
        ) VALUES (
          ${testCase.sessionId}::uuid,
          1,
          ${`reconnect-integrity-marker-${caseIndex}`},
          ${`reconnect-integrity-writer-${caseIndex}`},
          1,
          6,
          ${roomName},
          ${testCase.interruption.speaker},
          '2026-07-10T08:00:00.000Z'::timestamptz,
          ${testCase.interruption.reason}
        )
      `;
    }

    let dispatches = 0;
    const result = await enforceInterviewReconnectWorkflow(
      {
        sessionId: testCase.sessionId,
        expectedVersion: 4,
        deadlineAt: deadlineAt.toISOString(),
        env: { apiKey: "test", apiSecret: "test", url: "wss://test.invalid" },
      },
      {
        store: createDrizzleInterviewReconnectStore(database),
        inspectPresence: async () => ({
          ok: true,
          provider: "livekit",
          data: { present: false, joined: false, joinedAt: null, agent: null },
        }),
        terminateRoom: async () => ({
          ok: true,
          provider: "livekit",
          data: { roomName, disposition: "already_absent" as const },
        }),
        getSettlementReadiness: () =>
          getTranscriptRuntimeSettlementReadiness(testCase.sessionId, database),
        requestRuntimeSettlement: async () => ({
          ok: true,
          provider: "livekit",
          data: {},
        }),
        waitForRuntimeSettlement: () =>
          getTranscriptRuntimeSettlementReadiness(testCase.sessionId, database),
        endSession: (sessionId) =>
          endInterviewSessionWorkflow(
            {
              sessionId,
              actor: { type: "system", source: "reconnect_timeout" },
              requestedTerminalReason: "disconnect_timeout",
            },
            {
              authorize: (input) =>
                authorizeInterviewSessionEnd(input, database),
              finalize: (input) => finalizeInterviewSession(input, database),
              settleCredit: async () => undefined,
              dispatch: async ({ sessionId: dispatchedSessionId }) => {
                dispatches += 1;
                return {
                  ok: true,
                  disposition: "sent",
                  dispatch: {
                    sessionId: dispatchedSessionId,
                    eventId: `feedback/generate.requested:${dispatchedSessionId}:1`,
                    status: "sent",
                    attempts: 1,
                    claimedAt: deadlineAt,
                    dispatchedAt: deadlineAt,
                  },
                };
              },
            }
          ),
      }
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) continue;
    assert.equal(
      result.completion?.completion.lifecycle.terminalReason,
      testCase.expectedReason
    );
    assert.equal(
      result.completion?.completion.lifecycle.state,
      testCase.expectedState
    );
    assert.equal(
      result.completion?.completion.feedback.status,
      testCase.expectedFeedback
    );
    assert.equal(result.completion?.dispatch === null, dispatches === 0);
    assert.equal(dispatches, testCase.expectedFeedback === "pending" ? 1 : 0);

    const [stored] = await sql<
      {
        lifecycle_state: string;
        terminal_reason: string;
        feedback_status: string;
        dispatch_status: string;
        transcript_evidence_state: string;
        feedback_mode_constraint: string | null;
      }[]
    >`
      SELECT session.lifecycle_state, session.terminal_reason,
        session.transcript_evidence_state,
        feedback.status AS feedback_status, feedback.dispatch_status,
        feedback.completion_stats->>'feedbackModeConstraint'
          AS feedback_mode_constraint
      FROM interview_session session
      JOIN feedback ON feedback.session_id = session.id
      WHERE session.id = ${testCase.sessionId}::uuid
    `;
    assert.deepEqual(stored, {
      lifecycle_state: testCase.expectedState,
      terminal_reason: testCase.expectedReason,
      feedback_status: testCase.expectedFeedback,
      transcript_evidence_state: testCase.expectedEvidence,
      feedback_mode_constraint: testCase.expectedModeConstraint,
      dispatch_status:
        testCase.expectedFeedback === "pending" ? "pending" : "not_required",
    });
  }
}

async function waitForDatabaseLock(sql: postgres.Sql, pid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [activity] = await sql<{ wait_event_type: string | null }[]>`
      SELECT wait_event_type
      FROM pg_stat_activity
      WHERE pid = ${pid}
    `;
    if (activity?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`database backend ${pid} did not wait for the session-row lock`);
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

async function verifyStableStartContract(sql: postgres.Sql) {
  const missingAttempt = "f3333333-3333-4333-8333-333333333333";
  const eventId = `turn:${STABLE_START_ATTEMPT}:1`;
  const replacementEventId = `turn:${STABLE_START_ATTEMPT}:2`;
  const fingerprint = "a".repeat(64);
  const roomName = `interview-${STABLE_START_ATTEMPT}`;

  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${USER_TWO}::uuid, 'stable-start-contract@example.invalid')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_question (id, question_text, question_type)
    VALUES (
      ${STABLE_START_QUESTION}::uuid,
      'Design a launch plan for a PM interview practice product.',
      'Product Strategy'
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, livekit_room_name,
      start_contract_version, start_attempt_id, start_request_fingerprint,
      provisioning_state
    ) VALUES (
      ${STABLE_START_ATTEMPT}::uuid, ${USER_TWO}::uuid,
      'strategy', 'voice_video', ${roomName},
      1, ${STABLE_START_ATTEMPT}::uuid, ${fingerprint}, 'pending'
    )
  `;
  await sql`
    INSERT INTO session_question (
      session_id, question_id, start_contract_version, start_attempt_id
    ) VALUES (
      ${STABLE_START_ATTEMPT}::uuid, ${STABLE_START_QUESTION}::uuid,
      1, ${STABLE_START_ATTEMPT}::uuid
    )
  `;
  await sql`
    INSERT INTO credit_reservation (
      user_id, reservation_key, status, credits, session_id,
      start_contract_version, start_attempt_id, expires_at
    ) VALUES (
      ${USER_TWO}::uuid,
      ${`interview-start:${USER_TWO}:${STABLE_START_ATTEMPT}`},
      'active', 1, ${STABLE_START_ATTEMPT}::uuid,
      1, ${STABLE_START_ATTEMPT}::uuid, now() + interval '2 hours'
    )
  `;

  await assert.rejects(
    () => sql`
      INSERT INTO session_question (
        session_id, question_id, start_contract_version, start_attempt_id
      ) VALUES (
        ${STABLE_START_ATTEMPT}::uuid, ${STABLE_START_QUESTION}::uuid,
        1, ${STABLE_START_ATTEMPT}::uuid
      )
    `,
    /duplicate key/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, livekit_room_name,
        start_contract_version, start_attempt_id, start_request_fingerprint,
        provisioning_state
      ) VALUES (
        ${STABLE_START_ATTEMPT}::uuid, ${USER_TWO}::uuid,
        'strategy', 'voice_video', ${roomName},
        1, ${STABLE_START_ATTEMPT}::uuid, ${fingerprint}, 'pending'
      )
    `,
    /duplicate key/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO credit_reservation (
        user_id, reservation_key, status, credits, session_id,
        start_contract_version, start_attempt_id, expires_at
      ) VALUES (
        ${USER_ONE}::uuid,
        ${`interview-start:${USER_ONE}:${missingAttempt}`},
        'active', 1, ${missingAttempt}::uuid,
        1, ${missingAttempt}::uuid, now() + interval '2 hours'
      )
    `,
    /foreign key/
  );

  const leaseId = "f4444444-4444-4444-8444-444444444444";
  await sql`
    UPDATE interview_session
    SET provisioning_state = 'provisioning',
      provisioning_lease_id = ${leaseId}::uuid,
      provisioning_lease_expires_at = now() + interval '1 minute'
    WHERE id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    UPDATE interview_session
    SET provisioning_state = 'ready',
      provisioning_lease_id = NULL,
      provisioning_lease_expires_at = NULL,
      provisioned_at = now()
    WHERE id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await assert.rejects(
    () => sql`
      UPDATE interview_session
      SET usable_at = now(), usable_transcript_event_id = ${eventId}
      WHERE id = ${STABLE_START_ATTEMPT}::uuid
    `,
    /interview_session_usable_evidence_check/
  );
  await sql`
    UPDATE interview_session
    SET activated_at = now()
    WHERE id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    INSERT INTO transcript_runtime_writer (
      session_id, generation, contract_version, room_name, writer_id,
      registered_at
    ) VALUES (
      ${STABLE_START_ATTEMPT}::uuid, 1, 1, ${roomName}, 'migration-test',
      now() - interval '3 seconds'
    )
  `;
  await sql`
    INSERT INTO transcript_turn (
      session_id, contract_version, event_id, writer_id, writer_generation,
      sequence,
      room_name, speaker, started_at, ended_at, text, audio_ms,
      section, delivery_state
    ) VALUES (
      ${STABLE_START_ATTEMPT}::uuid, 2, ${eventId}, 'migration-test', 1, 1,
      ${roomName}, 'interviewer', now() - interval '2 seconds', now(),
      'Welcome to your interview.', 1800, 'opening', 'delivered'
    )
  `;
  await sql`
    UPDATE interview_session
    SET usable_at = now(), usable_transcript_event_id = ${eventId}
    WHERE id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await assert.rejects(
    () => sql`
      UPDATE interview_session
      SET usable_transcript_event_id = ${replacementEventId}
      WHERE id = ${STABLE_START_ATTEMPT}::uuid
    `,
    /usable evidence is immutable/
  );
  await assert.rejects(
    () => sql`
      UPDATE interview_session
      SET provisioned_at = now() + interval '1 second'
      WHERE id = ${STABLE_START_ATTEMPT}::uuid
    `,
    /provisioning acknowledgement is immutable/
  );

  await sql`
    DELETE FROM credit_reservation
    WHERE session_id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    DELETE FROM session_question
    WHERE session_id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    DELETE FROM transcript_turn
    WHERE session_id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    DELETE FROM transcript_runtime_writer
    WHERE session_id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    DELETE FROM interview_session
    WHERE id = ${STABLE_START_ATTEMPT}::uuid
  `;
  await sql`
    DELETE FROM interview_question
    WHERE id = ${STABLE_START_QUESTION}::uuid
  `;
}

async function verifyStableStartNegativePreflight(
  sql: postgres.Sql,
  databaseUrl: string
) {
  const staleAttempt = "f5555555-5555-4555-8555-555555555555";
  const terminalAttempt = "f6666666-6666-4666-8666-666666666666";
  const fingerprint = "b".repeat(64);

  for (const attempt of [staleAttempt, terminalAttempt]) {
    await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, livekit_room_name,
        start_contract_version, start_attempt_id, start_request_fingerprint,
        provisioning_state, last_transition_at
      ) VALUES (
        ${attempt}::uuid, ${USER_TWO}::uuid, 'strategy', 'voice_video',
        ${`interview-${attempt}`}, 1, ${attempt}::uuid, ${fingerprint},
        'pending', now() - interval '10 minutes'
      )
    `;
    await sql`
      INSERT INTO credit_reservation (
        user_id, reservation_key, status, credits, session_id,
        start_contract_version, start_attempt_id, expires_at
      ) VALUES (
        ${USER_TWO}::uuid,
        ${`interview-start:${USER_TWO}:${attempt}`},
        'active', 1, ${attempt}::uuid, 1, ${attempt}::uuid,
        now() + interval '2 hours'
      )
    `;
  }
  await sql`
    UPDATE interview_session
    SET provisioning_state = 'failed', lifecycle_state = 'failed',
      lifecycle_version = lifecycle_version + 1,
      terminal_reason = 'provider_failure', status = 'error',
      ending_at = now(), ended_at = now(), last_transition_at = now(),
      room_cleanup_pending = true
    WHERE id = ${terminalAttempt}::uuid
  `;

  try {
    const diagnostic = runPreflight(databaseUrl, true, "reconciled")!;
    assert.equal(diagnostic.stableStartLaunchReady, false);
    assert.equal(
      diagnostic.stableStartIntegrity.terminal_v1_active_reservations,
      1
    );
    assert.equal(
      diagnostic.stableStartIntegrity.non_ready_or_stale_v1_active_reservations,
      1
    );

    const strict = runStrictPreflight(databaseUrl);
    assert.equal(strict.status, 1);
    assert.match(
      `${strict.stdout}\n${strict.stderr}`,
      /Interview credit launch readiness checks are not clean/
    );
  } finally {
    await sql`
      DELETE FROM credit_reservation
      WHERE session_id IN (${staleAttempt}::uuid, ${terminalAttempt}::uuid)
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id IN (${staleAttempt}::uuid, ${terminalAttempt}::uuid)
    `;
  }
}

async function verifyStableStartConcurrency(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    {
      createDrizzleInterviewStartStore,
      INTERVIEW_PROVISIONING_LEASE_MS,
      InterviewProvisioningLeaseLostError,
    },
    { createCreditLedgerService },
    { createDrizzleCreditLedgerStore },
    { createDrizzleInterviewCreditSettlementStore },
    { createDrizzleInterviewStartRecoveryStore },
    { convergeInterviewCreditSettlement },
    schema,
  ] = await Promise.all([
    import("../lib/db/interview-starts"),
    import("../lib/billing/credits"),
    import("../lib/billing/credit-ledger-store"),
    import("../lib/db/interview-credit-settlement"),
    import("../lib/db/interview-start-recovery"),
    import("../lib/workflows/converge-interview-credit-settlement"),
    import("../lib/db/schema"),
  ]);
  const questionId = "f7777777-7777-4777-8777-777777777777";
  const sameUser = "51000000-0000-4000-8000-000000000001";
  const distinctUser = "51000000-0000-4000-8000-000000000002";
  const orderingUser = "51000000-0000-4000-8000-000000000003";
  const lockWaitUser = "51000000-0000-4000-8000-000000000004";
  const sameAttempt = "52000000-0000-4000-8000-000000000001";
  const distinctAttempts = [
    "52000000-0000-4000-8000-000000000002",
    "52000000-0000-4000-8000-000000000003",
  ];
  const orderingAttempts = [
    "52000000-0000-4000-8000-000000000004",
    "52000000-0000-4000-8000-000000000005",
  ];
  const lockWaitAttempts = [
    "52000000-0000-4000-8000-000000000006",
    "52000000-0000-4000-8000-000000000007",
  ];
  const now = new Date();
  const clients = Array.from({ length: 6 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const databases = clients.map((client) => drizzle(client, { schema }));
  const startStores = databases.map((database) =>
    createDrizzleInterviewStartStore(database)
  );
  const ledgers = databases.map((database) =>
    createCreditLedgerService({
      store: createDrizzleCreditLedgerStore(database),
      now: () => now,
    })
  );
  const question = {
    id: questionId,
    company: "Example",
    questionText: "How would you relaunch a PM interview practice product?",
    questionType: "Product Strategy",
    askedAt: null,
    isActive: true,
    createdAt: now,
  };
  const makeStart = (userId: string, attemptId: string) => ({
    startAttemptId: attemptId,
    userId,
    requestFingerprint: "c".repeat(64),
    role: "pm",
    roundType: "strategy" as const,
    mode: "voice_video" as const,
    roomName: `interview-${attemptId}`,
    config: { duration: 30 },
    startedAt: now,
    question,
  });
  const prepare = (
    store: (typeof startStores)[number],
    userId: string,
    attemptId: string
  ) =>
    store.createOrLoadAndReserve({
      start: makeStart(userId, attemptId),
      reservation: {
        userId,
        reservationKey: `interview-start:${userId}:${attemptId}`,
        sessionId: attemptId,
        startContractVersion: 1,
        startAttemptId: attemptId,
      },
      currentTime: now,
    });

  try {
    await Promise.all(clients.map((client) => client`SELECT 1`));
    await sql`
      INSERT INTO interview_question (
        id, question_text, question_type, company, source_kind,
        source_fingerprint, quality_status, is_active
      ) VALUES (
        ${questionId}::uuid, ${question.questionText},
        ${question.questionType}, ${question.company}, 'google_sheets',
        ${"d".repeat(64)}, 'published', true
      )
    `;
    for (const [index, userId] of [
      sameUser,
      distinctUser,
      orderingUser,
      lockWaitUser,
    ].entries()) {
      await seedCreditTestUser(sql, userId, `stable-start-${index}`);
    }

    await ledgers[0]!.grantCredits({
      userId: sameUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:stable-start:same-attempt-grant",
      includedCredits: 1,
      expiresAt: null,
    });
    const sameResults = await runConcurrently(
      startStores.map((store) => () => prepare(store, sameUser, sameAttempt))
    );
    assert.equal(rejected(sameResults).length, 0);
    const sameValues = fulfilled(sameResults).map(({ value }) => value);
    assert.ok(
      sameValues.every(
        ({ start, credit }) =>
          start.sessionId === sameAttempt &&
          credit.reservation.id === sameValues[0]!.credit.reservation.id
      )
    );
    const [sameCounts] = await sql<
      { sessions: number; reservations: number; reserve_events: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM interview_session
          WHERE id = ${sameAttempt}::uuid) AS sessions,
        (SELECT count(*)::int FROM credit_reservation
          WHERE session_id = ${sameAttempt}::uuid) AS reservations,
        (SELECT count(*)::int FROM credit_transaction transaction
          JOIN credit_reservation reservation
            ON reservation.id = transaction.reservation_id
          WHERE reservation.session_id = ${sameAttempt}::uuid
            AND transaction.type = 'reserve') AS reserve_events
    `;
    assert.deepEqual(sameCounts, {
      sessions: 1,
      reservations: 1,
      reserve_events: 1,
    });

    const expiredLeaseId = "f8888888-8888-4888-8888-888888888888";
    const provisioningDeadlineAt = new Date(now.getTime() + 30 * 60_000);
    const provisioningClaim = await startStores[0]!.claimProvisioning({
      startAttemptId: sameAttempt,
      userId: sameUser,
      requestFingerprint: "c".repeat(64),
      leaseId: expiredLeaseId,
      now,
      deadlineAt: provisioningDeadlineAt,
    });
    assert.equal(provisioningClaim.disposition, "claimed");
    await sql`
      UPDATE interview_session
      SET provisioning_lease_expires_at = CURRENT_TIMESTAMP - interval '1 second'
      WHERE id = ${sameAttempt}::uuid
    `;
    await assert.rejects(
      () =>
        startStores[1]!.markProvisioned({
          startAttemptId: sameAttempt,
          leaseId: expiredLeaseId,
          provisionedAt: new Date(
            now.getTime() + INTERVIEW_PROVISIONING_LEASE_MS
          ),
          deadlineAt: provisioningDeadlineAt,
        }),
      InterviewProvisioningLeaseLostError
    );

    const recoveryStore = createDrizzleInterviewStartRecoveryStore(
      databases[0]!
    );
    const recoveryNow = new Date(now.getTime() + 10 * 60_000);
    assert.ok(
      (await recoveryStore.listCandidates({ now: recoveryNow })).some(
        ({ sessionId }) => sessionId === sameAttempt
      )
    );
    assert.equal(
      (await recoveryStore.claim({ sessionId: sameAttempt, now: recoveryNow }))
        .disposition,
      "claimed"
    );
    assert.equal(
      (
        await convergeInterviewCreditSettlement({
          sessionId: sameAttempt,
          store: createDrizzleInterviewCreditSettlementStore(databases[1]!),
          now: recoveryNow,
        })
      ).disposition,
      "released"
    );
    const [recoveredStart] = await sql<
      {
        lifecycle_state: string;
        terminal_reason: string;
        provisioning_state: string;
        room_cleanup_pending: boolean;
        reservation_status: string;
      }[]
    >`
      SELECT session.lifecycle_state, session.terminal_reason,
        session.provisioning_state, session.room_cleanup_pending,
        reservation.status AS reservation_status
      FROM interview_session session
      JOIN credit_reservation reservation ON reservation.session_id = session.id
      WHERE session.id = ${sameAttempt}::uuid
    `;
    assert.deepEqual(recoveredStart, {
      lifecycle_state: "failed",
      terminal_reason: "provider_failure",
      provisioning_state: "failed",
      room_cleanup_pending: true,
      reservation_status: "released",
    });
    assert.ok(
      !(await recoveryStore.listCandidates({ now: recoveryNow })).some(
        ({ sessionId }) => sessionId === sameAttempt
      )
    );

    await ledgers[0]!.grantCredits({
      userId: distinctUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:stable-start:distinct-grant",
      includedCredits: 1,
      expiresAt: null,
    });
    const distinctResults = await runConcurrently(
      distinctAttempts.map(
        (attemptId, index) => () =>
          prepare(startStores[index]!, distinctUser, attemptId)
      )
    );
    assert.equal(fulfilled(distinctResults).length, 1);
    assert.equal(rejected(distinctResults).length, 1);
    assert.match(
      errorMessage(rejected(distinctResults)[0]!.reason),
      /insufficient_credits/
    );
    const [distinctCounts] = await sql<
      { sessions: number; reservations: number; remaining: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM interview_session
          WHERE user_id = ${distinctUser}::uuid) AS sessions,
        (SELECT count(*)::int FROM credit_reservation
          WHERE user_id = ${distinctUser}::uuid) AS reservations,
        (SELECT sum(remaining_credits)::int FROM credit_grant
          WHERE user_id = ${distinctUser}::uuid) AS remaining
    `;
    assert.deepEqual(distinctCounts, {
      sessions: 1,
      reservations: 1,
      remaining: 0,
    });

    await ledgers[0]!.grantCredits({
      userId: orderingUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:stable-start:ordering-grant",
      includedCredits: 2,
      expiresAt: null,
    });
    for (const [index, attemptId] of orderingAttempts.entries()) {
      await prepare(startStores[index]!, orderingUser, attemptId);
    }
    const settlementStores = databases.map((database) =>
      createDrizzleInterviewCreditSettlementStore(database)
    );
    const converge = (attemptId: string, index = 0) =>
      convergeInterviewCreditSettlement({
        sessionId: attemptId,
        store: settlementStores[index]!,
        now,
      });
    const insertTurn = async (attemptId: string, sequence: number) => {
      await sql`
        INSERT INTO transcript_runtime_writer (
          session_id, generation, contract_version, room_name, writer_id,
          registered_at
        ) VALUES (
          ${attemptId}::uuid, 1, 1, ${`interview-${attemptId}`},
          'stable-start-pg', ${now.toISOString()}::timestamptz
        )
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO transcript_turn (
          session_id, contract_version, event_id, writer_id,
          writer_generation, sequence, room_name, speaker, started_at,
          ended_at, text, audio_ms, section, delivery_state
        ) VALUES (
          ${attemptId}::uuid, 2, ${`stable-start:${attemptId}:turn`},
          'stable-start-pg', 1, ${sequence}, ${`interview-${attemptId}`},
          'interviewer', ${now.toISOString()}::timestamptz,
          ${new Date(now.getTime() + 1000).toISOString()}::timestamptz,
          'Welcome to your interview.', 1000, 'opening', 'delivered'
        )
      `;
    };
    const activate = (attemptId: string) => sql`
      UPDATE interview_session
      SET lifecycle_state = 'active', lifecycle_version = lifecycle_version + 1,
        activated_at = ${now.toISOString()}::timestamptz,
        last_transition_at = ${now.toISOString()}::timestamptz
      WHERE id = ${attemptId}::uuid
    `;

    await insertTurn(orderingAttempts[0]!, 1);
    assert.equal((await converge(orderingAttempts[0]!)).disposition, "pending");
    await activate(orderingAttempts[0]!);
    assert.equal(
      (await converge(orderingAttempts[0]!)).disposition,
      "consumed"
    );

    await activate(orderingAttempts[1]!);
    assert.equal((await converge(orderingAttempts[1]!)).disposition, "pending");
    await insertTurn(orderingAttempts[1]!, 1);
    const stressResults = await runConcurrently(
      settlementStores.map(
        (_, index) => () => converge(orderingAttempts[1]!, index)
      )
    );
    assert.equal(rejected(stressResults).length, 0);
    assert.ok(
      fulfilled(stressResults).every(
        ({ value }) => value.disposition === "consumed"
      )
    );
    const [orderingCounts] = await sql<
      { consumed: number; usable: number; consume_events: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM credit_reservation
          WHERE user_id = ${orderingUser}::uuid AND status = 'consumed')
          AS consumed,
        (SELECT count(*)::int FROM interview_session
          WHERE user_id = ${orderingUser}::uuid AND usable_at IS NOT NULL)
          AS usable,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${orderingUser}::uuid AND type = 'consume')
          AS consume_events
    `;
    assert.deepEqual(orderingCounts, {
      consumed: 2,
      usable: 2,
      consume_events: 2,
    });

    await ledgers[0]!.grantCredits({
      userId: lockWaitUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:stable-start:lock-wait-grant",
      includedCredits: 2,
      expiresAt: null,
    });

    await prepare(startStores[0]!, lockWaitUser, lockWaitAttempts[0]!);
    const [deadlineRow] = await clients[0]!<
      {
        started_at: Date;
        deadline_at: Date;
      }[]
    >`
      UPDATE interview_session
      SET started_at = clock_timestamp() - interval '29 minutes 59.8 seconds'
      WHERE id = ${lockWaitAttempts[0]}::uuid
      RETURNING started_at, started_at + interval '30 minutes' AS deadline_at
    `;
    assert.ok(deadlineRow);
    let pendingDeadlineClaim:
      | ReturnType<(typeof startStores)[number]["claimProvisioning"]>
      | undefined;
    await clients[0]!.begin(async (transaction) => {
      await transaction`
        SELECT id FROM interview_session
        WHERE id = ${lockWaitAttempts[0]}::uuid
        FOR UPDATE
      `;
      pendingDeadlineClaim = startStores[1]!.claimProvisioning({
        startAttemptId: lockWaitAttempts[0]!,
        userId: lockWaitUser,
        requestFingerprint: "c".repeat(64),
        leaseId: "f9999999-9999-4999-8999-999999999991",
        now: new Date(deadlineRow.started_at),
        deadlineAt: new Date(deadlineRow.deadline_at),
      });
      await transaction`SELECT pg_sleep(0.35)`;
    });
    const deadlineClaim = await pendingDeadlineClaim!;
    assert.equal(deadlineClaim?.disposition, "not_joinable");

    await prepare(startStores[2]!, lockWaitUser, lockWaitAttempts[1]!);
    const leaseDeadlineAt = new Date(now.getTime() + 30 * 60_000);
    const leaseId = "f9999999-9999-4999-8999-999999999992";
    const leaseClaim = await startStores[2]!.claimProvisioning({
      startAttemptId: lockWaitAttempts[1]!,
      userId: lockWaitUser,
      requestFingerprint: "c".repeat(64),
      leaseId,
      now,
      deadlineAt: leaseDeadlineAt,
    });
    assert.equal(leaseClaim.disposition, "claimed");
    await clients[2]!`
      UPDATE interview_session
      SET lifecycle_state = 'connecting',
        provisioning_lease_expires_at = clock_timestamp() + interval '200 milliseconds'
      WHERE id = ${lockWaitAttempts[1]}::uuid
    `;
    let delayedAcknowledgement: Promise<unknown> | undefined;
    await clients[2]!.begin(async (transaction) => {
      await transaction`
        SELECT id FROM interview_session
        WHERE id = ${lockWaitAttempts[1]}::uuid
        FOR UPDATE
      `;
      delayedAcknowledgement = startStores[3]!.markProvisioned({
        startAttemptId: lockWaitAttempts[1]!,
        leaseId,
        provisionedAt: now,
        deadlineAt: leaseDeadlineAt,
      });
      await transaction`SELECT pg_sleep(0.35)`;
    });
    await assert.rejects(
      delayedAcknowledgement!,
      InterviewProvisioningLeaseLostError
    );
  } finally {
    // The v1 correlation FK is NO ACTION. Exercise the application-required
    // deletion order: reservation evidence first, then session, then user.
    await sql`
      DELETE FROM credit_transaction
      WHERE user_id IN (${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid, ${lockWaitUser}::uuid)
    `;
    await sql`
      DELETE FROM credit_reservation_grant allocation
      USING credit_reservation reservation
      WHERE allocation.reservation_id = reservation.id
        AND reservation.user_id IN (
          ${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid,
          ${lockWaitUser}::uuid
        )
    `;
    await sql`
      DELETE FROM credit_reservation
      WHERE user_id IN (${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid, ${lockWaitUser}::uuid)
    `;
    await sql`
      DELETE FROM credit_grant
      WHERE user_id IN (${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid, ${lockWaitUser}::uuid)
    `;
    await sql`
      DELETE FROM transcript_turn
      WHERE session_id IN (
        ${sameAttempt}::uuid,
        ${distinctAttempts[0]}::uuid, ${distinctAttempts[1]}::uuid,
        ${orderingAttempts[0]}::uuid, ${orderingAttempts[1]}::uuid,
        ${lockWaitAttempts[0]}::uuid, ${lockWaitAttempts[1]}::uuid
      )
    `;
    await sql`
      DELETE FROM transcript_runtime_writer
      WHERE session_id IN (
        ${sameAttempt}::uuid,
        ${distinctAttempts[0]}::uuid, ${distinctAttempts[1]}::uuid,
        ${orderingAttempts[0]}::uuid, ${orderingAttempts[1]}::uuid,
        ${lockWaitAttempts[0]}::uuid, ${lockWaitAttempts[1]}::uuid
      )
    `;
    await sql`
      DELETE FROM session_question
      WHERE session_id IN (
        ${sameAttempt}::uuid,
        ${distinctAttempts[0]}::uuid, ${distinctAttempts[1]}::uuid,
        ${orderingAttempts[0]}::uuid, ${orderingAttempts[1]}::uuid,
        ${lockWaitAttempts[0]}::uuid, ${lockWaitAttempts[1]}::uuid
      )
    `;
    await sql`
      DELETE FROM interview_session
      WHERE user_id IN (${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid, ${lockWaitUser}::uuid)
    `;
    await sql`
      DELETE FROM interview_question WHERE id = ${questionId}::uuid
    `;
    await sql`
      DELETE FROM app_user
      WHERE id IN (${sameUser}::uuid, ${distinctUser}::uuid, ${orderingUser}::uuid, ${lockWaitUser}::uuid)
    `;
    await Promise.all(clients.map((client) => client.end()));
  }
}

async function verifyStableStartQuestionSelectionAuthority(
  sql: postgres.Sql,
  databaseUrl: string
) {
  const userId = "51000000-0000-4000-8000-000000000005";
  const explicitQuestionId = "54000000-0000-4000-8000-000000000001";
  const rankedQuestionId = "54000000-0000-4000-8000-000000000002";
  const retryQuestionId = "54000000-0000-4000-8000-000000000003";
  const explicitAttempt = "53000000-0000-4000-8000-000000000001";
  const rankedAttempt = "53000000-0000-4000-8000-000000000002";
  const fallbackAttempt = "53000000-0000-4000-8000-000000000003";
  const now = new Date("2026-08-18T12:00:00.000Z");
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const [
    { createDrizzleInterviewStartStore },
    {
      QUESTION_RANKER_VERSION,
      QUESTION_RANKING_CONTRACT_VERSION,
      addQuestionSelectionToStartConfig,
      buildQuestionRankingFallback,
      createExplicitQuestionSelection,
      createRankedQuestionSelection,
    },
    schema,
  ] = await Promise.all([
    import("../lib/db/interview-starts"),
    import("@meelni/core"),
    import("../lib/db/schema"),
  ]);
  const store = createDrizzleInterviewStartStore(drizzle(client, { schema }));
  const persistedText = "Persisted replay bytes — unchanged by catalog edits";
  const makeCatalogQuestion = (id: string, text: string) => ({
    id,
    company: "Persisted Company",
    questionText: text,
    questionType: "Product Sense",
    askedAt: now,
    isActive: true,
    createdAt: now,
  });
  const explicitQuestion = makeCatalogQuestion(
    explicitQuestionId,
    `${persistedText} explicit`
  );
  const rankedQuestion = makeCatalogQuestion(
    rankedQuestionId,
    `${persistedText} ranked`
  );
  const retryQuestion = makeCatalogQuestion(
    retryQuestionId,
    "Concurrent retry catalog bytes"
  );
  const snapshot = (question: ReturnType<typeof makeCatalogQuestion>) => ({
    id: question.id,
    company: question.company,
    text: question.questionText,
    type: question.questionType,
    roundType: "product_sense" as const,
    askedAt: question.askedAt.toISOString(),
    isActive: true as const,
    createdAt: question.createdAt.toISOString(),
  });
  const rankedSelection = (question: ReturnType<typeof makeCatalogQuestion>) =>
    createRankedQuestionSelection({
      candidate: {
        id: question.id,
        company: question.company,
        text: question.questionText,
        roundType: "product_sense",
        difficulty: "intermediate",
        sourceKind: "google_sheets",
        qualityStatus: "published",
        askedAt: question.askedAt.toISOString(),
        isActive: true,
      },
      questionType: question.questionType,
      receipt: {
        contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
        rankerVersion: QUESTION_RANKER_VERSION,
        catalogVersion: "question-catalog:authority-test",
        questionId: question.id,
        reasonCode: "requested_round",
      },
    });
  const makeStart = (
    attemptId: string,
    question:
      | ReturnType<typeof makeCatalogQuestion>
      | {
          id: string;
          company: string | null;
          questionText: string;
          questionType: string;
          askedAt: Date | null;
          isActive: true;
          createdAt: Date | null;
        },
    config: Record<string, unknown>
  ) => ({
    startAttemptId: attemptId,
    userId,
    requestFingerprint: "e".repeat(64),
    role: "pm",
    roundType: "product_sense" as const,
    mode: "voice_video" as const,
    roomName: `interview-${attemptId}`,
    config,
    startedAt: now,
    question,
  });

  try {
    await seedCreditTestUser(sql, userId, "stable-start-selection-authority");
    await sql`
      INSERT INTO interview_question (
        id, company, question_text, question_type, difficulty, asked_at,
        source_kind, source_fingerprint, quality_status, is_active, created_at
      ) VALUES
        (
          ${explicitQuestion.id}::uuid, ${explicitQuestion.company},
          ${explicitQuestion.questionText}, ${explicitQuestion.questionType},
          'Medium', ${now.toISOString()}::timestamptz, 'google_sheets',
          ${"1".repeat(64)}, 'published', true,
          ${now.toISOString()}::timestamptz
        ),
        (
          ${rankedQuestion.id}::uuid, ${rankedQuestion.company},
          ${rankedQuestion.questionText}, ${rankedQuestion.questionType},
          'Medium', ${now.toISOString()}::timestamptz, 'google_sheets',
          ${"2".repeat(64)}, 'published', true,
          ${now.toISOString()}::timestamptz
        ),
        (
          ${retryQuestion.id}::uuid, ${retryQuestion.company},
          ${retryQuestion.questionText}, ${retryQuestion.questionType},
          'Medium', ${now.toISOString()}::timestamptz, 'google_sheets',
          ${"3".repeat(64)}, 'published', true,
          ${now.toISOString()}::timestamptz
        )
    `;

    await store.createOrLoad(
      makeStart(
        explicitAttempt,
        explicitQuestion,
        addQuestionSelectionToStartConfig(
          { duration: 30 },
          createExplicitQuestionSelection(snapshot(explicitQuestion))
        )
      )
    );
    await store.createOrLoad(
      makeStart(
        rankedAttempt,
        rankedQuestion,
        addQuestionSelectionToStartConfig(
          { duration: 30 },
          rankedSelection(rankedQuestion)
        )
      )
    );
    await sql`
      UPDATE interview_question
      SET company = 'Edited Company',
        question_text = 'Edited catalog bytes',
        quality_status = 'retired_source_missing',
        is_active = false
      WHERE id IN (${explicitQuestionId}::uuid, ${rankedQuestionId}::uuid)
    `;
    const explicitReplay = await store.find({
      startAttemptId: explicitAttempt,
      userId,
      requestFingerprint: "e".repeat(64),
    });
    const rankedReplay = await store.find({
      startAttemptId: rankedAttempt,
      userId,
      requestFingerprint: "e".repeat(64),
    });
    assert.deepEqual(explicitReplay?.question, explicitQuestion);
    assert.deepEqual(rankedReplay?.question, {
      ...rankedQuestion,
      createdAt: null,
    });

    const fallback = buildQuestionRankingFallback({
      roundType: "product_sense",
      difficulty: "intermediate",
      company: null,
    });
    const fallbackQuestion = {
      id: fallback.id,
      company: fallback.company,
      questionText: fallback.text,
      questionType: "Product Sense",
      askedAt: fallback.askedAt ? new Date(fallback.askedAt) : null,
      isActive: true as const,
      createdAt: null,
    };
    const fallbackSelection = createRankedQuestionSelection({
      candidate: fallback,
      questionType: fallbackQuestion.questionType,
      receipt: {
        contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
        rankerVersion: QUESTION_RANKER_VERSION,
        catalogVersion: "question-catalog:unavailable",
        questionId: fallback.id,
        reasonCode: "catalog_fallback",
      },
    });
    await store.createOrLoad(
      makeStart(
        fallbackAttempt,
        fallbackQuestion,
        addQuestionSelectionToStartConfig({ duration: 30 }, fallbackSelection)
      )
    );
    const conflictedRetry = await store.createOrLoad(
      makeStart(
        fallbackAttempt,
        retryQuestion,
        addQuestionSelectionToStartConfig(
          { duration: 30 },
          rankedSelection(retryQuestion)
        )
      )
    );
    assert.deepEqual(conflictedRetry.question, fallbackQuestion);
    const [fallbackRelation] = await sql<{ relation_count: number }[]>`
      SELECT count(*)::int AS relation_count
      FROM session_question
      WHERE session_id = ${fallbackAttempt}::uuid
    `;
    assert.equal(fallbackRelation?.relation_count, 0);
  } finally {
    await sql`
      DELETE FROM session_question
      WHERE session_id IN (
        ${explicitAttempt}::uuid, ${rankedAttempt}::uuid,
        ${fallbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id IN (
        ${explicitAttempt}::uuid, ${rankedAttempt}::uuid,
        ${fallbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM interview_question
      WHERE id IN (
        ${explicitQuestionId}::uuid, ${rankedQuestionId}::uuid,
        ${retryQuestionId}::uuid
      )
    `;
    await sql`DELETE FROM app_user WHERE id = ${userId}::uuid`;
    await client.end();
  }
}

async function verifyProviderCreditRecovery(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    { createCreditLedgerService },
    { createDrizzleCreditLedgerStore, withDrizzleCreditLedgerUserTransaction },
    {
      createDrizzleInterviewCreditSettlementStore,
      withDeferredInterviewCreditSettlementTracking,
    },
    { createDrizzleInterviewRuntimeFailureStore },
    { createDrizzleInterviewCreditRecoveryStore },
    { convergeInterviewCreditSettlement },
    { ingestInterviewRuntimeEvent },
    schema,
  ] = await Promise.all([
    import("../lib/billing/credits"),
    import("../lib/billing/credit-ledger-store"),
    import("../lib/db/interview-credit-settlement"),
    import("../lib/db/interview-runtime-events"),
    import("../lib/db/interview-credit-recovery"),
    import("../lib/workflows/converge-interview-credit-settlement"),
    import("../lib/workflows/ingest-interview-runtime-event"),
    import("../lib/db/schema"),
  ]);
  const userId = "53000000-0000-4000-8000-000000000001";
  const providerAttempt = "54000000-0000-4000-8000-000000000001";
  const retainAttempt = "54000000-0000-4000-8000-000000000002";
  const recoveryUser = "53000000-0000-4000-8000-000000000002";
  const recoveryAttempt = "54000000-0000-4000-8000-000000000003";
  const recoveryConsumedAttempt = "54000000-0000-4000-8000-000000000004";
  const atomicFailureAttempt = "54000000-0000-4000-8000-000000000005";
  const analyticsRollbackAttempt = "54000000-0000-4000-8000-000000000006";
  const now = new Date("2026-07-10T14:00:00.000Z");
  const clients = Array.from({ length: 10 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const databases = clients.map((client) => drizzle(client, { schema }));
  const ledgers = databases.map((database) =>
    createCreditLedgerService({
      store: createDrizzleCreditLedgerStore(database),
      now: () => now,
    })
  );
  const settlementStores = databases.map((database) =>
    createDrizzleInterviewCreditSettlementStore(database)
  );

  const insertSession = async (sessionId: string, owner: string) => {
    await sql`
      INSERT INTO interview_session (
        id, user_id, round_type, mode, livekit_room_name, config, started_at,
        start_contract_version, start_attempt_id, start_request_fingerprint,
        provisioning_state, provisioned_at, lifecycle_state, lifecycle_version,
        activated_at, runtime_ready_at, status, last_transition_at
      ) VALUES (
        ${sessionId}::uuid, ${owner}::uuid, 'product_sense', 'voice_video',
        ${`interview-${sessionId}`}, '{"duration":30}'::jsonb,
        ${now.toISOString()}::timestamptz, 1, ${sessionId}::uuid,
        ${"d".repeat(64)}, 'ready', ${now.toISOString()}::timestamptz,
        'active', 2, ${now.toISOString()}::timestamptz,
        ${now.toISOString()}::timestamptz, 'in_progress',
        ${now.toISOString()}::timestamptz
      )
    `;
  };
  const reserve = async (sessionId: string, owner: string, index = 0) =>
    ledgers[index]!.reserveCredit({
      userId: owner,
      reservationKey: `interview-start:${owner}:${sessionId}`,
      sessionId,
      startContractVersion: 1,
      startAttemptId: sessionId,
      expiresAt: new Date(now.getTime() + 40 * 60_000),
    });
  const insertTurn = async (sessionId: string, sequence: number) => {
    await sql`
      INSERT INTO transcript_runtime_writer (
        session_id, generation, contract_version, room_name, writer_id,
        registered_at
      ) VALUES (
        ${sessionId}::uuid, 1, 1, ${`interview-${sessionId}`},
        'credit-recovery-pg', ${now.toISOString()}::timestamptz
      )
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO transcript_turn (
        session_id, contract_version, event_id, writer_id,
        writer_generation, sequence, room_name, speaker, started_at,
        ended_at, text, audio_ms, section, delivery_state
      ) VALUES (
        ${sessionId}::uuid, 2, ${`credit-recovery:${sessionId}:turn`},
        'credit-recovery-pg', 1, ${sequence}, ${`interview-${sessionId}`},
        'interviewer', ${now.toISOString()}::timestamptz,
        ${new Date(now.getTime() + 1000).toISOString()}::timestamptz,
        'Welcome to your interview.', 1000, 'opening', 'delivered'
      )
    `;
  };
  const converge = (sessionId: string, index: number, at = now) =>
    convergeInterviewCreditSettlement({
      sessionId,
      store: settlementStores[index]!,
      now: at,
    });

  try {
    await Promise.all(clients.map((client) => client`SELECT 1`));
    await seedCreditTestUser(sql, userId, "provider-credit-recovery");
    await seedCreditTestUser(sql, recoveryUser, "expired-credit-recovery");
    await ledgers[0]!.grantCredits({
      userId,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:credit-recovery:provider-grant",
      includedCredits: 1,
      expiresAt: null,
    });
    await insertSession(providerAttempt, userId);
    await reserve(providerAttempt, userId);
    await insertTurn(providerAttempt, 1);
    assert.equal((await converge(providerAttempt, 0)).disposition, "consumed");
    await sql`
      UPDATE credit_grant
      SET expires_at = ${new Date(now.getTime() - 1).toISOString()}::timestamptz
      WHERE user_id = ${userId}::uuid AND source = 'admin'
    `;

    const failure = {
      contract_version: 1 as const,
      event_id: "provider-failure:pg:voice_runtime_provider_failed",
      session_id: providerAttempt,
      type: "provider_failed" as const,
      occurred_at: new Date(now.getTime() + 2_000).toISOString(),
      runtime_ref: { provider: "livekit", id: `interview-${providerAttempt}` },
      failure: {
        reason: "provider_failure" as const,
        code: "voice_runtime_provider_failed",
        retryable: true,
      },
    };
    const providerResults = await runConcurrently(
      databases.map(
        (database) => () =>
          ingestInterviewRuntimeEvent({
            requestSessionId: providerAttempt,
            event: failure,
            store: createDrizzleInterviewRuntimeFailureStore(database),
          })
      )
    );
    assert.equal(
      rejected(providerResults).length,
      0,
      rejected(providerResults)
        .map(({ reason }) => errorMessage(reason))
        .join(" | ")
    );
    assert.ok(
      fulfilled(providerResults).every(
        ({ value }) => value.ok && value.creditDisposition === "refunded"
      )
    );
    const [providerState] = await sql<
      {
        status: string;
        refunds: number;
        make_goods: number;
        action: string;
        fault: string;
        skipped_feedback: number;
      }[]
    >`
      SELECT reservation.status,
        (SELECT count(*)::int FROM credit_transaction transaction
          WHERE transaction.reservation_id = reservation.id
            AND transaction.type = 'refund') AS refunds,
        (SELECT count(*)::int FROM credit_grant grant_row
          WHERE grant_row.user_id = session.user_id
            AND grant_row.source = 'refund') AS make_goods,
        session.credit_settlement_action AS action,
        session.billing_fault AS fault,
        (SELECT count(*)::int FROM feedback feedback_row
          WHERE feedback_row.session_id = session.id
            AND feedback_row.status = 'skipped'
            AND feedback_row.dispatch_status = 'not_required') AS skipped_feedback
      FROM interview_session session
      JOIN credit_reservation reservation ON reservation.session_id = session.id
      WHERE session.id = ${providerAttempt}::uuid
    `;
    assert.deepEqual(providerState, {
      status: "refunded",
      refunds: 1,
      make_goods: 1,
      action: "refund",
      fault: "provider",
      skipped_feedback: 1,
    });
    const refundedPreflight = runPreflight(databaseUrl, true, "reconciled")!;
    assert.equal(
      refundedPreflight.startingContract,
      "question_ranking_indexes"
    );
    assert.equal(
      refundedPreflight.stableStartIntegrity.usable_without_consume,
      0
    );
    assert.equal(refundedPreflight.creditRecoveryLaunchReady, true);
    await assert.rejects(
      () => sql`
        UPDATE interview_session SET credit_settlement_action = 'retain'
        WHERE id = ${providerAttempt}::uuid
      `,
      /immutable/
    );

    await insertSession(retainAttempt, userId);
    await reserve(retainAttempt, userId);
    await insertTurn(retainAttempt, 2);
    assert.equal((await converge(retainAttempt, 0)).disposition, "consumed");
    await sql`
      UPDATE interview_session
      SET lifecycle_state = 'completed', lifecycle_version = lifecycle_version + 2,
        terminal_reason = 'time_limit', status = 'completed',
        billing_fault = 'user', billing_fault_code = 'time_limit',
        ending_at = ${now.toISOString()}::timestamptz,
        ended_at = ${now.toISOString()}::timestamptz,
        last_transition_at = ${now.toISOString()}::timestamptz
      WHERE id = ${retainAttempt}::uuid
    `;
    const retainResults = await runConcurrently(
      databases.map((_, index) => () => converge(retainAttempt, index))
    );
    assert.equal(rejected(retainResults).length, 0);
    assert.ok(
      fulfilled(retainResults).every(
        ({ value }) => value.disposition === "retained"
      )
    );
    const [retainState] = await sql<
      { status: string; refunds: number; action: string }[]
    >`
      SELECT reservation.status,
        (SELECT count(*)::int FROM credit_transaction transaction
          WHERE transaction.reservation_id = reservation.id
            AND transaction.type = 'refund') AS refunds,
        session.credit_settlement_action AS action
      FROM interview_session session
      JOIN credit_reservation reservation ON reservation.session_id = session.id
      WHERE session.id = ${retainAttempt}::uuid
    `;
    assert.deepEqual(retainState, {
      status: "consumed",
      refunds: 0,
      action: "retain",
    });

    await ledgers[0]!.grantCredits({
      userId: recoveryUser,
      catalogId: "interview_pass",
      source: "admin",
      idempotencyKey: "postgres:credit-recovery:expired-grant",
      includedCredits: 3,
      expiresAt: null,
    });
    await insertSession(recoveryAttempt, recoveryUser);
    await reserve(recoveryAttempt, recoveryUser);
    const recoveryAt = new Date(now.getTime() + 60 * 60_000);
    const recoveryStore = createDrizzleInterviewCreditRecoveryStore(
      databases[0]!
    );
    assert.ok(
      (
        await recoveryStore.listCandidates({ now: recoveryAt, limit: 250 })
      ).some(({ sessionId }) => sessionId === recoveryAttempt)
    );
    assert.deepEqual(
      await recoveryStore.prepare({
        sessionId: recoveryAttempt,
        now: recoveryAt,
      }),
      { disposition: "recovered", creditDisposition: "released" }
    );

    await insertSession(recoveryConsumedAttempt, recoveryUser);
    await reserve(recoveryConsumedAttempt, recoveryUser);
    await insertTurn(recoveryConsumedAttempt, 3);
    assert.equal(
      (await converge(recoveryConsumedAttempt, 0)).disposition,
      "consumed"
    );
    assert.ok(
      (
        await recoveryStore.listCandidates({ now: recoveryAt, limit: 250 })
      ).some(({ sessionId }) => sessionId === recoveryConsumedAttempt)
    );
    assert.deepEqual(
      await recoveryStore.prepare({
        sessionId: recoveryConsumedAttempt,
        now: recoveryAt,
      }),
      { disposition: "recovered", creditDisposition: "refunded" }
    );
    const [recoveryFeedback] = await sql<
      { status: string; dispatch_status: string }[]
    >`
      SELECT status, dispatch_status
      FROM feedback
      WHERE session_id = ${recoveryConsumedAttempt}::uuid
    `;
    assert.deepEqual(recoveryFeedback, {
      status: "skipped",
      dispatch_status: "not_required",
    });

    await insertSession(analyticsRollbackAttempt, recoveryUser);
    await reserve(analyticsRollbackAttempt, recoveryUser);
    const trackedAfterRollback: unknown[] = [];
    await assert.rejects(
      withDeferredInterviewCreditSettlementTracking(
        (defer) =>
          withDrizzleCreditLedgerUserTransaction(
            recoveryUser,
            async ({ database: transaction }) => {
              await transaction
                .update(schema.interviewSession)
                .set({
                  lifecycleState: "failed",
                  lifecycleVersion: 4,
                  terminalReason: "provider_failure",
                  status: "error",
                  billingFault: "provider",
                  billingFaultCode: "forced_outer_rollback",
                  endingAt: now,
                  endedAt: now,
                  lastTransitionAt: now,
                })
                .where(
                  eq(schema.interviewSession.id, analyticsRollbackAttempt)
                );
              const credit = await convergeInterviewCreditSettlement({
                sessionId: analyticsRollbackAttempt,
                store: createDrizzleInterviewCreditSettlementStore(
                  transaction as unknown as (typeof databases)[number],
                  defer
                ),
                now,
              });
              assert.equal(credit.disposition, "released");
              throw new Error("forced_outer_commit_rollback");
            },
            databases[0]!
          ),
        (evidence) => {
          trackedAfterRollback.push(evidence);
        }
      ),
      /forced_outer_commit_rollback/
    );
    assert.deepEqual(trackedAfterRollback, []);
    const [analyticsRollbackState] = await sql<
      { lifecycle_state: string; reservation_status: string }[]
    >`
      SELECT session.lifecycle_state,
        reservation.status AS reservation_status
      FROM interview_session session
      JOIN credit_reservation reservation ON reservation.session_id = session.id
      WHERE session.id = ${analyticsRollbackAttempt}::uuid
    `;
    assert.deepEqual(analyticsRollbackState, {
      lifecycle_state: "active",
      reservation_status: "active",
    });

    await insertSession(atomicFailureAttempt, recoveryUser);
    await reserve(atomicFailureAttempt, recoveryUser);
    await sql`
      DELETE FROM credit_reservation_grant allocation
      USING credit_reservation reservation
      WHERE allocation.reservation_id = reservation.id
        AND reservation.session_id = ${atomicFailureAttempt}::uuid
    `;
    await assert.rejects(
      ingestInterviewRuntimeEvent({
        requestSessionId: atomicFailureAttempt,
        event: {
          ...failure,
          event_id: "provider-failure:pg:atomic-rollback",
          session_id: atomicFailureAttempt,
          runtime_ref: {
            provider: "livekit",
            id: `interview-${atomicFailureAttempt}`,
          },
        },
        store: createDrizzleInterviewRuntimeFailureStore(databases[0]!),
      }),
      /credit_/
    );
    const [rolledBackFailure] = await sql<
      {
        lifecycle_state: string;
        billing_fault: string | null;
        feedback_rows: number;
      }[]
    >`
      SELECT lifecycle_state, billing_fault,
        (SELECT count(*)::int FROM feedback
          WHERE session_id = session.id) AS feedback_rows
      FROM interview_session session
      WHERE id = ${atomicFailureAttempt}::uuid
    `;
    assert.deepEqual(rolledBackFailure, {
      lifecycle_state: "active",
      billing_fault: null,
      feedback_rows: 0,
    });
  } finally {
    await sql`
      DELETE FROM credit_transaction
      WHERE user_id IN (${userId}::uuid, ${recoveryUser}::uuid)
    `;
    await sql`
      DELETE FROM credit_reservation_grant allocation
      USING credit_reservation reservation
      WHERE allocation.reservation_id = reservation.id
        AND reservation.user_id IN (${userId}::uuid, ${recoveryUser}::uuid)
    `;
    await sql`
      DELETE FROM credit_reservation
      WHERE user_id IN (${userId}::uuid, ${recoveryUser}::uuid)
    `;
    await sql`
      DELETE FROM transcript_runtime_settlement
      WHERE session_id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM transcript_interruption_marker
      WHERE session_id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM transcript_turn
      WHERE session_id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM transcript_runtime_writer
      WHERE session_id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM feedback
      WHERE session_id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id IN (
        ${providerAttempt}::uuid, ${retainAttempt}::uuid,
        ${recoveryAttempt}::uuid, ${recoveryConsumedAttempt}::uuid,
        ${atomicFailureAttempt}::uuid, ${analyticsRollbackAttempt}::uuid
      )
    `;
    await sql`
      DELETE FROM credit_grant
      WHERE user_id IN (${userId}::uuid, ${recoveryUser}::uuid)
    `;
    await sql`
      DELETE FROM app_user
      WHERE id IN (${userId}::uuid, ${recoveryUser}::uuid)
    `;
    await Promise.all(clients.map((client) => client.end()));
  }
}

async function verifyAnalyticsConsentSchema(sql: postgres.Sql) {
  const userId = "18181818-1818-4818-8818-181818181818";
  const [{ retained_soft_opt_in: retainedSoftOptIn }] = await sql<
    { retained_soft_opt_in: number }[]
  >`
    SELECT count(*)::int AS retained_soft_opt_in
    FROM user_settings WHERE share_anonymous_data = true
  `;
  assert.equal(retainedSoftOptIn, 0);
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${userId}::uuid, 'analytics-consent-test@meelni.invalid')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO user_settings (user_id)
    VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;

  const defaults = await sql<
    {
      analytics_consent: string;
      analytics_consent_source: string | null;
      analytics_consent_updated_at: Date | null;
      analytics_consent_version: number | null;
      analytics_consent_revision: number;
      share_anonymous_data: boolean;
    }[]
  >`
    SELECT analytics_consent, analytics_consent_version,
      analytics_consent_source, analytics_consent_updated_at,
      analytics_consent_revision::int AS analytics_consent_revision,
      share_anonymous_data
    FROM user_settings WHERE user_id = ${userId}::uuid
  `;
  assert.deepEqual(defaults[0], {
    analytics_consent: "undecided",
    analytics_consent_version: null,
    analytics_consent_source: null,
    analytics_consent_updated_at: null,
    analytics_consent_revision: 0,
    share_anonymous_data: false,
  });

  await assert.rejects(
    sql`
      UPDATE user_settings SET analytics_consent = 'accepted'
      WHERE user_id = ${userId}::uuid
    `
  );
  await sql`
    UPDATE user_settings
    SET analytics_consent = 'accepted', analytics_consent_version = 1,
      analytics_consent_source = 'settings',
      analytics_consent_updated_at = clock_timestamp(),
      analytics_consent_revision = analytics_consent_revision + 1
    WHERE user_id = ${userId}::uuid
      AND analytics_consent_revision = 0
  `;
  await sql`
    UPDATE user_settings
    SET analytics_consent = 'declined', analytics_consent_version = 1,
      analytics_consent_source = 'settings',
      analytics_consent_updated_at = clock_timestamp(),
      analytics_consent_revision = analytics_consent_revision + 1
    WHERE user_id = ${userId}::uuid
      AND analytics_consent_revision >= 1
  `;
  const staleAcceptance = await sql`
    UPDATE user_settings
    SET analytics_consent = 'accepted', analytics_consent_version = 1,
      analytics_consent_source = 'settings',
      analytics_consent_updated_at = clock_timestamp(),
      analytics_consent_revision = analytics_consent_revision + 1
    WHERE user_id = ${userId}::uuid
      AND analytics_consent_revision = 1
    RETURNING analytics_consent
  `;
  assert.equal(staleAcceptance.length, 0);
  const [withdrawn] = await sql<
    { analytics_consent: string; analytics_consent_revision: number }[]
  >`
    SELECT analytics_consent,
      analytics_consent_revision::int AS analytics_consent_revision
    FROM user_settings WHERE user_id = ${userId}::uuid
  `;
  assert.deepEqual(withdrawn, {
    analytics_consent: "declined",
    analytics_consent_revision: 2,
  });
  const freshAcceptance = await sql<
    { analytics_consent: string; analytics_consent_revision: number }[]
  >`
    UPDATE user_settings
    SET analytics_consent = 'accepted', analytics_consent_version = 1,
      analytics_consent_source = 'settings',
      analytics_consent_updated_at = clock_timestamp(),
      analytics_consent_revision = analytics_consent_revision + 1
    WHERE user_id = ${userId}::uuid
      AND analytics_consent_revision = 2
    RETURNING analytics_consent,
      analytics_consent_revision::int AS analytics_consent_revision
  `;
  assert.deepEqual(freshAcceptance[0], {
    analytics_consent: "accepted",
    analytics_consent_revision: 3,
  });
  await sql`DELETE FROM user_settings WHERE user_id = ${userId}::uuid`;
  await sql`DELETE FROM app_user WHERE id = ${userId}::uuid`;
}

async function seedQuestionProvenanceBackfillFixtures(sql: postgres.Sql) {
  await sql`
    INSERT INTO interview_question (
      id, company, question_text, question_type, is_active
    ) VALUES
      (
        ${QUESTION_PROVENANCE_ACTIVE}::uuid, 'Meta',
        'Design a trustworthy search experience', 'Product Sense', true
      ),
      (
        ${QUESTION_PROVENANCE_INACTIVE}::uuid, 'Meta',
        'Retired duplicate search question', 'Product Sense', false
      )
  `;
}

async function verifyQuestionProvenance(
  sql: postgres.Sql,
  expectBackfilledRows: boolean
) {
  const backfilled = await sql<
    {
      id: string;
      source_kind: string;
      source_fingerprint: string | null;
      quality_status: string;
      is_active: boolean;
    }[]
  >`
    SELECT id, source_kind, source_fingerprint, quality_status, is_active
    FROM interview_question
    WHERE id IN (
      ${QUESTION_PROVENANCE_ACTIVE}::uuid,
      ${QUESTION_PROVENANCE_INACTIVE}::uuid
    )
    ORDER BY id
  `;

  if (expectBackfilledRows) {
    assert.deepEqual(
      [...backfilled],
      [
        {
          id: QUESTION_PROVENANCE_ACTIVE,
          source_kind: "legacy",
          source_fingerprint: null,
          quality_status: "quarantined_unverified",
          is_active: false,
        },
        {
          id: QUESTION_PROVENANCE_INACTIVE,
          source_kind: "legacy",
          source_fingerprint: null,
          quality_status: "retired_source_missing",
          is_active: false,
        },
      ]
    );
    return;
  }

  await sql`
    INSERT INTO interview_question (
      id, company, question_text, question_type, asked_at, source_kind,
      source_category, source_fingerprint, quality_status,
      duplicate_of_question_id, is_active
    ) VALUES
      (
        ${QUESTION_PROVENANCE_ACTIVE}::uuid, 'Meta',
        'Design a trustworthy search experience', 'Product Sense',
        '2026-01-01T00:00:00.000Z'::timestamptz, 'google_sheets',
        'Product Design', ${"a".repeat(64)}, 'published', null, true
      ),
      (
        ${QUESTION_PROVENANCE_INACTIVE}::uuid, 'Meta',
        'Design a trustworthy search experience!', 'Product Sense',
        '2026-02-01T00:00:00.000Z'::timestamptz, 'google_sheets',
        'Product Design', ${"b".repeat(64)},
        'quarantined_near_duplicate', ${QUESTION_PROVENANCE_ACTIVE}::uuid,
        false
      )
  `;

  const internalColumns = [
    "source_kind",
    "source_category",
    "source_fingerprint",
    "quality_status",
    "duplicate_of_question_id",
  ] as const;
  for (const role of ["anon", "authenticated"] as const) {
    const publicRows = await asRole(
      sql,
      role,
      (tx) => tx`
        SELECT id, company, question_text, question_type, difficulty, asked_at,
          is_active, created_at
        FROM interview_question
        WHERE id IN (
          ${QUESTION_PROVENANCE_ACTIVE}::uuid,
          ${QUESTION_PROVENANCE_INACTIVE}::uuid
        )
        ORDER BY id
      `
    );
    assert.equal(publicRows.length, 1);
    assert.equal(publicRows[0]?.id, QUESTION_PROVENANCE_ACTIVE);
    assert.equal(publicRows[0]?.company, "Meta");
    assert.equal(
      publicRows[0]?.question_text,
      "Design a trustworthy search experience"
    );
    assert.equal(publicRows[0]?.question_type, "Product Sense");
    assert.equal(publicRows[0]?.is_active, true);

    for (const column of internalColumns) {
      await assert.rejects(
        asRole(sql, role, (tx) =>
          tx.unsafe(
            `SELECT ${column} FROM interview_question WHERE id = '${QUESTION_PROVENANCE_ACTIVE}'::uuid`
          )
        ),
        /permission denied/
      );
    }
  }

  const serviceProvenance = await asRole(
    sql,
    "service_role",
    (tx) => tx`
      SELECT source_kind, source_category, source_fingerprint, quality_status,
        duplicate_of_question_id
      FROM interview_question
      WHERE id = ${QUESTION_PROVENANCE_ACTIVE}::uuid
    `
  );
  assert.equal(serviceProvenance[0]?.source_kind, "google_sheets");

  await assert.rejects(
    sql`
      INSERT INTO interview_question (
        company, question_text, question_type, source_kind,
        source_fingerprint, quality_status, is_active
      ) VALUES (
        'Meta', 'Invalid active quarantine', 'Product Sense',
        'google_sheets', ${"c".repeat(64)},
        'quarantined_near_duplicate', true
      )
    `,
    /publication_projection|duplicate_disposition/
  );
  await assert.rejects(
    sql`
      INSERT INTO interview_question (
        company, question_text, question_type, source_kind,
        source_fingerprint, quality_status, is_active
      ) VALUES (
        'Meta', 'Malformed fingerprint', 'Product Sense',
        'google_sheets', 'not-a-fingerprint', 'published', true
      )
    `,
    /source_fingerprint_check/
  );
}

async function verifyQuestionSyncTransactionAdapter(databaseUrl: string) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    const result = await withQuestionSyncLock(
      async (store) => (await store.listQuestions()).length
    );
    assert.equal(result.acquired, true);
    assert.equal(result.value, 2);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function verifyQuestionLookupAdapters(databaseUrl: string) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    const { getActiveQuestionById, getQuestionByIdForHistory } = await import(
      "../lib/db/questions"
    );
    assert.equal(
      (await getActiveQuestionById(QUESTION_PROVENANCE_ACTIVE))?.id,
      QUESTION_PROVENANCE_ACTIVE
    );
    assert.equal(
      await getActiveQuestionById(QUESTION_PROVENANCE_INACTIVE),
      null
    );
    assert.equal(
      (await getQuestionByIdForHistory(QUESTION_PROVENANCE_INACTIVE))?.id,
      QUESTION_PROVENANCE_INACTIVE
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function verifyQuestionRankingAdapter(
  sql: postgres.Sql,
  databaseUrl: string
) {
  const fixtureIdPrefix = "47000000-";
  const matchingQuestionId = "47000000-0000-4000-9000-000000000001";
  const nullDifficultyQuestionId = "47000000-0000-4000-9000-000000000002";
  await sql`
    INSERT INTO interview_question (
      id, company, question_text, question_type, difficulty, asked_at,
      quality_status, is_active
    )
    SELECT
      (
        '47000000-0000-4000-8000-' || lpad((
          (question_type.ordinality - 1) * 4000 +
          (difficulty.ordinality - 1) * 1000 +
          candidate
        )::text, 12, '0')
      )::uuid,
      NULL,
      'Synthetic exact-bucket planner candidate ' ||
        question_type.value || ' / ' ||
        coalesce(difficulty.value, 'null') || ' / ' || candidate,
      question_type.value,
      difficulty.value,
      '2026-08-18T12:00:00.000Z'::timestamptz -
        candidate * interval '1 second',
      'published',
      true
    FROM unnest(ARRAY[
      'A/B Testing',
      'Product design/strategy',
      'Behavioral',
      'Execution',
      'Product Sense',
      'Pricing',
      'Estimation',
      'Product Strategy'
    ]::text[]) WITH ORDINALITY AS question_type(value, ordinality)
    CROSS JOIN unnest(ARRAY[
      'Easy', 'Medium', 'Hard', NULL
    ]::text[]) WITH ORDINALITY AS difficulty(value, ordinality)
    CROSS JOIN generate_series(1, 1000) AS candidate
  `;
  await sql`
    INSERT INTO interview_question (
      id, company, question_text, question_type, difficulty, asked_at,
      quality_status, is_active
    ) VALUES
      (
        ${matchingQuestionId}::uuid,
        NULL,
        'Synthetic requested-round and requested-difficulty candidate',
        'Product Sense',
        'Medium',
        '2026-08-19T12:00:00.000Z'::timestamptz,
        'published',
        true
      ),
      (
        ${nullDifficultyQuestionId}::uuid,
        'Planner Null Co',
        'Synthetic requested-round nullable-difficulty candidate',
        'Product Sense',
        NULL,
        '2026-08-19T11:00:00.000Z'::timestamptz,
        'published',
        true
      )
  `;
  await sql`ANALYZE interview_question`;

  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  try {
    const {
      buildBoundedCandidateWindowQuery,
      createDrizzleQuestionRankingContextStore,
    } = await import("../lib/db/question-ranking");
    const rankingStore = createDrizzleQuestionRankingContextStore();
    const candidates = await rankingStore.loadCandidates(
      {
        roundType: "product_sense",
        difficulty: "intermediate",
        company: null,
      },
      64
    );
    assert.equal(candidates.length, 64);
    assert.equal(candidates[0]?.id, matchingQuestionId);
    const companyCandidates = await rankingStore.loadCandidates(
      {
        roundType: "product_sense",
        difficulty: "intermediate",
        company: "Planner Null Co",
      },
      64
    );
    assert.equal(companyCandidates[0]?.id, nullDifficultyQuestionId);
    assert.equal(companyCandidates[0]?.difficulty, null);

    const explainRows = await drizzle(sql).execute<{
      "QUERY PLAN": QuestionRankingExplainDocument[] | string;
    }>(drizzleSql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      ${buildBoundedCandidateWindowQuery(
        {
          roundType: "product_sense",
          difficulty: "intermediate",
          company: null,
        },
        64
      )}
    `);
    const explainPayload = explainRows[0]?.["QUERY PLAN"];
    const explainDocuments =
      typeof explainPayload === "string"
        ? (JSON.parse(explainPayload) as QuestionRankingExplainDocument[])
        : explainPayload;
    assert.ok(Array.isArray(explainDocuments));
    const explainRoot = explainDocuments[0]?.Plan;
    assert.ok(explainRoot);
    const planEntries = collectQuestionRankingExplainPlan(explainRoot);
    const bucketIndexScans = planEntries.filter(
      ({ node }) =>
        node["Index Name"] === "interview_question_ranking_bucket_idx"
    );
    assert.equal(
      bucketIndexScans.length,
      32,
      `expected 32 exact type/difficulty index paths:\n${JSON.stringify(
        planEntries.map(({ node, parent }) => ({
          nodeType: node["Node Type"],
          parentType: parent?.["Node Type"] ?? null,
          indexName: node["Index Name"] ?? null,
          indexCondition: node["Index Cond"] ?? null,
          actualRows: node["Actual Rows"] ?? null,
          actualLoops: node["Actual Loops"] ?? null,
          rowsRemovedByFilter: node["Rows Removed by Filter"] ?? 0,
        })),
        null,
        2
      )}`
    );
    const nonNullScans = bucketIndexScans.filter(({ node }) =>
      /difficulty\s*=/.test(node["Index Cond"] ?? "")
    );
    const nullScans = bucketIndexScans.filter(({ node }) =>
      /difficulty\s+IS NULL/.test(node["Index Cond"] ?? "")
    );
    assert.equal(nonNullScans.length, 24);
    assert.equal(nullScans.length, 8);
    for (const scan of nonNullScans) {
      assertQuestionRankingBucketIndexPlan(scan, {
        expectedLoops: 1,
        difficultyCondition: /difficulty\s*=/,
      });
    }
    for (const scan of nullScans) {
      assertQuestionRankingBucketIndexPlan(scan, {
        expectedLoops: 1,
        difficultyCondition: /difficulty\s+IS NULL/,
      });
    }

    const indexes = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'interview_question_ranking_bucket_idx',
          'interview_session_question_ranking_history_idx'
        )
      ORDER BY indexname
    `;
    assert.equal(indexes.length, 2);
    assert.match(
      indexes[0]?.indexdef ?? "",
      /interview_question_ranking_bucket_idx.*question_type, difficulty, asked_at DESC NULLS LAST, id.*WHERE \(\(is_active = true\) AND \(quality_status = 'published'::text\)\)/
    );
    assert.match(
      indexes[1]?.indexdef ?? "",
      /interview_session_question_ranking_history_idx.*user_id, activated_at DESC NULLS LAST, id.*WHERE \(activated_at IS NOT NULL\)/
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await sql`
      DELETE FROM interview_question
      WHERE id::text LIKE ${`${fixtureIdPrefix}%`}
    `;
  }
}

interface QuestionRankingExplainNode {
  "Node Type": string;
  "Index Name"?: string;
  "Index Cond"?: string;
  "Scan Direction"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Rows Removed by Filter"?: number;
  Plans?: QuestionRankingExplainNode[];
}

interface QuestionRankingExplainDocument {
  Plan: QuestionRankingExplainNode;
}

interface QuestionRankingExplainEntry {
  node: QuestionRankingExplainNode;
  parent: QuestionRankingExplainNode | null;
}

function collectQuestionRankingExplainPlan(
  node: QuestionRankingExplainNode,
  parent: QuestionRankingExplainNode | null = null
): QuestionRankingExplainEntry[] {
  return [
    { node, parent },
    ...(node.Plans ?? []).flatMap((child) =>
      collectQuestionRankingExplainPlan(child, node)
    ),
  ];
}

function assertQuestionRankingBucketIndexPlan(
  entry: QuestionRankingExplainEntry | undefined,
  input: { expectedLoops: number; difficultyCondition: RegExp }
) {
  assert.ok(entry, "missing exact question-ranking bucket index scan");
  assert.equal(entry.node["Node Type"], "Index Scan");
  assert.equal(entry.node["Scan Direction"], "Forward");
  assert.match(entry.node["Index Cond"] ?? "", /question_type\s*=/);
  assert.match(entry.node["Index Cond"] ?? "", input.difficultyCondition);
  assert.equal(entry.node["Actual Rows"], 64);
  assert.equal(entry.node["Actual Loops"], input.expectedLoops);
  assert.equal(entry.node["Rows Removed by Filter"] ?? 0, 0);
  assert.equal(entry.parent?.["Node Type"], "Limit");
  assert.equal(entry.parent?.["Actual Rows"], 64);
  assert.equal(entry.parent?.["Actual Loops"], input.expectedLoops);
}

async function verifyFocusedPracticePersistence(
  sql: postgres.Sql,
  databaseUrl: string,
  verifyApplicationLifecycle: boolean
) {
  await sql`
    INSERT INTO app_user (id, email)
    VALUES
      (${FOCUSED_PRACTICE_USER}::uuid, 'focused-practice@example.invalid'),
      (${FOCUSED_PRACTICE_OTHER_USER}::uuid, 'focused-practice-other@example.invalid')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode)
    VALUES
      (
        ${FOCUSED_PRACTICE_SESSION}::uuid,
        ${FOCUSED_PRACTICE_USER}::uuid,
        'product_sense',
        'voice_video'
      ),
      (
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid,
        ${FOCUSED_PRACTICE_USER}::uuid,
        'product_sense',
        'voice_video'
      )
  `;
  await sql`
    INSERT INTO feedback (id, session_id, status)
    VALUES
      (
        ${FOCUSED_PRACTICE_FEEDBACK}::uuid,
        ${FOCUSED_PRACTICE_SESSION}::uuid,
        'completed'
      ),
      (
        ${FOCUSED_PRACTICE_SCORELESS_FEEDBACK}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid,
        'completed'
      )
  `;
  await sql`
    INSERT INTO focused_practice_attempt (
      id, user_id, source_session_id, source_feedback_id,
      contract_version, lifecycle_version, state, feedback_version,
      plan_contract_version, plan_template_version, plan_template_id,
      plan, source_finding, started_at
    ) VALUES (
      ${FOCUSED_PRACTICE_ATTEMPT}::uuid,
      ${FOCUSED_PRACTICE_USER}::uuid,
      ${FOCUSED_PRACTICE_SESSION}::uuid,
      ${FOCUSED_PRACTICE_FEEDBACK}::uuid,
      'focused-practice-attempt.v1', 0, 'in_progress',
      '{"schemaVersion":"feedback.v2","promptVersion":"feedback.prompt.v2","rubricVersion":"pm-feedback-rubric.v2","modelVersion":"migration-test","evaluationState":"full"}'::jsonb,
      'focused-practice-plan.v1', 'focused-practice-templates.v1',
      'focused-practice:focused-practice-templates.v1:product_sense:insight:grounded_full',
      '{"state":"available","contractVersion":"focused-practice-plan.v1","templateVersion":"focused-practice-templates.v1","templateId":"focused-practice:focused-practice-templates.v1:product_sense:insight:grounded_full"}'::jsonb,
      '{}'::jsonb,
      '2026-07-19T12:00:00.000Z'::timestamptz
    )
  `;

  const scorelessFeedbackVersion = {
    schemaVersion: "feedback.dimension-coverage.v1",
    promptVersion: "feedback.prompt.dimension-coverage.v1",
    rubricVersion: "pm-feedback-rubric.v3",
    modelVersion: "synthetic-migration-test",
    evaluationState: "partial",
    reviewOutcome: "partial_scorecard",
    scoreWithheldReason: "rubric_coverage",
    sourceFingerprint: "a".repeat(64),
  };
  const scorelessPlan = {
    state: "available",
    contractVersion: "focused-practice-plan.v2",
    templateVersion: "focused-practice-templates.v2",
    templateId:
      "focused-practice:focused-practice-templates.v2:product_sense:insight:dimension_coverage_focus:customer_need:reinforce_grounded_rubric_move",
    source: {
      focusIdentity: { kind: "dimension_coverage_focus" },
    },
  };
  const scorelessFinding = { kind: "dimension_coverage_focus" };

  await assert.rejects(
    () => sql`
      INSERT INTO focused_practice_attempt (
        id, user_id, source_session_id, source_feedback_id,
        contract_version, lifecycle_version, state, feedback_version,
        plan_contract_version, plan_template_version, plan_template_id,
        plan, source_finding, started_at
      ) VALUES (
        ${FOCUSED_PRACTICE_SCORELESS_ATTEMPT}::uuid,
        ${FOCUSED_PRACTICE_USER}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_FEEDBACK}::uuid,
        'focused-practice-attempt.v2', 0, 'in_progress',
        ${JSON.stringify({
          ...scorelessFeedbackVersion,
          sourceFingerprint: "not-a-fingerprint",
        })}::jsonb,
        'focused-practice-plan.v2', 'focused-practice-templates.v2',
        ${scorelessPlan.templateId}, ${JSON.stringify(scorelessPlan)}::jsonb,
        ${JSON.stringify(scorelessFinding)}::jsonb,
        '2026-08-13T12:00:00.000Z'::timestamptz
      )
    `,
    /focused_practice_attempt_snapshot_version_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO focused_practice_attempt (
        id, user_id, source_session_id, source_feedback_id,
        contract_version, lifecycle_version, state, feedback_version,
        plan_contract_version, plan_template_version, plan_template_id,
        plan, source_finding, started_at
      ) VALUES (
        ${FOCUSED_PRACTICE_SCORELESS_ATTEMPT}::uuid,
        ${FOCUSED_PRACTICE_USER}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_FEEDBACK}::uuid,
        'focused-practice-attempt.v2', 0, 'in_progress',
        ${JSON.stringify({
          schemaVersion: "feedback.evidence-limited.v2",
          promptVersion: "feedback.prompt.evidence-limited.v2",
          rubricVersion: "pm-feedback-rubric.v2",
          modelVersion: "synthetic-migration-test",
          evaluationState: "partial",
          reviewOutcome: "coaching_review",
          scoreWithheldReason: "rubric_coverage",
          sourceFingerprint: "a".repeat(64),
        })}::jsonb,
        'focused-practice-plan.v2', 'focused-practice-templates.v2',
        ${scorelessPlan.templateId}, ${JSON.stringify(scorelessPlan)}::jsonb,
        ${JSON.stringify(scorelessFinding)}::jsonb,
        '2026-08-13T12:00:00.000Z'::timestamptz
      )
    `,
    /focused_practice_attempt_snapshot_version_check/
  );
  await sql`
    INSERT INTO focused_practice_attempt (
      id, user_id, source_session_id, source_feedback_id,
      contract_version, lifecycle_version, state, feedback_version,
      plan_contract_version, plan_template_version, plan_template_id,
      plan, source_finding, started_at
    ) VALUES (
      ${FOCUSED_PRACTICE_SCORELESS_ATTEMPT}::uuid,
      ${FOCUSED_PRACTICE_USER}::uuid,
      ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid,
      ${FOCUSED_PRACTICE_SCORELESS_FEEDBACK}::uuid,
      'focused-practice-attempt.v2', 0, 'in_progress',
      ${JSON.stringify(scorelessFeedbackVersion)}::jsonb,
      'focused-practice-plan.v2', 'focused-practice-templates.v2',
      ${scorelessPlan.templateId}, ${JSON.stringify(scorelessPlan)}::jsonb,
      ${JSON.stringify(scorelessFinding)}::jsonb,
      '2026-08-13T12:00:00.000Z'::timestamptz
    )
  `;

  await assert.rejects(
    () => sql`
      INSERT INTO focused_practice_attempt (
        id, user_id, source_session_id, source_feedback_id,
        contract_version, lifecycle_version, state, feedback_version,
        plan_contract_version, plan_template_version, plan_template_id,
        plan, source_finding, started_at
      ) VALUES (
        'f5000000-0000-4000-8000-000000000009'::uuid,
        ${FOCUSED_PRACTICE_USER}::uuid,
        ${FOCUSED_PRACTICE_SESSION}::uuid,
        ${FOCUSED_PRACTICE_FEEDBACK}::uuid,
        'focused-practice-attempt.v2', 0, 'in_progress',
        ${JSON.stringify(scorelessFeedbackVersion)}::jsonb,
        'focused-practice-plan.v2', 'focused-practice-templates.v2',
        ${scorelessPlan.templateId}, ${JSON.stringify(scorelessPlan)}::jsonb,
        ${JSON.stringify(scorelessFinding)}::jsonb,
        '2026-08-13T12:00:00.000Z'::timestamptz
      )
    `,
    /focused_practice_attempt_owner_source_idx/
  );

  await assert.rejects(
    () => sql`
      INSERT INTO focused_practice_attempt (
        id, user_id, source_session_id, source_feedback_id,
        contract_version, lifecycle_version, state, feedback_version,
        plan_contract_version, plan_template_version, plan_template_id,
        plan, source_finding, started_at
      ) SELECT
        'f5000000-0000-4000-8000-000000000010'::uuid,
        ${FOCUSED_PRACTICE_OTHER_USER}::uuid,
        source_session_id, source_feedback_id, contract_version,
        lifecycle_version, state, feedback_version, plan_contract_version,
        plan_template_version, plan_template_id, plan, source_finding,
        started_at
      FROM focused_practice_attempt
      WHERE id = ${FOCUSED_PRACTICE_ATTEMPT}::uuid
    `,
    /focused_practice_attempt_source_session_owner_fk/
  );

  const visibleToOwner = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${FOCUSED_PRACTICE_USER}, true)`;
    return tx<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM focused_practice_attempt
    `;
  });
  assert.equal(visibleToOwner[0]?.rows, 2);
  const hiddenFromOtherUser = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${FOCUSED_PRACTICE_OTHER_USER}, true)`;
    return tx<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM focused_practice_attempt
    `;
  });
  assert.equal(hiddenFromOtherUser[0]?.rows, 0);
  await assert.rejects(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub', ${FOCUSED_PRACTICE_USER}, true)`;
        await tx`
          UPDATE focused_practice_attempt SET updated_at = clock_timestamp()
          WHERE id = ${FOCUSED_PRACTICE_ATTEMPT}::uuid
        `;
      }),
    /permission denied/
  );

  await sql`
    INSERT INTO account_deletion_request (user_id)
    VALUES (${FOCUSED_PRACTICE_USER}::uuid)
  `;
  const hiddenAfterDeletion = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${FOCUSED_PRACTICE_USER}, true)`;
    return tx<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM focused_practice_attempt
    `;
  });
  assert.equal(hiddenAfterDeletion[0]?.rows, 0);
  await sql`
    DELETE FROM account_deletion_request
    WHERE user_id = ${FOCUSED_PRACTICE_USER}::uuid
  `;

  const writers = [
    postgres(databaseUrl, { max: 1, prepare: false }),
    postgres(databaseUrl, { max: 1, prepare: false }),
  ];
  try {
    const results = await Promise.all(
      writers.map(
        (writer) =>
          writer<{ id: string }[]>`
          UPDATE focused_practice_attempt
          SET state = 'completed', lifecycle_version = 1,
            completed_at = '2026-07-19T12:05:00.000Z'::timestamptz,
            completion = '{"contractVersion":"focused-practice-completion.v1","practicedAloud":true,"selfReview":{}}'::jsonb,
            updated_at = clock_timestamp()
          WHERE id = ${FOCUSED_PRACTICE_ATTEMPT}::uuid
            AND lifecycle_version = 0
          RETURNING id::text
        `
      )
    );
    assert.equal(results.flat().length, 1);
  } finally {
    await Promise.all(writers.map((writer) => writer.end()));
  }

  await assert.rejects(
    () => sql`
      UPDATE focused_practice_attempt
      SET completion = completion, updated_at = clock_timestamp()
      WHERE id = ${FOCUSED_PRACTICE_ATTEMPT}::uuid
    `,
    /focused_practice_attempt_invalid_transition/
  );
  await assert.rejects(
    () => sql`
      UPDATE focused_practice_attempt
      SET plan_template_id = 'rewritten-template',
        updated_at = clock_timestamp()
      WHERE id = ${FOCUSED_PRACTICE_ATTEMPT}::uuid
    `,
    /focused_practice_attempt_immutable_snapshot/
  );

  if (verifyApplicationLifecycle) {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    try {
      const { loadAccountExportSource } = await import(
        "../lib/db/account-export"
      );
      const source = await loadAccountExportSource(FOCUSED_PRACTICE_USER);
      assert.equal(source.focusedPracticeAttempts.length, 2);
      assert.deepEqual(
        new Set(source.focusedPracticeAttempts.map((attempt) => attempt.id)),
        new Set([FOCUSED_PRACTICE_ATTEMPT, FOCUSED_PRACTICE_SCORELESS_ATTEMPT])
      );

      const { deleteUserApplicationData } = await import(
        "../lib/db/account-deletions"
      );
      await deleteUserApplicationData(FOCUSED_PRACTICE_USER);
      const remaining = await sql<{ rows: number }[]>`
        SELECT count(*)::int AS rows
        FROM focused_practice_attempt
        WHERE user_id = ${FOCUSED_PRACTICE_USER}::uuid
      `;
      assert.equal(remaining[0]?.rows, 0);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  } else {
    await sql`
      DELETE FROM focused_practice_attempt
      WHERE user_id = ${FOCUSED_PRACTICE_USER}::uuid
    `;
    await sql`
      DELETE FROM feedback
      WHERE session_id IN (
        ${FOCUSED_PRACTICE_SESSION}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid
      )
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id IN (
        ${FOCUSED_PRACTICE_SESSION}::uuid,
        ${FOCUSED_PRACTICE_SCORELESS_SESSION}::uuid
      )
    `;
    await sql`
      DELETE FROM app_user
      WHERE id IN (
        ${FOCUSED_PRACTICE_USER}::uuid,
        ${FOCUSED_PRACTICE_OTHER_USER}::uuid
      )
    `;
  }
}

async function verifyFeedbackQualityPersistence(
  sql: postgres.Sql,
  databaseUrl: string,
  verifyApplicationLifecycle: boolean
) {
  await sql`
    INSERT INTO app_user (id, email)
    VALUES
      (${FEEDBACK_QUALITY_USER}::uuid, 'feedback-quality@example.invalid'),
      (${FEEDBACK_QUALITY_OTHER_USER}::uuid, 'feedback-quality-other@example.invalid')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode)
    VALUES (
      ${FEEDBACK_QUALITY_SESSION}::uuid,
      ${FEEDBACK_QUALITY_USER}::uuid,
      'product_sense',
      'voice_video'
    )
  `;
  await sql`
    INSERT INTO feedback (id, session_id, status)
    VALUES (
      ${FEEDBACK_QUALITY_FEEDBACK}::uuid,
      ${FEEDBACK_QUALITY_SESSION}::uuid,
      'completed'
    )
  `;
  await sql`
    INSERT INTO feedback_quality_signal (
      user_id, session_id, feedback_id, contract_version,
      review_outcome, response, reason
    ) VALUES (
      ${FEEDBACK_QUALITY_USER}::uuid,
      ${FEEDBACK_QUALITY_SESSION}::uuid,
      ${FEEDBACK_QUALITY_FEEDBACK}::uuid,
      'feedback-quality-signal.v1',
      'partial_scorecard',
      'not_helpful',
      'next_step_unclear'
    )
  `;

  await assert.rejects(
    () => sql`
      UPDATE feedback_quality_signal
      SET response = 'helpful', reason = 'next_step_unclear'
      WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
    `,
    /feedback_quality_signal_selection_check/
  );
  await assert.rejects(
    () => sql`
      UPDATE feedback_quality_signal
      SET contract_version = 'feedback-quality-signal.v2'
      WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
    `,
    /feedback_quality_signal_outcome_check/
  );
  await sql`
    UPDATE feedback_quality_signal
    SET contract_version = 'feedback-quality-signal.v2',
        review_outcome = 'coaching_review',
        reason = 'score_withholding_unclear'
    WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
  `;
  await assert.rejects(
    () => sql`
      UPDATE feedback_quality_signal
      SET reason = 'score_explanation_unclear'
      WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
    `,
    /feedback_quality_signal_selection_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO feedback_quality_signal (
        user_id, session_id, feedback_id, contract_version,
        review_outcome, response, reason
      ) VALUES (
        ${FEEDBACK_QUALITY_OTHER_USER}::uuid,
        ${FEEDBACK_QUALITY_SESSION}::uuid,
        ${FEEDBACK_QUALITY_FEEDBACK}::uuid,
        'feedback-quality-signal.v1',
        'coaching_review',
        'not_helpful',
        'score_withholding_unclear'
      )
    `,
    /feedback_quality_signal_session_owner_fk/
  );

  await assert.rejects(
    () =>
      sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub', ${FEEDBACK_QUALITY_USER}, true)`;
        await tx`SELECT count(*) FROM feedback_quality_signal`;
      }),
    /permission denied/
  );
  const directPrivileges = await sql<
    { authenticated_select: boolean; authenticated_update: boolean }[]
  >`
    SELECT
      has_table_privilege(
        'authenticated', 'public.feedback_quality_signal', 'SELECT'
      ) AS authenticated_select,
      has_table_privilege(
        'authenticated', 'public.feedback_quality_signal', 'UPDATE'
      ) AS authenticated_update
  `;
  assert.deepEqual(directPrivileges[0], {
    authenticated_select: false,
    authenticated_update: false,
  });

  const functionPrivileges = await sql<
    {
      proname: string;
      authenticated_execute: boolean;
      service_execute: boolean;
    }[]
  >`
    SELECT p.proname,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'can_read_owned_feedback_quality_signal',
        'consume_feedback_quality_signal_rate_limit'
      )
    ORDER BY p.proname
  `;
  assert.deepEqual(Array.from(functionPrivileges), [
    {
      proname: "can_read_owned_feedback_quality_signal",
      authenticated_execute: true,
      service_execute: true,
    },
    {
      proname: "consume_feedback_quality_signal_rate_limit",
      authenticated_execute: false,
      service_execute: true,
    },
  ]);

  const limiterResults = await Promise.all(
    Array.from(
      { length: 25 },
      () =>
        sql<{ allowed: boolean; retry_after_seconds: number }[]>`
        SELECT allowed, retry_after_seconds
        FROM consume_feedback_quality_signal_rate_limit(
          ${FEEDBACK_QUALITY_USER}::uuid,
          20
        )
      `
    )
  );
  assert.equal(limiterResults.filter(([row]) => row?.allowed).length, 20);
  const denied = limiterResults.filter(([row]) => !row?.allowed);
  assert.equal(denied.length, 5);
  assert.ok(
    denied.every(
      ([row]) =>
        (row?.retry_after_seconds ?? 0) >= 1 &&
        (row?.retry_after_seconds ?? 0) <= 3_600
    )
  );

  const writers = [
    postgres(databaseUrl, { max: 1, prepare: false }),
    postgres(databaseUrl, { max: 1, prepare: false }),
  ];
  try {
    const updates = await Promise.all([
      writers[0]!<{ revision: number }[]>`
        UPDATE feedback_quality_signal
        SET response = 'helpful', reason = NULL,
          revision = revision + 1, updated_at = clock_timestamp()
        WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid AND revision = 1
        RETURNING revision
      `,
      writers[1]!<{ revision: number }[]>`
        UPDATE feedback_quality_signal
        SET response = 'not_helpful', reason = 'too_much_to_use',
          revision = revision + 1, updated_at = clock_timestamp()
        WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid AND revision = 1
        RETURNING revision
      `,
    ]);
    assert.equal(updates.flat().length, 1);
    assert.equal(updates.flat()[0]?.revision, 2);
  } finally {
    await Promise.all(writers.map((writer) => writer.end()));
  }

  await sql`
    INSERT INTO account_deletion_request (user_id)
    VALUES (${FEEDBACK_QUALITY_USER}::uuid)
  `;
  const readableAfterDeletionIntent = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE authenticated");
    await tx`SELECT set_config('request.jwt.claim.sub', ${FEEDBACK_QUALITY_USER}, true)`;
    return tx<{ readable: boolean }[]>`
      SELECT can_read_owned_feedback_quality_signal(
        ${FEEDBACK_QUALITY_USER}::uuid
      ) AS readable
    `;
  });
  assert.equal(readableAfterDeletionIntent[0]?.readable, false);
  await sql`
    DELETE FROM account_deletion_request
    WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
  `;

  if (verifyApplicationLifecycle) {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    try {
      const { loadAccountExportSource } = await import(
        "../lib/db/account-export"
      );
      const { createAccountDataExport } = await import(
        "../lib/workflows/export-account-data"
      );
      const source = await loadAccountExportSource(FEEDBACK_QUALITY_USER);
      assert.equal(source.feedbackQualitySignals.length, 1);
      const exported = createAccountDataExport({
        authenticatedUser: { id: FEEDBACK_QUALITY_USER },
        source,
        exportedAt: new Date("2026-08-13T12:00:00.000Z"),
      });
      assert.equal(exported.schemaVersion, "1.5.0");
      assert.equal(exported.practice.feedbackQualitySignals.length, 1);
      assert.equal(
        JSON.stringify(exported.practice.feedbackQualitySignals).includes(
          FEEDBACK_QUALITY_SESSION
        ),
        false
      );

      const { deleteUserApplicationData } = await import(
        "../lib/db/account-deletions"
      );
      await deleteUserApplicationData(FEEDBACK_QUALITY_USER);
      const [writeWinsCleanup] = await sql<
        { signals: number; limiter: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM feedback_quality_signal
            WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid) AS signals,
          (SELECT count(*)::int FROM feedback_quality_signal_rate_limit
            WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid) AS limiter
      `;
      assert.deepEqual(writeWinsCleanup, { signals: 0, limiter: 0 });

      await sql`
        INSERT INTO app_user (id, email)
        VALUES (
          ${FEEDBACK_QUALITY_DELETION_USER}::uuid,
          'feedback-quality-deletion@example.invalid'
        )
      `;
      await sql`
        INSERT INTO interview_session (id, user_id, round_type, mode)
        VALUES (
          ${FEEDBACK_QUALITY_DELETION_SESSION}::uuid,
          ${FEEDBACK_QUALITY_DELETION_USER}::uuid,
          'product_sense',
          'voice_video'
        )
      `;
      await sql`
        INSERT INTO feedback (id, session_id, status)
        VALUES (
          ${FEEDBACK_QUALITY_DELETION_FEEDBACK}::uuid,
          ${FEEDBACK_QUALITY_DELETION_SESSION}::uuid,
          'completed'
        )
      `;
      await verifyFeedbackQualityDeletionWinsRateLimit(
        sql,
        databaseUrl,
        FEEDBACK_QUALITY_DELETION_USER
      );
      const [lateRateDecision] = await sql<
        { allowed: boolean; retry_after_seconds: number }[]
      >`
        SELECT allowed, retry_after_seconds
        FROM consume_feedback_quality_signal_rate_limit(
          ${FEEDBACK_QUALITY_DELETION_USER}::uuid,
          20
        )
      `;
      assert.deepEqual(lateRateDecision, {
        allowed: true,
        retry_after_seconds: 0,
      });
      const [lateRateRows] = await sql<{ rows: number }[]>`
        SELECT count(*)::int AS rows
        FROM feedback_quality_signal_rate_limit
        WHERE user_id = ${FEEDBACK_QUALITY_DELETION_USER}::uuid
      `;
      assert.equal(lateRateRows?.rows, 0);
      const { createDrizzleFeedbackQualitySignalRepository } = await import(
        "../lib/db/feedback-quality-signals"
      );
      const deletionFirst =
        await createDrizzleFeedbackQualitySignalRepository().writeOwned({
          userId: FEEDBACK_QUALITY_DELETION_USER,
          sessionId: FEEDBACK_QUALITY_DELETION_SESSION,
          outcome: "scorecard",
          command: {
            contractVersion: "feedback-quality-signal.v2",
            response: "helpful",
            reason: null,
            expectedRevision: null,
          },
        });
      assert.equal(deletionFirst.disposition, "account_deletion_pending");
      await deleteUserApplicationData(FEEDBACK_QUALITY_DELETION_USER);
      const [notRecreated] = await sql<{ rows: number }[]>`
        SELECT count(*)::int AS rows FROM feedback_quality_signal
        WHERE user_id = ${FEEDBACK_QUALITY_DELETION_USER}::uuid
      `;
      assert.equal(notRecreated?.rows, 0);
      await sql`
        DELETE FROM app_user WHERE id = ${FEEDBACK_QUALITY_OTHER_USER}::uuid
      `;
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  } else {
    await sql`
      DELETE FROM feedback_quality_signal
      WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
    `;
    await sql`
      DELETE FROM feedback_quality_signal_rate_limit
      WHERE user_id = ${FEEDBACK_QUALITY_USER}::uuid
    `;
    await sql`
      DELETE FROM feedback WHERE id = ${FEEDBACK_QUALITY_FEEDBACK}::uuid
    `;
    await sql`
      DELETE FROM interview_session WHERE id = ${FEEDBACK_QUALITY_SESSION}::uuid
    `;
    await sql`
      DELETE FROM app_user
      WHERE id IN (
        ${FEEDBACK_QUALITY_USER}::uuid,
        ${FEEDBACK_QUALITY_OTHER_USER}::uuid
      )
    `;
  }
}

async function verifyFeedbackQualityDeletionWinsRateLimit(
  sql: postgres.Sql,
  databaseUrl: string,
  userId: string
) {
  const deletionClient = postgres(databaseUrl, { max: 1, prepare: false });
  const limiterClient = postgres(databaseUrl, { max: 1, prepare: false });
  let releaseDeletion!: () => void;
  let signalDeletionReady!: () => void;
  let released = false;
  const release = new Promise<void>((resolve) => {
    releaseDeletion = () => {
      released = true;
      resolve();
    };
  });
  const deletionReady = new Promise<void>((resolve) => {
    signalDeletionReady = resolve;
  });
  const deletionTransaction = deletionClient.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${userId},
          ${ACCOUNT_IDENTITY_LOCK_NAMESPACE}::bigint
        )
      )
    `;
    await tx`
      INSERT INTO account_deletion_request (user_id)
      VALUES (${userId}::uuid)
    `;
    await tx`
      DELETE FROM feedback_quality_signal_rate_limit
      WHERE user_id = ${userId}::uuid
    `;
    signalDeletionReady();
    await release;
  });

  let limiterAttempt: Promise<
    { allowed: boolean; retry_after_seconds: number }[]
  > | null = null;
  try {
    await deletionReady;
    const [backend] = await limiterClient<{ pid: number }[]>`
      SELECT pg_backend_pid() AS pid
    `;
    assert.ok(backend?.pid);
    let limiterSettled = false;
    limiterAttempt = limiterClient<
      { allowed: boolean; retry_after_seconds: number }[]
    >`
      SELECT allowed, retry_after_seconds
      FROM consume_feedback_quality_signal_rate_limit(${userId}::uuid, 20)
    `.finally(() => {
      limiterSettled = true;
    });

    await waitForDatabaseLock(sql, backend.pid);
    assert.equal(limiterSettled, false);
    releaseDeletion();
    await deletionTransaction;

    const [decision] = await limiterAttempt;
    assert.deepEqual(decision, { allowed: true, retry_after_seconds: 0 });
    const [remaining] = await sql<{ rows: number }[]>`
      SELECT count(*)::int AS rows
      FROM feedback_quality_signal_rate_limit
      WHERE user_id = ${userId}::uuid
    `;
    assert.equal(remaining?.rows, 0);
  } finally {
    if (!released) releaseDeletion();
    await Promise.allSettled([
      deletionTransaction,
      ...(limiterAttempt ? [limiterAttempt] : []),
    ]);
    await Promise.all([deletionClient.end(), limiterClient.end()]);
  }
}

async function verifyShadowFeedbackArtifactPersistence(
  sql: postgres.Sql,
  databaseUrl: string,
  verifyApplicationLifecycle: boolean
) {
  const { createShadowFeedbackArtifactKey, SHADOW_FEEDBACK_ARTIFACT_VERSION } =
    await import("../packages/core/src/index");
  const makeKey = (modelVersion: string) =>
    createShadowFeedbackArtifactKey({
      sessionId: SHADOW_ARTIFACT_SESSION,
      trustedBlockIdentity: {
        contractVersion: "trusted-answer-block-identity.v1",
        answerBlockId: "answer-block:0001",
        identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
      },
      rubricVersion: "pm-feedback-rubric.v3",
      promptVersion: "feedback.prompt.dimension-coverage.v1",
      selectionSchemaVersion: "feedback.dimension-coverage.selection.v1",
      modelVersion,
    });
  const makeArtifact = (key: ReturnType<typeof makeKey>) => ({
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: {
      state: "completed" as const,
      roundType: "strategy" as const,
      mode: "coaching_review" as const,
      dimensions: {
        structure: { score: null, facetCodes: [] },
        clarity: { score: null, facetCodes: [] },
        insight: { score: null, facetCodes: [] },
        communication: { score: null, facetCodes: [] },
        leadership: { score: null, facetCodes: [] },
      },
    },
    metrics: {
      durationMs: 800,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2020-01-01T00:00:00.000Z",
  });
  const currentArtifact = makeArtifact(makeKey("synthetic-shadow-model.v1"));
  const staleArtifact = makeArtifact(makeKey("synthetic-shadow-model.v0"));

  await sql`
    INSERT INTO app_user (id, email)
    VALUES (
      ${SHADOW_ARTIFACT_USER}::uuid,
      'shadow-artifact@example.invalid'
    )
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode)
    VALUES (
      ${SHADOW_ARTIFACT_SESSION}::uuid,
      ${SHADOW_ARTIFACT_USER}::uuid,
      'strategy',
      'voice_video'
    )
  `;

  const insertArtifact = async (artifact: ReturnType<typeof makeArtifact>) => {
    const { key } = artifact;
    await sql`
      INSERT INTO shadow_feedback_artifact (
        artifact_key_fingerprint, user_id, session_id,
        key_contract_version, artifact_contract_version,
        trusted_block_fingerprint, rubric_version, prompt_version,
        selection_schema_version, model_version, artifact, completed_at
      ) VALUES (
        ${key.keyFingerprint},
        ${SHADOW_ARTIFACT_USER}::uuid,
        ${key.sessionId}::uuid,
        ${key.contractVersion},
        ${artifact.contractVersion},
        ${key.trustedBlockFingerprint},
        ${key.rubricVersion},
        ${key.promptVersion},
        ${key.selectionSchemaVersion},
        ${key.modelVersion},
        ${JSON.stringify(artifact)}::jsonb,
        ${artifact.completedAt}::timestamptz
      )
    `;
  };

  if (verifyApplicationLifecycle) {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousStorageSetting =
      process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
    process.env.DATABASE_URL = databaseUrl;
    try {
      const { getShadowFeedbackArtifactStorageGate } = await import(
        "../lib/evaluation/shadow-feedback-artifact-config"
      );
      const { createShadowFeedbackArtifactStore } = await import(
        "../lib/db/shadow-feedback-artifacts"
      );
      const store = createShadowFeedbackArtifactStore();
      delete process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
      const disabledGate = getShadowFeedbackArtifactStorageGate();
      assert.equal(
        await store.record(disabledGate, {
          userId: SHADOW_ARTIFACT_USER,
          artifact: currentArtifact,
        }),
        "disabled"
      );
      const [disabledCount] = await sql<{ rows: number }[]>`
        SELECT count(*)::int AS rows FROM shadow_feedback_artifact
        WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid
      `;
      assert.equal(disabledCount?.rows, 0);

      process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE = "enabled";
      const enabledGate = getShadowFeedbackArtifactStorageGate();
      assert.equal(
        await store.record(enabledGate, {
          userId: SHADOW_ARTIFACT_USER,
          artifact: currentArtifact,
        }),
        "inserted"
      );
      for (const replayKind of ["crash_retry", "event_replay", "reconnect"]) {
        assert.equal(
          await store.record(enabledGate, {
            userId: SHADOW_ARTIFACT_USER,
            artifact: currentArtifact,
          }),
          "duplicate",
          replayKind
        );
      }
      assert.equal(
        await store.record(enabledGate, {
          userId: SHADOW_ARTIFACT_USER,
          artifact: {
            ...currentArtifact,
            completedAt: "2020-01-01T00:00:01.000Z",
          },
        }),
        "conflict"
      );
      assert.equal(
        await store.record(enabledGate, {
          userId: SHADOW_ARTIFACT_USER,
          artifact: staleArtifact,
        }),
        "inserted"
      );
      const exact = await store.readExact(enabledGate, [currentArtifact.key]);
      assert.equal(exact.status, "complete");
      assert.deepEqual(
        exact.artifacts.map(({ key }) => key.keyFingerprint),
        [currentArtifact.key.keyFingerprint]
      );

      const { loadAccountExportSource } = await import(
        "../lib/db/account-export"
      );
      const { createAccountDataExport } = await import(
        "../lib/workflows/export-account-data"
      );
      const source = await loadAccountExportSource(SHADOW_ARTIFACT_USER);
      assert.equal(source.shadowFeedbackArtifacts.length, 2);
      const exported = createAccountDataExport({
        authenticatedUser: { id: SHADOW_ARTIFACT_USER },
        source,
        exportedAt: new Date("2026-08-14T12:00:00.000Z"),
      });
      assert.equal(exported.schemaVersion, "1.5.0");
      assert.equal(exported.practice.shadowFeedbackArtifacts.length, 2);
      assert.equal(JSON.stringify(exported).includes("providerPayload"), false);
    } finally {
      if (previousStorageSetting === undefined) {
        delete process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
      } else {
        process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE =
          previousStorageSetting;
      }
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  } else {
    await insertArtifact(currentArtifact);
    await insertArtifact(staleArtifact);
  }

  const [stored] = await sql<{ rows: number; oldest_completed_at: Date }[]>`
    SELECT count(*)::int AS rows, min(completed_at) AS oldest_completed_at
    FROM shadow_feedback_artifact
    WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid
  `;
  assert.equal(stored?.rows, 2);
  assert.equal(
    new Date(stored!.oldest_completed_at).toISOString(),
    "2020-01-01T00:00:00.000Z"
  );

  await assert.rejects(
    () => sql`
      UPDATE shadow_feedback_artifact
      SET completed_at = '2026-08-14T12:00:00.000Z'::timestamptz
      WHERE artifact_key_fingerprint = ${currentArtifact.key.keyFingerprint}
    `,
    /shadow_feedback_artifact_immutable/
  );

  const alternateFingerprint = `shadow-feedback-artifact-key.v1:${"f".repeat(64)}`;
  const alternateArtifact = {
    ...currentArtifact,
    key: {
      ...currentArtifact.key,
      keyFingerprint: alternateFingerprint,
    },
  };
  await assert.rejects(
    () => sql`
      INSERT INTO shadow_feedback_artifact (
        artifact_key_fingerprint, user_id, session_id,
        key_contract_version, artifact_contract_version,
        trusted_block_fingerprint, rubric_version, prompt_version,
        selection_schema_version, model_version, artifact, completed_at
      ) VALUES (
        ${alternateFingerprint}, ${SHADOW_ARTIFACT_USER}::uuid,
        ${SHADOW_ARTIFACT_SESSION}::uuid,
        ${currentArtifact.key.contractVersion},
        ${currentArtifact.contractVersion},
        ${currentArtifact.key.trustedBlockFingerprint},
        ${currentArtifact.key.rubricVersion},
        ${currentArtifact.key.promptVersion},
        ${currentArtifact.key.selectionSchemaVersion},
        ${currentArtifact.key.modelVersion},
        ${JSON.stringify(alternateArtifact)}::jsonb,
        ${currentArtifact.completedAt}::timestamptz
      )
    `,
    /shadow_feedback_artifact_exact_key_uniq/
  );

  const oversizedBase = makeArtifact(
    makeKey("synthetic-shadow-model.oversized")
  );
  const oversizedArtifact = {
    ...oversizedBase,
    outcome: {
      ...oversizedBase.outcome,
      dimensions: {
        ...oversizedBase.outcome.dimensions,
        structure: {
          ...oversizedBase.outcome.dimensions.structure,
          facetCodes: Array.from({ length: 20_000 }, () => "x"),
        },
      },
    },
  };
  await assert.rejects(
    () => sql`
      INSERT INTO shadow_feedback_artifact (
        artifact_key_fingerprint, user_id, session_id,
        key_contract_version, artifact_contract_version,
        trusted_block_fingerprint, rubric_version, prompt_version,
        selection_schema_version, model_version, artifact, completed_at
      ) VALUES (
        ${oversizedArtifact.key.keyFingerprint},
        ${SHADOW_ARTIFACT_USER}::uuid, ${SHADOW_ARTIFACT_SESSION}::uuid,
        ${oversizedArtifact.key.contractVersion},
        ${oversizedArtifact.contractVersion},
        ${oversizedArtifact.key.trustedBlockFingerprint},
        ${oversizedArtifact.key.rubricVersion},
        ${oversizedArtifact.key.promptVersion},
        ${oversizedArtifact.key.selectionSchemaVersion},
        ${oversizedArtifact.key.modelVersion},
        ${JSON.stringify(oversizedArtifact)}::jsonb,
        ${oversizedArtifact.completedAt}::timestamptz
      )
    `,
    /shadow_feedback_artifact_shape_check/
  );

  const topLevelUnknownArtifact = {
    ...makeArtifact(makeKey("synthetic-shadow-model.unknown-top-level")),
    providerPayload: { response: "forbidden" },
  };
  await assert.rejects(
    () => insertArtifact(topLevelUnknownArtifact),
    /shadow_feedback_artifact_exact_json_shape_check/
  );

  const nestedUnknownBase = makeArtifact(
    makeKey("synthetic-shadow-model.unknown-nested")
  );
  const nestedUnknownArtifact = {
    ...nestedUnknownBase,
    metrics: {
      ...nestedUnknownBase.metrics,
      transcriptText: "forbidden",
    },
  };
  await assert.rejects(
    () => insertArtifact(nestedUnknownArtifact),
    /shadow_feedback_artifact_exact_json_shape_check/
  );

  const privileges = await sql<
    {
      anon_select: boolean;
      authenticated_select: boolean;
      service_select: boolean;
      service_insert: boolean;
      service_delete: boolean;
      service_update: boolean;
    }[]
  >`
    SELECT
      has_table_privilege('anon', 'public.shadow_feedback_artifact', 'SELECT') AS anon_select,
      has_table_privilege('authenticated', 'public.shadow_feedback_artifact', 'SELECT') AS authenticated_select,
      has_table_privilege('service_role', 'public.shadow_feedback_artifact', 'SELECT') AS service_select,
      has_table_privilege('service_role', 'public.shadow_feedback_artifact', 'INSERT') AS service_insert,
      has_table_privilege('service_role', 'public.shadow_feedback_artifact', 'DELETE') AS service_delete,
      has_table_privilege('service_role', 'public.shadow_feedback_artifact', 'UPDATE') AS service_update
  `;
  assert.deepEqual(privileges[0], {
    anon_select: false,
    authenticated_select: false,
    service_select: true,
    service_insert: true,
    service_delete: true,
    service_update: false,
  });

  const [sideEffects] = await sql<
    {
      feedback: number;
      insights: number;
      usage: number;
      subscriptions: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM feedback
        WHERE session_id = ${SHADOW_ARTIFACT_SESSION}::uuid) AS feedback,
      (SELECT count(*)::int FROM user_insights
        WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid) AS insights,
      (SELECT count(*)::int FROM usage_record
        WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid) AS usage,
      (SELECT count(*)::int FROM subscription
        WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid) AS subscriptions
  `;
  assert.deepEqual(sideEffects, {
    feedback: 0,
    insights: 0,
    usage: 0,
    subscriptions: 0,
  });

  if (verifyApplicationLifecycle) {
    const { deleteUserApplicationData } = await import(
      "../lib/db/account-deletions"
    );
    await deleteUserApplicationData(SHADOW_ARTIFACT_USER, drizzle(sql));
  } else {
    await sql`
      DELETE FROM shadow_feedback_artifact
      WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id = ${SHADOW_ARTIFACT_SESSION}::uuid
    `;
    await sql`
      DELETE FROM app_user WHERE id = ${SHADOW_ARTIFACT_USER}::uuid
    `;
  }
  const [deleted] = await sql<
    { artifacts: number; sessions: number; users: number }[]
  >`
    SELECT
      (SELECT count(*)::int FROM shadow_feedback_artifact
        WHERE user_id = ${SHADOW_ARTIFACT_USER}::uuid) AS artifacts,
      (SELECT count(*)::int FROM interview_session
        WHERE id = ${SHADOW_ARTIFACT_SESSION}::uuid) AS sessions,
      (SELECT count(*)::int FROM app_user
        WHERE id = ${SHADOW_ARTIFACT_USER}::uuid) AS users
  `;
  assert.deepEqual(deleted, { artifacts: 0, sessions: 0, users: 0 });
}

async function verifyFeedbackStageAttemptPersistence(
  sql: postgres.Sql,
  verifyApplicationLifecycle: boolean
) {
  await sql`
    INSERT INTO app_user (id, email)
    VALUES (
      ${FEEDBACK_STAGE_ATTEMPT_USER}::uuid,
      'feedback-stage-attempt@example.invalid'
    )
  `;
  await sql`
    INSERT INTO interview_session (id, user_id, round_type, mode)
    VALUES (
      ${FEEDBACK_STAGE_ATTEMPT_SESSION}::uuid,
      ${FEEDBACK_STAGE_ATTEMPT_USER}::uuid,
      'strategy',
      'voice_video'
    )
  `;
  await sql`
    INSERT INTO feedback (
      id, session_id, status, dispatch_status, dispatch_event_id,
      dispatch_attempts, dispatched_at
    ) VALUES (
      ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
      ${FEEDBACK_STAGE_ATTEMPT_SESSION}::uuid,
      'pending',
      'sent',
      ${FEEDBACK_STAGE_ATTEMPT_EVENT},
      1,
      '2026-08-14T06:00:00.000Z'::timestamptz
    )
  `;

  const claimAttempt = {
    sessionId: FEEDBACK_STAGE_ATTEMPT_SESSION,
    generationEventId: FEEDBACK_STAGE_ATTEMPT_EVENT,
    workflowAttempt: 1,
    operation: "claim" as const,
    stage: "claim" as const,
    providerAttempt: null,
    outcome: "succeeded" as const,
    retryable: false,
    startedAt: new Date("2026-08-14T06:00:00.000Z"),
    completedAt: new Date("2026-08-14T06:00:00.010Z"),
    durationMs: 10,
    remainingBudgetMs: 89_990,
    environmentClass: "test" as const,
  };
  if (verifyApplicationLifecycle) {
    const {
      createDrizzleFeedbackGenerationStageAttemptRepository,
      createFeedbackGenerationStageAttemptStore,
    } = await import("../lib/db/feedback-generation-stage-attempts");
    const store = createFeedbackGenerationStageAttemptStore(
      createDrizzleFeedbackGenerationStageAttemptRepository(drizzle(sql))
    );
    assert.equal(await store.record(claimAttempt), "inserted");
    assert.equal(await store.record(claimAttempt), "duplicate");
    assert.equal(
      await store.record({
        ...claimAttempt,
        completedAt: new Date("2026-08-14T06:00:00.011Z"),
        durationMs: 11,
      }),
      "conflict"
    );
    assert.equal(
      await store.record({
        ...claimAttempt,
        generationEventId: `${FEEDBACK_STAGE_ATTEMPT_EVENT}:retired`,
      }),
      "fenced"
    );
  } else {
    await sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, provider_attempt, outcome, retryable, started_at,
        completed_at, duration_ms, duration_bucket, remaining_budget_ms,
        environment_class
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_FENCE},
        1, 'claim', 'claim', NULL, 'succeeded', false,
        '2026-08-14T06:00:00.000Z'::timestamptz,
        '2026-08-14T06:00:00.010Z'::timestamptz,
        10, 'lt_1s', 89990, 'test'
      )
    `;
  }

  await sql`
    INSERT INTO feedback_generation_stage_attempt (
      feedback_id, generation_event_fence, workflow_attempt, operation,
      stage, provider_attempt, outcome, failure_class, retryable, started_at,
      completed_at, duration_ms, duration_bucket, remaining_budget_ms,
      retry_after_ms, environment_class, provider_diagnostic_kind,
      provider_http_status, observed_model, observed_service_tier
    ) VALUES (
      ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
      ${FEEDBACK_STAGE_ATTEMPT_FENCE},
      1, 'provider_request', 'provider', 1, 'retrying',
      'provider_rate_limited', true,
      '2026-08-14T06:00:01.000Z'::timestamptz,
      '2026-08-14T06:00:02.000Z'::timestamptz,
      1000, '1s_to_5s', 70000, 2500, 'test',
      'provider_rate_limited', 429, 'fixture-model', 'default'
    )
  `;

  await assert.rejects(
    () => sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, outcome, retryable, started_at, completed_at, duration_ms,
        duration_bucket, remaining_budget_ms, environment_class
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_FENCE},
        1, 'authorization', 'claim', 'succeeded', false,
        '2026-08-14T06:00:03.000Z'::timestamptz,
        '2026-08-14T06:00:04.000Z'::timestamptz,
        1000, 'lt_1s', 60000, 'test'
      )
    `,
    /feedback_generation_stage_attempt_duration_bucket_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, outcome, retryable, started_at, completed_at, duration_ms,
        duration_bucket, remaining_budget_ms, environment_class
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_FENCE},
        1, 'legacy_evidence', 'evidence_preparation', 'succeeded', false,
        '2026-08-14T06:00:05.000Z'::timestamptz,
        '2026-08-14T06:01:05.000Z'::timestamptz,
        10, 'lt_1s', 50000, 'test'
      )
    `,
    /feedback_generation_stage_attempt_timing_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, outcome, retryable, started_at, completed_at, duration_ms,
        duration_bucket, remaining_budget_ms, environment_class,
        provider_diagnostic_kind
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_FENCE},
        1, 'answer_blocks', 'evidence_preparation', 'succeeded', false,
        '2026-08-14T06:00:06.000Z'::timestamptz,
        '2026-08-14T06:00:06.010Z'::timestamptz,
        10, 'lt_1s', 40000, 'test', 'provider_timeout'
      )
    `,
    /feedback_generation_stage_attempt_provider_context_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, provider_attempt, outcome, failure_class, retryable,
        started_at, completed_at, duration_ms, duration_bucket,
        remaining_budget_ms, retry_after_ms, environment_class
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_FENCE},
        1, 'provider_response', 'validation', 2, 'retrying',
        'provider_rate_limited', true,
        '2026-08-14T06:00:07.000Z'::timestamptz,
        '2026-08-14T06:00:07.010Z'::timestamptz,
        10, 'lt_1s', 30000, 1000, 'test'
      )
    `,
    /feedback_generation_stage_attempt_provider_context_check/
  );
  await assert.rejects(
    () => sql`
      INSERT INTO feedback_generation_stage_attempt (
        feedback_id, generation_event_fence, workflow_attempt, operation,
        stage, outcome, retryable, started_at, completed_at, duration_ms,
        duration_bucket, remaining_budget_ms, environment_class
      ) VALUES (
        ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid,
        ${FEEDBACK_STAGE_ATTEMPT_EVENT},
        1, 'queue_wait', 'claim', 'succeeded', false,
        '2026-08-14T06:00:08.000Z'::timestamptz,
        '2026-08-14T06:00:08.010Z'::timestamptz,
        10, 'lt_1s', 20000, 'test'
      )
    `,
    /feedback_generation_stage_attempt_event_fence_check/
  );

  const rows = await sql<
    { generation_event_fence: string; serialized: string }[]
  >`
    SELECT generation_event_fence, row_to_json(attempt)::text AS serialized
    FROM feedback_generation_stage_attempt attempt
    WHERE feedback_id = ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid
    ORDER BY operation
  `;
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      ({ generation_event_fence }) =>
        generation_event_fence === FEEDBACK_STAGE_ATTEMPT_FENCE
    )
  );
  const serializedRows = JSON.stringify(rows);
  assert.equal(serializedRows.includes(FEEDBACK_STAGE_ATTEMPT_SESSION), false);
  assert.equal(serializedRows.includes(FEEDBACK_STAGE_ATTEMPT_EVENT), false);

  if (verifyApplicationLifecycle) {
    const { deleteUserApplicationData } = await import(
      "../lib/db/account-deletions"
    );
    await deleteUserApplicationData(FEEDBACK_STAGE_ATTEMPT_USER, drizzle(sql));
    const [deleted] = await sql<
      { attempts: number; feedback: number; sessions: number; users: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM feedback_generation_stage_attempt
          WHERE feedback_id = ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid)
          AS attempts,
        (SELECT count(*)::int FROM feedback
          WHERE id = ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid) AS feedback,
        (SELECT count(*)::int FROM interview_session
          WHERE id = ${FEEDBACK_STAGE_ATTEMPT_SESSION}::uuid) AS sessions,
        (SELECT count(*)::int FROM app_user
          WHERE id = ${FEEDBACK_STAGE_ATTEMPT_USER}::uuid) AS users
    `;
    assert.deepEqual(deleted, {
      attempts: 0,
      feedback: 0,
      sessions: 0,
      users: 0,
    });
  } else {
    await sql`
      DELETE FROM feedback_generation_stage_attempt
      WHERE feedback_id = ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid
    `;
    await sql`
      DELETE FROM feedback WHERE id = ${FEEDBACK_STAGE_ATTEMPT_FEEDBACK}::uuid
    `;
    await sql`
      DELETE FROM interview_session
      WHERE id = ${FEEDBACK_STAGE_ATTEMPT_SESSION}::uuid
    `;
    await sql`
      DELETE FROM app_user WHERE id = ${FEEDBACK_STAGE_ATTEMPT_USER}::uuid
    `;
  }
}

async function verifyDatabase(sql: postgres.Sql) {
  assert.equal(await migrationCount(sql), 43);

  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  assert.equal(tables.length, 42);
  assert.ok(
    tables.some(({ table_name }) => table_name === "shadow_feedback_artifact")
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "billing_adjustment")
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "billing_payment_state")
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "credit_rollover_lot")
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "credit_rollover_lot_allocation"
    )
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "transcript_interruption_marker"
    )
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "transcript_runtime_settlement"
    )
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "transcript_runtime_settlement_command"
    )
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "transcript_runtime_writer")
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "transcript_evidence_writer_cutoff"
    )
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "livekit_reconnect_rate_limit"
    )
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "account_deletion_request")
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "focused_practice_attempt")
  );
  assert.ok(
    tables.some(({ table_name }) => table_name === "feedback_quality_signal")
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "feedback_quality_signal_rate_limit"
    )
  );
  assert.ok(
    tables.some(
      ({ table_name }) => table_name === "feedback_generation_stage_attempt"
    )
  );
  for (const table of [
    "contact_submission",
    "contact_submission_access_audit",
    "contact_submission_rate_limit",
  ]) {
    assert.ok(tables.some(({ table_name }) => table_name === table));
  }

  const contactContracts = await sql<{ name: string }[]>`
    SELECT conname AS name
    FROM pg_constraint
    WHERE conname IN (
      'contact_submission_user_id_app_user_id_fk',
      'contact_submission_reason_check',
      'contact_submission_name_bounds_check',
      'contact_submission_email_bounds_check',
      'contact_submission_subject_bounds_check',
      'contact_submission_message_bounds_check',
      'contact_submission_persistence_state_check',
      'contact_submission_triage_state_check',
      'contact_submission_access_audit_type_check',
      'contact_submission_access_audit_actor_reference_check',
      'contact_submission_rate_limit_identity_hash_check',
      'contact_submission_rate_limit_request_count_check'
    )
  `;
  assert.equal(contactContracts.length, 12);

  const contactIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'contact_submission_idempotency_key_idx',
        'contact_submission_created_at_idx',
        'contact_submission_user_id_idx',
        'contact_submission_access_audit_submission_created_idx',
        'contact_submission_rate_limit_window_started_idx'
      )
  `;
  assert.equal(contactIndexes.length, 5);

  await verifyAnalyticsConsentSchema(sql);

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

  const stableStartColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_session'
      AND column_name IN (
        'start_contract_version', 'start_attempt_id',
        'start_request_fingerprint', 'provisioning_state',
        'provisioning_lease_id', 'provisioning_lease_expires_at',
        'provisioned_at', 'usable_at', 'usable_transcript_event_id'
      )
    ORDER BY column_name
  `;
  assert.equal(stableStartColumns.length, 9);

  const stableStartContracts = await sql<{ name: string }[]>`
    SELECT conname AS name FROM pg_constraint
    WHERE conname IN (
      'interview_session_start_contract_version_check',
      'interview_session_start_contract_shape_check',
      'interview_session_provisioning_evidence_check',
      'interview_session_usable_evidence_check',
      'credit_reservation_start_contract_version_check',
      'credit_reservation_start_contract_shape_check',
      'credit_reservation_session_user_start_attempt_fk',
      'session_question_start_contract_version_check',
      'session_question_start_contract_shape_check',
      'session_question_session_start_attempt_fk'
    )
    UNION ALL
    SELECT indexname AS name FROM pg_indexes
    WHERE schemaname = 'public' AND indexname IN (
      'interview_session_user_start_attempt_idx',
      'interview_session_livekit_room_v1_idx',
      'credit_reservation_session_v1_idx',
      'credit_reservation_start_attempt_idx',
      'session_question_session_idx',
      'session_question_start_attempt_idx'
    )
    UNION ALL
    SELECT trigger_name AS name FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name = 'protect_interview_session_stable_evidence'
  `;
  assert.equal(stableStartContracts.length, 17);

  const billingEvidenceTriggers = await sql<{ name: string }[]>`
    SELECT trigger_name AS name
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name = 'billing_adjustment_immutable'
  `;
  assert.equal(billingEvidenceTriggers.length, 1);

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

  const reconnectColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_session'
      AND column_name IN (
        'reconnect_deadline_at', 'reconnect_deadline_owner',
        'room_cleanup_pending',
        'room_cleanup_attempted_at', 'room_provisioning_pending',
        'room_provisioning_started_at', 'presence_reconciled_at',
        'runtime_ready_at', 'last_transport_event_at',
        'last_transport_event_id', 'last_transport_event_name'
      )
    ORDER BY column_name
  `;
  assert.equal(reconnectColumns.length, 11);

  const reconnectIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'interview_session_reconnect_deadline_idx',
        'interview_session_presence_reconciliation_idx',
        'interview_session_room_cleanup_recovery_idx',
        'interview_session_room_provisioning_recovery_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(reconnectIndexes.length, 4);

  const reconnectConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'interview_session_room_provisioning_claim_check',
      'interview_session_reconnect_deadline_owner_check'
    )
  `;
  assert.equal(reconnectConstraints.length, 2);

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

  const feedbackV2Columns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback'
      AND column_name IN (
        'schema_version', 'prompt_version', 'model_version', 'evaluation_state'
      )
    ORDER BY column_name
  `;
  assert.equal(feedbackV2Columns.length, 4);

  const feedbackV2Constraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname = 'feedback_version_tuple_check'
  `;
  assert.equal(feedbackV2Constraints.length, 1);

  const stageAttemptColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback_generation_stage_attempt'
    ORDER BY ordinal_position
  `;
  assert.equal(stageAttemptColumns.length, 27);
  const stageAttemptColumnNames = stageAttemptColumns.map(
    ({ column_name }) => column_name
  );
  assert.ok(stageAttemptColumnNames.includes("generation_event_fence"));
  for (const forbiddenColumn of [
    "user_id",
    "session_id",
    "room_name",
    "generation_event_id",
    "provider_request_id",
    "question",
    "transcript",
    "feedback",
    "raw_error",
  ]) {
    assert.equal(stageAttemptColumnNames.includes(forbiddenColumn), false);
  }

  const stageAttemptContracts = await sql<{ name: string }[]>`
    SELECT conname AS name
    FROM pg_constraint
    WHERE conname IN (
      'feedback_generation_stage_attempt_pkey',
      'feedback_generation_stage_attempt_exact_idx',
      'feedback_generation_stage_attempt_feedback_id_feedback_id_fk',
      'feedback_generation_stage_attempt_event_fence_check',
      'feedback_generation_stage_attempt_workflow_attempt_check',
      'feedback_generation_stage_attempt_operation_check',
      'feedback_generation_stage_attempt_stage_check',
      'feedback_generation_stage_attempt_operation_stage_check',
      'feedback_generation_stage_attempt_provider_attempt_check',
      'feedback_generation_stage_attempt_outcome_check',
      'feedback_generation_stage_attempt_failure_class_check',
      'feedback_generation_stage_attempt_outcome_failure_check',
      'feedback_generation_stage_attempt_timing_check',
      'feedback_generation_stage_attempt_duration_bucket_check',
      'feedback_generation_stage_attempt_environment_check',
      'feedback_generation_stage_attempt_release_check',
      'feedback_generation_stage_attempt_provider_diagnostic_check',
      'feedback_generation_stage_attempt_provider_status_check',
      'feedback_generation_stage_attempt_provider_context_check',
      'feedback_generation_stage_attempt_provider_label_check',
      'feedback_generation_stage_attempt_usage_tuple_check'
    )
  `;
  assert.equal(stageAttemptContracts.length, 21);

  const [stageAttemptComment] = await sql<{ comment: string | null }[]>`
    SELECT obj_description(
      'feedback_generation_stage_attempt'::regclass,
      'pg_class'
    ) AS comment
  `;
  assert.match(stageAttemptComment?.comment ?? "", /v1 SHA-256/);
  assert.match(stageAttemptComment?.comment ?? "", /raw event/);
  const [stageAttemptRls] = await sql<{ enabled: boolean; forced: boolean }[]>`
    SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND relname = 'feedback_generation_stage_attempt'
  `;
  assert.deepEqual(stageAttemptRls, { enabled: true, forced: true });

  const transcriptColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_turn'
      AND column_name IN (
        'contract_version', 'event_id', 'writer_id', 'writer_generation', 'sequence',
        'room_name', 'delivery_state'
      )
    ORDER BY column_name
  `;
  assert.equal(transcriptColumns.length, 7);

  const transcriptConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'transcript_turn_contract_version_check',
      'transcript_turn_sequence_check',
      'transcript_turn_delivery_state_check',
      'transcript_turn_canonical_identity_check',
      'transcript_turn_runtime_writer_fk'
    )
    ORDER BY conname
  `;
  assert.equal(transcriptConstraints.length, 5);

  const transcriptIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'transcript_turn_event_id_idx',
        'transcript_turn_session_writer_sequence_idx',
        'transcript_turn_chronological_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(transcriptIndexes.length, 3);

  const markerColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_interruption_marker'
    ORDER BY ordinal_position
  `;
  assert.equal(markerColumns.length, 12);

  const markerConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'transcript_interruption_marker_contract_check',
      'transcript_interruption_marker_speaker_check',
      'transcript_interruption_marker_sequence_check',
      'transcript_interruption_marker_reason_check',
      'transcript_interruption_marker_writer_generation_check',
      'transcript_interruption_marker_runtime_writer_fk'
    )
    ORDER BY conname
  `;
  assert.equal(markerConstraints.length, 6);

  const markerIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'transcript_interruption_marker_event_id_idx',
        'transcript_interruption_marker_session_writer_sequence_idx',
        'transcript_interruption_marker_session_occurred_at_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(markerIndexes.length, 3);

  const settlementColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_settlement'
    ORDER BY ordinal_position
  `;
  assert.equal(settlementColumns.length, 8);

  const settlementConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'transcript_runtime_settlement_contract_check',
      'transcript_runtime_settlement_state_check',
      'transcript_runtime_settlement_writer_generation_check',
      'transcript_runtime_settlement_writer_fk'
    )
    ORDER BY conname
  `;
  assert.equal(settlementConstraints.length, 4);

  const settlementIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'transcript_runtime_settlement_room_settled_at_idx'
  `;
  assert.equal(settlementIndexes.length, 1);

  const settlementCommandColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_settlement_command'
    ORDER BY ordinal_position
  `;
  assert.equal(settlementCommandColumns.length, 14);

  const settlementCommandContracts = await sql<{ name: string }[]>`
    SELECT conname AS name
    FROM pg_constraint
    WHERE conname IN (
      'transcript_runtime_settlement_command_pkey',
      'transcript_runtime_settlement_command_command_id_key',
      'transcript_runtime_settlement_command_contract_check',
      'transcript_runtime_settlement_command_lifecycle_version_check',
      'transcript_runtime_settlement_command_writer_generation_check',
      'transcript_runtime_settlement_command_expiry_check',
      'transcript_runtime_settlement_command_state_check',
      'transcript_runtime_settlement_command_terminal_reason_check',
      'transcript_runtime_settlement_command_terminal_shape_check',
      'transcript_runtime_settlement_command_writer_fk'
    )
  `;
  assert.equal(settlementCommandContracts.length, 10);

  const settlementCommandIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'transcript_runtime_settlement_command_pending_expiry_idx',
        'transcript_runtime_settlement_command_writer_idx'
      )
  `;
  assert.equal(settlementCommandIndexes.length, 2);

  const writerColumns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_writer'
    ORDER BY ordinal_position
  `;
  assert.equal(writerColumns.length, 13);

  const writerConstraints = await sql<{ conname: string }[]>`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN (
      'transcript_runtime_writer_contract_check',
      'transcript_runtime_writer_generation_check',
      'transcript_runtime_writer_integrity_state_check',
      'transcript_runtime_writer_pkey',
      'transcript_runtime_writer_progress_boundary_check',
      'transcript_runtime_writer_progress_sequence_check',
      'transcript_runtime_writer_session_id_interview_session_id_fk'
    )
    ORDER BY conname
  `;
  assert.equal(writerConstraints.length, 7);

  const writerIndexes = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'transcript_runtime_writer_session_writer_idx',
        'transcript_runtime_writer_identity_idx',
        'transcript_runtime_writer_room_generation_idx'
      )
    ORDER BY indexname
  `;
  assert.equal(writerIndexes.length, 3);

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
  assert.equal(rls.length, 42);
  assert.ok(rls.every((table) => table.enabled));

  const contactRls = await sql<
    { relname: string; enabled: boolean; forced: boolean }[]
  >`
    SELECT relname, relrowsecurity AS enabled, relforcerowsecurity AS forced
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND relname IN (
        'contact_submission',
        'contact_submission_access_audit',
        'contact_submission_rate_limit'
      )
    ORDER BY relname
  `;
  assert.equal(contactRls.length, 3);
  assert.ok(contactRls.every(({ enabled, forced }) => enabled && forced));

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
        OR (tablename IN (
              'transcript_runtime_writer',
              'transcript_runtime_settlement',
              'transcript_runtime_settlement_command',
              'feedback_generation_stage_attempt'
            ) AND cmd IN ('SELECT', 'INSERT', 'UPDATE', 'ALL')
          AND roles && ARRAY['public', 'anon', 'authenticated']::name[])
      )
  `;
  assert.equal(unsafePolicies[0]?.count, 0);

  const privileges = await sql<
    {
      auth_subscription_update: boolean;
      auth_feedback_insert: boolean;
      auth_transcript_insert: boolean;
      auth_marker_select: boolean;
      auth_marker_insert: boolean;
      service_marker_insert: boolean;
      auth_settlement_select: boolean;
      auth_settlement_insert: boolean;
      service_settlement_insert: boolean;
      auth_settlement_command_select: boolean;
      auth_settlement_command_insert: boolean;
      service_settlement_command_insert: boolean;
      auth_stage_attempt_select: boolean;
      auth_stage_attempt_insert: boolean;
      service_stage_attempt_select: boolean;
      service_stage_attempt_insert: boolean;
      service_stage_attempt_delete: boolean;
      auth_writer_select: boolean;
      auth_writer_insert: boolean;
      service_writer_insert: boolean;
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
      has_table_privilege(
        'authenticated',
        'public.transcript_interruption_marker',
        'SELECT'
      ) AS auth_marker_select,
      has_table_privilege(
        'authenticated',
        'public.transcript_interruption_marker',
        'INSERT'
      ) AS auth_marker_insert,
      has_table_privilege(
        'service_role',
        'public.transcript_interruption_marker',
        'INSERT'
      ) AS service_marker_insert,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_settlement',
        'SELECT'
      ) AS auth_settlement_select,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_settlement',
        'INSERT'
      ) AS auth_settlement_insert,
      has_table_privilege(
        'service_role',
        'public.transcript_runtime_settlement',
        'INSERT'
      ) AS service_settlement_insert,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_settlement_command',
        'SELECT'
      ) AS auth_settlement_command_select,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_settlement_command',
        'INSERT'
      ) AS auth_settlement_command_insert,
      has_table_privilege(
        'service_role',
        'public.transcript_runtime_settlement_command',
        'INSERT'
      ) AS service_settlement_command_insert,
      has_table_privilege(
        'authenticated',
        'public.feedback_generation_stage_attempt',
        'SELECT'
      ) AS auth_stage_attempt_select,
      has_table_privilege(
        'authenticated',
        'public.feedback_generation_stage_attempt',
        'INSERT'
      ) AS auth_stage_attempt_insert,
      has_table_privilege(
        'service_role',
        'public.feedback_generation_stage_attempt',
        'SELECT'
      ) AS service_stage_attempt_select,
      has_table_privilege(
        'service_role',
        'public.feedback_generation_stage_attempt',
        'INSERT'
      ) AS service_stage_attempt_insert,
      has_table_privilege(
        'service_role',
        'public.feedback_generation_stage_attempt',
        'DELETE'
      ) AS service_stage_attempt_delete,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_writer',
        'SELECT'
      ) AS auth_writer_select,
      has_table_privilege(
        'authenticated',
        'public.transcript_runtime_writer',
        'INSERT'
      ) AS auth_writer_insert,
      has_table_privilege(
        'service_role',
        'public.transcript_runtime_writer',
        'INSERT'
      ) AS service_writer_insert,
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
    auth_marker_select: false,
    auth_marker_insert: false,
    service_marker_insert: true,
    auth_settlement_select: false,
    auth_settlement_insert: false,
    service_settlement_insert: true,
    auth_settlement_command_select: false,
    auth_settlement_command_insert: false,
    service_settlement_command_insert: true,
    auth_stage_attempt_select: false,
    auth_stage_attempt_insert: false,
    service_stage_attempt_select: true,
    service_stage_attempt_insert: true,
    service_stage_attempt_delete: true,
    auth_writer_select: false,
    auth_writer_insert: false,
    service_writer_insert: true,
    auth_limiter_execute: false,
    auth_limiter_select: false,
    auth_limiter_insert: false,
    anon_limiter_select: false,
    anon_limiter_insert: false,
    service_limiter_execute: true,
  });

  const serverOwnedBillingPrivileges = await sql<
    { table_name: string; grantee: string; privileges: string[] }[]
  >`
    SELECT table_name, grantee,
      array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (
        'billing_adjustment',
        'billing_payment_state',
        'credit_rollover_lot',
        'credit_rollover_lot_allocation'
      )
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    GROUP BY table_name, grantee
    ORDER BY table_name, grantee
  `;
  assert.deepEqual(
    serverOwnedBillingPrivileges.map((grant) => ({ ...grant })),
    [
      "billing_adjustment",
      "billing_payment_state",
      "credit_rollover_lot",
      "credit_rollover_lot_allocation",
    ].map((table_name) => ({
      table_name,
      grantee: "service_role",
      privileges: [
        "DELETE",
        "INSERT",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE",
      ],
    }))
  );

  const contactTableGrants = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (
        'contact_submission',
        'contact_submission_access_audit',
        'contact_submission_rate_limit'
      )
      AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
  `;
  assert.equal(contactTableGrants[0]?.count, 0);

  const contactFunctionPrivileges = await sql<
    {
      proname: string;
      security_definer: boolean;
      config: string[];
      anon_execute: boolean;
      authenticated_execute: boolean;
      service_execute: boolean;
      contact_triage_execute: boolean;
    }[]
  >`
    SELECT p.proname,
      p.prosecdef AS security_definer,
      p.proconfig AS config,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE')
        AS service_execute,
      has_function_privilege('meelni_contact_triage', p.oid, 'EXECUTE')
        AS contact_triage_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'consume_contact_submission_rate_limit',
        'cleanup_contact_submission_rate_limits',
        'list_contact_submissions',
        'read_contact_submission',
        'set_contact_submission_triage_state'
      )
    ORDER BY p.proname
  `;
  assert.equal(contactFunctionPrivileges.length, 5);
  for (const privilege of contactFunctionPrivileges) {
    const runtimeFunction = [
      "cleanup_contact_submission_rate_limits",
      "consume_contact_submission_rate_limit",
    ].includes(privilege.proname);
    assert.equal(privilege.security_definer, true);
    assert.ok(privilege.config.includes('search_path=""'));
    assert.equal(privilege.anon_execute, false);
    assert.equal(privilege.authenticated_execute, false);
    assert.equal(privilege.service_execute, runtimeFunction);
    assert.equal(privilege.contact_triage_execute, !runtimeFunction);
  }

  const [contactTriageRole] = await sql<
    {
      rolname: string;
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolcanlogin: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      anon_member: boolean;
      authenticated_member: boolean;
      service_member: boolean;
      authenticator_member: boolean;
    }[]
  >`
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
      rolcanlogin, rolreplication, rolbypassrls,
      pg_has_role('anon', oid, 'MEMBER') AS anon_member,
      pg_has_role('authenticated', oid, 'MEMBER') AS authenticated_member,
      pg_has_role('service_role', oid, 'MEMBER') AS service_member,
      CASE
        WHEN to_regrole('authenticator') IS NULL THEN false
        ELSE pg_has_role('authenticator', oid, 'MEMBER')
      END AS authenticator_member
    FROM pg_catalog.pg_roles
    WHERE rolname = 'meelni_contact_triage'
  `;
  assert.deepEqual(contactTriageRole, {
    rolname: CONTACT_TRIAGE_ROLE,
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: false,
    rolreplication: false,
    rolbypassrls: false,
    anon_member: false,
    authenticated_member: false,
    service_member: false,
    authenticator_member: false,
  });

  const [contactTriageGrants] = await sql<
    {
      schema_usage: boolean;
      submission_select: boolean;
      submission_insert: boolean;
      submission_update: boolean;
      audit_select: boolean;
      audit_insert: boolean;
      limiter_select: boolean;
      limiter_update: boolean;
    }[]
  >`
    SELECT
      has_schema_privilege(
        'meelni_contact_triage', 'public', 'USAGE'
      ) AS schema_usage,
      has_table_privilege(
        'meelni_contact_triage', 'public.contact_submission', 'SELECT'
      ) AS submission_select,
      has_table_privilege(
        'meelni_contact_triage', 'public.contact_submission', 'INSERT'
      ) AS submission_insert,
      has_table_privilege(
        'meelni_contact_triage', 'public.contact_submission', 'UPDATE'
      ) AS submission_update,
      has_table_privilege(
        'meelni_contact_triage',
        'public.contact_submission_access_audit', 'SELECT'
      ) AS audit_select,
      has_table_privilege(
        'meelni_contact_triage',
        'public.contact_submission_access_audit', 'INSERT'
      ) AS audit_insert,
      has_table_privilege(
        'meelni_contact_triage', 'public.contact_submission_rate_limit',
        'SELECT'
      ) AS limiter_select,
      has_table_privilege(
        'meelni_contact_triage', 'public.contact_submission_rate_limit',
        'UPDATE'
      ) AS limiter_update
  `;
  assert.deepEqual(contactTriageGrants, {
    schema_usage: true,
    submission_select: false,
    submission_insert: false,
    submission_update: false,
    audit_select: false,
    audit_insert: false,
    limiter_select: false,
    limiter_update: false,
  });
}

async function verifyFeedbackV2VersionTuple(sql: postgres.Sql) {
  let [legacy] = await sql<{ id: string; rubric_version: string }[]>`
    SELECT id, rubric_version
    FROM feedback
    WHERE schema_version IS NULL
    LIMIT 1
  `;
  if (!legacy) {
    [legacy] = await sql<{ id: string; rubric_version: string }[]>`
      INSERT INTO feedback (session_id, status, rubric_version)
      SELECT interview_session.id, 'pending', '1.0.0'
      FROM interview_session
      LEFT JOIN feedback ON feedback.session_id = interview_session.id
      WHERE feedback.id IS NULL
      LIMIT 1
      RETURNING feedback.id, feedback.rubric_version
    `;
  }
  assert.ok(legacy, "expected a legacy-compatible feedback row");
  assert.equal(legacy.rubric_version, "1.0.0");

  const [legacyBefore] = await sql<
    {
      schema_version: string | null;
      prompt_version: string | null;
      model_version: string | null;
      evaluation_state: string | null;
      structure_score: number | null;
      clarity_score: number | null;
      insight_score: number | null;
      communication_score: number | null;
      leadership_score: number | null;
      overall_score: string | null;
      feedback_mode: string | null;
      feedback_round_type: string | null;
      dimension_coverage: unknown;
      verified_prefix_scope: unknown;
    }[]
  >`
    SELECT schema_version, prompt_version, model_version, evaluation_state,
      structure_score, clarity_score, insight_score, communication_score,
      leadership_score, overall_score, feedback_mode, feedback_round_type,
      dimension_coverage, verified_prefix_scope
    FROM feedback
    WHERE id = ${legacy.id}::uuid
  `;
  assert.equal(legacyBefore?.schema_version, null);
  assert.equal(legacyBefore?.prompt_version, null);
  assert.equal(legacyBefore?.model_version, null);
  assert.equal(legacyBefore?.evaluation_state, null);
  assert.equal(legacyBefore?.feedback_mode, null);
  assert.equal(legacyBefore?.feedback_round_type, null);
  assert.equal(legacyBefore?.dimension_coverage, null);
  assert.equal(legacyBefore?.verified_prefix_scope, null);

  const verifiedPrefixScope = {
    contractVersion: "feedback.verified-prefix-scope.v1",
    projectionVersion: "trusted-answer-block-projection.v1",
    trustedBlockIdentities: [
      {
        contractVersion: "trusted-answer-block.v1",
        answerBlockId: "answer-block:0001",
        identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
      },
    ],
    excludedTailBlockCount: 0,
  };

  await sql.begin(async (tx) => {
    await assert.rejects(
      tx.savepoint("null_schema_dimension_corruption", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET feedback_mode = 'partial_scorecard',
              feedback_round_type = 'product_sense',
              dimension_coverage = '{}'::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_dimension_coverage_tuple_check/
    );
    await assert.rejects(
      tx.savepoint("retired_evidence_limited_v1", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET schema_version = 'feedback.evidence-limited.v1',
              prompt_version = 'feedback.prompt.evidence-limited.v1',
              model_version = 'fixture-model-v1',
              rubric_version = 'pm-feedback-rubric.v2',
              evaluation_state = 'partial'
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_version_tuple_check/
    );
    await tx`
      UPDATE feedback
      SET schema_version = 'feedback.evidence-limited.v2',
          prompt_version = 'feedback.prompt.evidence-limited.v2',
          model_version = 'fixture-model-v1',
          rubric_version = 'pm-feedback-rubric.v2',
          evaluation_state = 'partial'
      WHERE id = ${legacy.id}::uuid
    `;
    await assert.rejects(
      tx.savepoint("invalid_evidence_limited_full", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET evaluation_state = 'full'
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_version_tuple_check/
    );
    await tx`
      UPDATE feedback
      SET schema_version = 'feedback.v2',
          prompt_version = 'feedback.prompt.v2',
          evaluation_state = 'full'
      WHERE id = ${legacy.id}::uuid
    `;
    await tx`
      UPDATE feedback
      SET evaluation_state = 'partial'
      WHERE id = ${legacy.id}::uuid
    `;
    await assert.rejects(
      tx.savepoint("invalid_feedback_v2_tuple", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET prompt_version = 'feedback.prompt.evidence-limited.v2'
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_version_tuple_check/
    );
    await assert.rejects(
      tx.savepoint("invalid_feedback_outcome", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET outcome_reason = 'duration_too_short'
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_outcome_reason_check/
    );
    await tx`
      UPDATE feedback
      SET schema_version = 'feedback.dimension-coverage.v2',
          prompt_version = 'feedback.prompt.dimension-coverage.v1',
          model_version = 'verified-prefix-migration-test',
          rubric_version = 'pm-feedback-rubric.v3',
          evaluation_state = 'partial',
          feedback_mode = 'partial_scorecard',
          feedback_round_type = 'product_sense',
          dimension_coverage = '{"structure":{"score":8,"coverage":"sufficient","evidence":[]}}'::jsonb,
          verified_prefix_scope = ${JSON.stringify(verifiedPrefixScope)}::jsonb,
          overall_score = NULL
      WHERE id = ${legacy.id}::uuid
    `;
    const [verifiedPrefixRow] = await tx<
      {
        schema_version: string;
        overall_score: string | null;
        verified_prefix_scope: unknown;
      }[]
    >`
      SELECT schema_version, overall_score, verified_prefix_scope
      FROM feedback
      WHERE id = ${legacy.id}::uuid
    `;
    assert.deepEqual(verifiedPrefixRow, {
      schema_version: "feedback.dimension-coverage.v2",
      overall_score: null,
      verified_prefix_scope: verifiedPrefixScope,
    });
    await assert.rejects(
      tx.savepoint("verified_prefix_scope_required", async (savepoint) => {
        await savepoint`
          UPDATE feedback SET verified_prefix_scope = NULL
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_verified_prefix_scope_tuple_check/
    );
    for (const key of [
      "contractVersion",
      "projectionVersion",
      "trustedBlockIdentities",
      "excludedTailBlockCount",
    ]) {
      const missing = {
        ...verifiedPrefixScope,
      } as unknown as Record<string, unknown>;
      delete missing[key];
      await assert.rejects(
        tx.savepoint(`verified_prefix_missing_${key}`, async (savepoint) => {
          await savepoint`
            UPDATE feedback
            SET verified_prefix_scope = ${JSON.stringify(missing)}::jsonb
            WHERE id = ${legacy.id}::uuid
          `;
        }),
        /feedback_verified_prefix_scope_tuple_check/
      );
    }
    await assert.rejects(
      tx.savepoint("verified_prefix_scope_forged", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET verified_prefix_scope = ${JSON.stringify({
            ...verifiedPrefixScope,
            trustedBlockIdentities: [],
          })}::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_verified_prefix_scope_tuple_check/
    );
    await assert.rejects(
      tx.savepoint(
        "verified_prefix_identity_count_over_cap",
        async (savepoint) => {
          await savepoint`
          UPDATE feedback
          SET verified_prefix_scope = ${JSON.stringify({
            ...verifiedPrefixScope,
            trustedBlockIdentities: Array.from(
              { length: 1_001 },
              () => verifiedPrefixScope.trustedBlockIdentities[0]
            ),
          })}::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
        }
      ),
      /feedback_verified_prefix_scope_tuple_check/
    );
    for (const excludedTailBlockCount of [-1, 1.5, 1_001]) {
      await assert.rejects(
        tx.savepoint(
          `verified_prefix_excluded_count_${String(excludedTailBlockCount).replace(".", "_")}`,
          async (savepoint) => {
            await savepoint`
              UPDATE feedback
              SET verified_prefix_scope = ${JSON.stringify({
                ...verifiedPrefixScope,
                excludedTailBlockCount,
              })}::jsonb
              WHERE id = ${legacy.id}::uuid
            `;
          }
        ),
        /feedback_verified_prefix_scope_tuple_check/
      );
    }
    await assert.rejects(
      tx.savepoint("verified_prefix_scope_extra_key", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET verified_prefix_scope = ${JSON.stringify({
            ...verifiedPrefixScope,
            untrustedTailText: "must not persist",
          })}::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_verified_prefix_scope_tuple_check/
    );
    await assert.rejects(
      tx.savepoint("verified_prefix_scope_storage_cap", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET verified_prefix_scope = ${JSON.stringify({
            ...verifiedPrefixScope,
            trustedBlockIdentities: [
              {
                ...verifiedPrefixScope.trustedBlockIdentities[0],
                identity: `trusted-answer-block.v1:${"a".repeat(128_000)}`,
              },
            ],
          })}::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_verified_prefix_scope_tuple_check/
    );
    await assert.rejects(
      tx.savepoint(
        "historical_partial_overall_forbidden",
        async (savepoint) => {
          await savepoint`
          UPDATE feedback SET overall_score = 8
          WHERE id = ${legacy.id}::uuid
        `;
        }
      ),
      /feedback_dimension_coverage_score_tuple_check/
    );
    await tx`
      UPDATE feedback
      SET evaluation_state = 'full',
          feedback_mode = 'full_scorecard',
          dimension_coverage = ${JSON.stringify({
            structure: { score: 8, coverage: "sufficient", evidence: [] },
            clarity: { score: 7, coverage: "sufficient", evidence: [] },
            insight: { score: 9, coverage: "sufficient", evidence: [] },
            communication: {
              score: 8,
              coverage: "sufficient",
              evidence: [],
            },
            leadership: { score: 7, coverage: "sufficient", evidence: [] },
          })}::jsonb,
          structure_score = 8,
          clarity_score = 7,
          insight_score = 9,
          communication_score = 8,
          leadership_score = 7,
          overall_score = 7.9
      WHERE id = ${legacy.id}::uuid
    `;
    const [completeVerifiedPrefixScorecard] = await tx<
      {
        feedback_mode: string;
        evaluation_state: string;
        overall_score: string;
      }[]
    >`
      SELECT feedback_mode, evaluation_state, overall_score
      FROM feedback
      WHERE id = ${legacy.id}::uuid
    `;
    assert.deepEqual(completeVerifiedPrefixScorecard, {
      feedback_mode: "full_scorecard",
      evaluation_state: "full",
      overall_score: "7.9",
    });
    await assert.rejects(
      tx.savepoint("scorecard_dimension_required", async (savepoint) => {
        await savepoint`
          UPDATE feedback SET clarity_score = NULL
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_dimension_coverage_score_tuple_check/
    );
    await assert.rejects(
      tx.savepoint("scorecard_excluded_tail_forbidden", async (savepoint) => {
        await savepoint`
          UPDATE feedback
          SET verified_prefix_scope = ${JSON.stringify({
            ...verifiedPrefixScope,
            excludedTailBlockCount: 1,
          })}::jsonb
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_verified_prefix_scope_tuple_check/
    );
    await tx`
      UPDATE feedback
      SET evaluation_state = 'partial',
          feedback_mode = 'coaching_review',
          structure_score = NULL,
          clarity_score = NULL,
          insight_score = NULL,
          communication_score = NULL,
          leadership_score = NULL,
          overall_score = NULL
      WHERE id = ${legacy.id}::uuid
    `;
    await assert.rejects(
      tx.savepoint("coaching_scores_forbidden", async (savepoint) => {
        await savepoint`
          UPDATE feedback SET structure_score = 8
          WHERE id = ${legacy.id}::uuid
        `;
      }),
      /feedback_dimension_coverage_score_tuple_check/
    );
    await tx`
      UPDATE feedback
      SET schema_version = NULL,
          prompt_version = NULL,
          model_version = NULL,
          rubric_version = '1.0.0',
          evaluation_state = NULL,
          feedback_mode = NULL,
          feedback_round_type = NULL,
          dimension_coverage = NULL,
          verified_prefix_scope = NULL,
          structure_score = ${legacyBefore!.structure_score},
          clarity_score = ${legacyBefore!.clarity_score},
          insight_score = ${legacyBefore!.insight_score},
          communication_score = ${legacyBefore!.communication_score},
          leadership_score = ${legacyBefore!.leadership_score},
          overall_score = ${legacyBefore!.overall_score}
      WHERE id = ${legacy.id}::uuid
    `;
  });

  const [legacyAfter] = await sql<
    {
      schema_version: string | null;
      prompt_version: string | null;
      model_version: string | null;
      evaluation_state: string | null;
      rubric_version: string;
      structure_score: number | null;
      clarity_score: number | null;
      insight_score: number | null;
      communication_score: number | null;
      leadership_score: number | null;
      overall_score: string | null;
      feedback_mode: string | null;
      feedback_round_type: string | null;
      dimension_coverage: unknown;
      verified_prefix_scope: unknown;
    }[]
  >`
    SELECT schema_version, prompt_version, model_version, evaluation_state,
      rubric_version, structure_score, clarity_score, insight_score,
      communication_score, leadership_score, overall_score, feedback_mode,
      feedback_round_type, dimension_coverage, verified_prefix_scope
    FROM feedback
    WHERE id = ${legacy.id}::uuid
  `;
  assert.deepEqual(legacyAfter, {
    schema_version: null,
    prompt_version: null,
    model_version: null,
    evaluation_state: null,
    rubric_version: "1.0.0",
    structure_score: legacyBefore!.structure_score,
    clarity_score: legacyBefore!.clarity_score,
    insight_score: legacyBefore!.insight_score,
    communication_score: legacyBefore!.communication_score,
    leadership_score: legacyBefore!.leadership_score,
    overall_score: legacyBefore!.overall_score,
    feedback_mode: null,
    feedback_round_type: null,
    dimension_coverage: null,
    verified_prefix_scope: null,
  });
}

async function verifyFeedbackProductionDatabaseLifecycle(
  sql: postgres.Sql,
  databaseUrl: string
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    core,
    fixtures,
    { finalizeInterviewSession },
    { createDrizzleFeedbackDispatchStore },
    { createDrizzleFeedbackGenerationStore },
    {
      createDrizzleTranscriptIngestStore,
      createDrizzleTranscriptInterruptionMarkerStore,
      createDrizzleTranscriptRuntimeSettlementStore,
      createDrizzleTranscriptRuntimeWriterStore,
      getFeedbackEvidenceTurns,
      getFrozenFeedbackEvaluationEvidence,
      getFrozenFeedbackTranscriptTurns,
    },
    { getFeedbackBySessionId, hasValidFeedbackLifecycleFields },
    { getSessionById },
    { runFeedbackGenerationRequested },
    {
      buildCompletedFeedbackLifecycleResponse,
      buildDispatchFailedFeedbackLifecycleResponse,
      buildSkippedFeedbackLifecycleResponse,
    },
    { dispatchFeedbackGenerationWorkflow },
    { failFeedbackGenerationWorkflow },
    { ingestTranscriptEvent },
    { ingestTranscriptInterruptionMarker },
    { ingestTranscriptRuntimeSettlement },
    { ingestTranscriptRuntimeWriter },
    { prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot },
    schema,
  ] = await Promise.all([
    import("@meelni/core"),
    import("@meelni/test-fixtures"),
    import("../lib/db/end-interview-session"),
    import("../lib/db/feedback-dispatch"),
    import("../lib/db/feedback-generation-state"),
    import("../lib/db/transcripts"),
    import("../lib/db/feedback"),
    import("../lib/db/sessions"),
    import("../lib/inngest/functions/generate-feedback"),
    import("../lib/feedback-lifecycle-response"),
    import("../lib/workflows/dispatch-feedback-generation"),
    import("../lib/workflows/generate-feedback"),
    import("../lib/workflows/ingest-transcript-event"),
    import("../lib/workflows/ingest-transcript-interruption-marker"),
    import("../lib/workflows/ingest-transcript-runtime-settlement"),
    import("../lib/workflows/ingest-transcript-runtime-writer"),
    import("../lib/evaluation/session-validator"),
    import("../lib/db/schema"),
  ]);
  const database = drizzle(sql, { schema });
  const goldenFixtures = fixtures.createFeedbackGoldenPathFixtures();
  const shortRich = goldenFixtures.find(
    (fixture) => fixture.id === "short-rich"
  );
  const normalProductSense = goldenFixtures.find(
    (fixture) => fixture.id === "normal-product-sense"
  );
  const collision = goldenFixtures.find(
    (fixture) => fixture.id === "turn-marker-6m14"
  );
  const dispatchFailureFixture = goldenFixtures.find(
    (fixture) => fixture.id === "rubric-behavioral"
  );
  assert.ok(shortRich);
  assert.ok(normalProductSense);
  assert.ok(collision);
  assert.ok(dispatchFailureFixture);

  await sql`
    INSERT INTO app_user (id, email)
    VALUES (${shortRich.userId}::uuid, 'sav-397-golden@example.invalid')
    ON CONFLICT (id) DO NOTHING
  `;

  const seedSession = async (fixture: typeof shortRich) => {
    const durationMinutes =
      Math.ceil(
        (Date.parse(fixture.settlement.settled_at) -
          Date.parse(fixture.writerRegistration.registered_at)) /
          60_000
      ) + 1;
    await sql`
      INSERT INTO interview_session (
        id, user_id, role, round_type, mode, status, lifecycle_state,
        lifecycle_version, activated_at, started_at, livekit_room_name, config
      ) VALUES (
        ${fixture.sessionId}::uuid,
        ${fixture.userId}::uuid,
        'pm',
        ${fixture.roundType},
        'voice_video',
        'in_progress',
        'active',
        1,
        ${fixture.writerRegistration.registered_at}::timestamptz,
        ${fixture.writerRegistration.registered_at}::timestamptz,
        ${fixture.roomName},
        ${JSON.stringify({ duration: durationMinutes })}::jsonb
      )
    `;
  };

  const ingestFixture = async (fixture: typeof shortRich) => {
    const writerStore = createDrizzleTranscriptRuntimeWriterStore(database);
    const transcriptStore = createDrizzleTranscriptIngestStore(database);
    const markerStore =
      createDrizzleTranscriptInterruptionMarkerStore(database);
    const settlementStore =
      createDrizzleTranscriptRuntimeSettlementStore(database);

    const registration = await ingestTranscriptRuntimeWriter({
      requestSessionId: fixture.sessionId,
      registration: fixture.writerRegistration,
      store: writerStore,
    });
    assert.equal(registration.ok && registration.disposition, "created");
    const registrationReplay = await ingestTranscriptRuntimeWriter({
      requestSessionId: fixture.sessionId,
      registration: fixture.writerRegistration,
      store: writerStore,
    });
    assert.equal(
      registrationReplay.ok && registrationReplay.disposition,
      "existing"
    );

    for (const event of [...fixture.events].reverse()) {
      const result = await ingestTranscriptEvent({
        requestSessionId: fixture.sessionId,
        principal: { kind: "voice_runtime" },
        event,
        store: transcriptStore,
      });
      assert.equal(result.ok, true, `${fixture.id}:${event.event_id}`);
    }
    const eventReplay = await ingestTranscriptEvent({
      requestSessionId: fixture.sessionId,
      principal: { kind: "voice_runtime" },
      event: fixture.events[0],
      store: transcriptStore,
    });
    assert.equal(eventReplay.ok && eventReplay.disposition, "existing");

    for (const marker of fixture.markers) {
      const markerResult = await ingestTranscriptInterruptionMarker({
        requestSessionId: fixture.sessionId,
        marker,
        store: markerStore,
      });
      assert.equal(markerResult.ok, true, `${fixture.id}:${marker.event_id}`);
      const markerReplay = await ingestTranscriptInterruptionMarker({
        requestSessionId: fixture.sessionId,
        marker,
        store: markerStore,
      });
      assert.equal(markerReplay.ok && markerReplay.disposition, "existing");
    }

    const settlementResult = await ingestTranscriptRuntimeSettlement({
      requestSessionId: fixture.sessionId,
      settlement: fixture.settlement,
      store: settlementStore,
    });
    assert.equal(settlementResult.ok, true, fixture.id);
    const settlementReplay = await ingestTranscriptRuntimeSettlement({
      requestSessionId: fixture.sessionId,
      settlement: fixture.settlement,
      store: settlementStore,
    });
    assert.equal(
      settlementReplay.ok && settlementReplay.disposition,
      "existing"
    );
  };

  await seedSession(shortRich);
  await ingestFixture(shortRich);
  const finalizedAt = new Date(
    Date.parse(shortRich.settlement.settled_at) + 1_000
  );
  const completion = await finalizeInterviewSession(
    {
      sessionId: shortRich.sessionId,
      actor: { type: "user", userId: shortRich.userId },
      requestedTerminalReason: "user_end",
      now: finalizedAt,
    },
    database
  );
  assert.equal(completion.ok && completion.disposition, "applied");
  assert.ok(completion.ok);
  assert.equal(completion.feedback.status, "pending");
  assert.equal(completion.feedback.dispatchStatus, "pending");
  assert.equal(
    completion.feedback.dispatchEventId,
    `feedback/generate.requested:${shortRich.sessionId}:0`
  );

  const duplicateCompletion = await finalizeInterviewSession(
    {
      sessionId: shortRich.sessionId,
      actor: { type: "user", userId: shortRich.userId },
      requestedTerminalReason: "user_end",
      now: new Date(finalizedAt.getTime() + 1_000),
    },
    database
  );
  assert.equal(
    duplicateCompletion.ok && duplicateCompletion.disposition,
    "existing"
  );
  assert.ok(duplicateCompletion.ok);
  assert.equal(duplicateCompletion.feedback.id, completion.feedback.id);
  assert.deepEqual(duplicateCompletion.stats, completion.stats);

  const frozenTranscript = await getFrozenFeedbackTranscriptTurns(
    shortRich.sessionId,
    database
  );
  assert.equal(frozenTranscript.length, shortRich.events.length);
  assert.deepEqual(
    frozenTranscript.map((turn) => turn.eventId),
    shortRich.events.map((event) => event.event_id)
  );

  const sentEvents: Array<{
    id: string;
    name: string;
    data: { sessionId: string; userId: string; tier: string };
  }> = [];
  const dispatchStore = createDrizzleFeedbackDispatchStore(database);
  const dispatchDeps = {
    store: dispatchStore,
    now: () => new Date(finalizedAt.getTime() + 2_000),
    reportFailure: () => assert.fail("golden dispatch must not fail"),
    async send(event: (typeof sentEvents)[number]) {
      sentEvents.push(event);
    },
  };
  const dispatch = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: shortRich.sessionId,
      userId: shortRich.userId,
      tier: completion.tier,
    },
    dispatchDeps
  );
  assert.equal(dispatch.ok && dispatch.disposition, "sent");
  assert.ok(dispatch.dispatch?.eventId);
  assert.equal(sentEvents.length, 1);
  assert.equal(sentEvents[0]?.id, dispatch.dispatch.eventId);
  const duplicateDispatch = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: shortRich.sessionId,
      userId: shortRich.userId,
      tier: completion.tier,
    },
    dispatchDeps
  );
  assert.equal(
    duplicateDispatch.ok && duplicateDispatch.disposition,
    "already_sent"
  );
  assert.equal(sentEvents.length, 1);

  const eventId = dispatch.dispatch.eventId;
  const [generationClock] = await sql<
    { current_timestamp: Date | string }[]
  >`SELECT CURRENT_TIMESTAMP`;
  assert.ok(generationClock);
  const generationRequestedAt = databaseTimestamp(
    generationClock.current_timestamp
  );
  const generationStore = createDrizzleFeedbackGenerationStore(database);
  const insightsEvents: unknown[] = [];
  let evaluatorCalls = 0;
  const steps = {
    run<T>(_name: string, work: () => Promise<T>): Promise<T> {
      return work();
    },
    async sleep() {},
    async sendInsights(event: unknown) {
      insightsEvents.push(event);
    },
  };
  const handlerDeps = {
    now: () => generationRequestedAt.getTime(),
    createWorkflowDeps: (handlerSteps: typeof steps) => ({
      store: generationStore,
      steps: handlerSteps,
      now: () => generationRequestedAt,
      isDeletionPending: async () => false,
      reportAttempt: () => undefined,
      async getSession(sessionId: string) {
        const session = await getSessionById(sessionId, database);
        return session
          ? {
              userId: session.userId,
              roundType: session.roundType,
              endingAtMs: session.endingAt?.getTime() ?? null,
            }
          : null;
      },
      validateLegacy: async () => {
        throw new Error("database_golden_must_use_committed_completion_tier");
      },
      async getAnswerBlockEvidence(sessionId: string) {
        const evidence = await getFrozenFeedbackEvaluationEvidence(
          sessionId,
          database
        );
        return {
          ...prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence),
          snapshotState: evidence.snapshotState,
        };
      },
      async evaluate(input: {
        roundType: "product_sense" | "behavioral" | "execution" | "strategy";
        answerBlocks: readonly import("@meelni/core").CandidateAnswerBlock[];
        allowNumericalScores: boolean;
      }) {
        evaluatorCalls += 1;
        assert.equal(input.roundType, "product_sense");
        assert.equal(input.allowNumericalScores, true);
        const answerBlockRef = input.answerBlocks[0]?.answerBlockId;
        assert.ok(answerBlockRef);
        const dimensions = Object.fromEntries(
          core.FEEDBACK_DIMENSIONS.map((dimension) => {
            const facets =
              core.ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[dimension]
                .facets;
            return [
              dimension,
              dimension === "structure"
                ? {
                    score: 7,
                    evidence: facets.map((facet) => ({
                      facetCode: facet.code,
                      answerBlockRef,
                    })),
                  }
                : { score: null, evidence: [] },
            ];
          })
        );
        return core.parseDimensionCoverageProviderSelection(
          {
            schemaVersion:
              core.FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
            promptVersion: core.FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
            rubricVersion: core.FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
            roundType: "product_sense",
            dimensions,
          },
          {
            roundType: "product_sense",
            answerBlocks: input.answerBlocks,
            modelVersion: "fake-dimension-evaluator-v1",
            allowNumericalScores: true,
          }
        );
      },
    }),
    reportResult() {},
  };
  const generated = await runFeedbackGenerationRequested({
    eventId,
    requestedAtMs: generationRequestedAt.getTime(),
    data: { sessionId: shortRich.sessionId, userId: shortRich.userId },
    steps,
    deps: handlerDeps,
  });
  assert.equal(generated.status, "completed");
  assert.equal(generated.disposition, "applied");
  assert.equal(evaluatorCalls, 1);
  assert.equal(insightsEvents.length, 1);

  const duplicateRun = await runFeedbackGenerationRequested({
    eventId,
    requestedAtMs: generationRequestedAt.getTime(),
    data: { sessionId: shortRich.sessionId, userId: shortRich.userId },
    steps,
    deps: handlerDeps,
  });
  assert.equal(duplicateRun.status, "completed");
  assert.equal(duplicateRun.disposition, "already_terminal");
  assert.equal(evaluatorCalls, 1);

  const persistedBeforeLateFailure = await getFeedbackBySessionId(
    shortRich.sessionId,
    database
  );
  assert.ok(persistedBeforeLateFailure);
  assert.equal(
    hasValidFeedbackLifecycleFields(persistedBeforeLateFailure),
    true
  );
  assert.equal(persistedBeforeLateFailure.status, "completed");
  assert.equal(persistedBeforeLateFailure.outcomeReason, "feedback_generated");
  assert.equal(persistedBeforeLateFailure.evaluationState, "partial");
  assert.equal(persistedBeforeLateFailure.overallScore, null);
  assert.equal(persistedBeforeLateFailure.feedbackMode, "coaching_review");
  assert.equal(persistedBeforeLateFailure.feedbackRoundType, "product_sense");
  assert.equal(
    (
      persistedBeforeLateFailure.dimensionCoverage as {
        structure?: { coverage?: string; score?: number | null };
        clarity?: { coverage?: string; score?: number | null };
      }
    ).structure?.coverage,
    "sufficient"
  );
  assert.equal(
    (
      persistedBeforeLateFailure.dimensionCoverage as {
        structure?: { score?: number | null };
      }
    ).structure?.score,
    null
  );
  assert.equal(
    (
      persistedBeforeLateFailure.dimensionCoverage as {
        clarity?: { coverage?: string; score?: number | null };
      }
    ).clarity?.coverage,
    "absent"
  );
  assert.equal(
    await failFeedbackGenerationWorkflow(
      {
        sessionId: shortRich.sessionId,
        userId: shortRich.userId,
        eventId,
        reason: "late_provider_failure",
      },
      {
        store: generationStore,
        isDeletionPending: async () => false,
        async getSession(sessionId: string) {
          const session = await getSessionById(sessionId, database);
          return session
            ? { userId: session.userId, roundType: session.roundType }
            : null;
        },
      }
    ),
    false
  );
  const persistedAfterLateFailure = await getFeedbackBySessionId(
    shortRich.sessionId,
    database
  );
  assert.deepEqual(persistedAfterLateFailure, persistedBeforeLateFailure);

  const evidenceTurns = await getFeedbackEvidenceTurns(
    shortRich.sessionId,
    database
  );
  const persistedEvidence = await getFrozenFeedbackEvaluationEvidence(
    shortRich.sessionId,
    database
  );
  const persistedAnswerBlocks =
    prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(
      persistedEvidence
    ).blocks;
  const apiPayload = buildCompletedFeedbackLifecycleResponse(
    persistedAfterLateFailure,
    evidenceTurns,
    persistedAnswerBlocks,
    "product_sense",
    persistedEvidence.snapshotState ?? undefined
  );
  assert.equal(apiPayload.feedback.kind, "dimension-coverage");
  if (apiPayload.feedback.kind === "dimension-coverage") {
    assert.equal(apiPayload.feedback.outcome, "coaching_review");
    assert.equal("scores" in apiPayload.feedback, false);
    assert.equal("score" in apiPayload.feedback.dimensions.structure, false);
    assert.equal("score" in apiPayload.feedback.dimensions.clarity, false);
  }
  const decoded = core.decodeFeedbackLifecycleResponse(apiPayload);
  assert.ok(decoded);
  const view = core.toFeedbackViewState(decoded);
  assert.equal(view.kind, "completed-coaching-review");
  if (
    view.kind !== "completed-coaching-review" ||
    view.feedback.kind !== "dimension-coverage"
  ) {
    throw new Error("database golden path lost coaching review view state");
  }
  assert.equal(view.feedback.dimensions.structure.coverage, "sufficient");
  assert.equal("score" in view.feedback.dimensions.structure, false);
  assert.equal(view.feedback.dimensions.structure.evidence.length, 2);
  assert.equal(
    view.feedback.dimensions.structure.evidence[0]?.citation,
    persistedAnswerBlocks[0]?.responseText
  );

  await seedSession(normalProductSense);
  await ingestFixture(normalProductSense);
  const duplicateIdentityFinalizedAt = new Date(
    Date.parse(normalProductSense.settlement.settled_at) + 1_000
  );
  const duplicateIdentityCompletion = await finalizeInterviewSession(
    {
      sessionId: normalProductSense.sessionId,
      actor: { type: "user", userId: normalProductSense.userId },
      requestedTerminalReason: "user_end",
      now: duplicateIdentityFinalizedAt,
    },
    database
  );
  assert.ok(duplicateIdentityCompletion.ok);
  assert.equal(duplicateIdentityCompletion.feedback.status, "pending");
  assert.ok(duplicateIdentityCompletion.feedback.dispatchEventId);
  const duplicateIdentityEventId =
    duplicateIdentityCompletion.feedback.dispatchEventId;
  const duplicateIdentityClaim = await generationStore.claim({
    sessionId: normalProductSense.sessionId,
    eventId: duplicateIdentityEventId,
    now: new Date(duplicateIdentityFinalizedAt.getTime() + 1_000),
  });
  assert.ok(duplicateIdentityClaim);
  const duplicateIdentityTurns = (
    await getFrozenFeedbackTranscriptTurns(
      normalProductSense.sessionId,
      database
    )
  ).filter((turn) => turn.speaker === "user");
  assert.ok(duplicateIdentityTurns.length >= 2);
  const firstDuplicateIdentityTurn = duplicateIdentityTurns[0]!;
  const secondDuplicateIdentityTurn = duplicateIdentityTurns[1]!;
  assert.ok(firstDuplicateIdentityTurn.eventId);
  assert.ok(firstDuplicateIdentityTurn.text);
  assert.ok(secondDuplicateIdentityTurn.eventId);
  assert.ok(secondDuplicateIdentityTurn.text);
  const baselineEvidenceLimited = core.parseEvidenceLimitedFeedback(
    {
      schemaVersion: core.FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
      promptVersion: core.FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
      rubricVersion: core.FEEDBACK_RUBRIC_VERSION,
      evaluationState: "partial",
      strengths: [
        {
          signalCode: "customer_problem_connection",
          actionCode: "connect_customer_to_decision",
          transcriptRef: firstDuplicateIdentityTurn.eventId,
        },
      ],
      improvements: [
        {
          signalCode: "tradeoff_decision",
          actionCode: "compare_tradeoffs_and_choose",
          transcriptRef: firstDuplicateIdentityTurn.eventId,
        },
      ],
    },
    {
      transcript: duplicateIdentityTurns.map((turn) => {
        assert.ok(turn.eventId);
        assert.ok(turn.text);
        return {
          eventId: turn.eventId,
          speaker: "user" as const,
          text: turn.text,
        };
      }),
      modelVersion: "fake-evidence-limited-v2",
    }
  );
  const firstStrength = {
    ...structuredClone(baselineEvidenceLimited.strengths[0]!),
    transcriptRefs: [firstDuplicateIdentityTurn.eventId],
    evidence: [
      {
        turnRef: firstDuplicateIdentityTurn.eventId,
        quote: firstDuplicateIdentityTurn.text,
      },
    ],
  };
  const duplicatePersistedSelection = {
    schemaVersion: baselineEvidenceLimited.schemaVersion,
    promptVersion: baselineEvidenceLimited.promptVersion,
    modelVersion: baselineEvidenceLimited.modelVersion,
    rubricVersion: baselineEvidenceLimited.rubricVersion,
    evaluationState: baselineEvidenceLimited.evaluationState,
    strengths: [
      firstStrength,
      {
        ...structuredClone(firstStrength),
        transcriptRefs: [secondDuplicateIdentityTurn.eventId],
        evidence: [
          {
            turnRef: secondDuplicateIdentityTurn.eventId,
            quote: secondDuplicateIdentityTurn.text,
          },
        ],
      },
    ],
    improvements: [
      {
        ...structuredClone(baselineEvidenceLimited.improvements[0]!),
        transcriptRefs: [firstDuplicateIdentityTurn.eventId],
        evidence: [
          {
            turnRef: firstDuplicateIdentityTurn.eventId,
            quote: firstDuplicateIdentityTurn.text,
          },
        ],
      },
    ],
    summary: baselineEvidenceLimited.summary,
  } as import("@meelni/core").FeedbackEvaluationResult;
  await assert.rejects(
    generationStore.complete({
      sessionId: normalProductSense.sessionId,
      eventId: duplicateIdentityEventId,
      evaluation: duplicatePersistedSelection,
      processingDurationMs: 1,
    }),
    /evidence_limited_persistence_contract_invalid/
  );
  const duplicateIdentityRejected = await getFeedbackBySessionId(
    normalProductSense.sessionId,
    database
  );
  assert.equal(duplicateIdentityRejected?.status, "processing");
  assert.equal(duplicateIdentityRejected?.strengths, null);
  assert.equal(duplicateIdentityRejected?.improvements, null);
  assert.equal(duplicateIdentityRejected?.drills, null);
  assert.equal(duplicateIdentityRejected?.summary, null);
  assert.equal(
    await generationStore.fail({
      sessionId: normalProductSense.sessionId,
      eventId: duplicateIdentityEventId,
      reason: "Feedback evaluation failed. Check worker logs and retry.",
    }),
    true
  );
  const duplicateIdentityFailed = await getFeedbackBySessionId(
    normalProductSense.sessionId,
    database
  );
  assert.equal(duplicateIdentityFailed?.status, "failed");
  assert.equal(duplicateIdentityFailed?.outcomeReason, "generation_failed");
  assert.equal(duplicateIdentityFailed?.strengths, null);
  assert.equal(duplicateIdentityFailed?.improvements, null);
  assert.equal(duplicateIdentityFailed?.drills, null);
  assert.equal(duplicateIdentityFailed?.summary, null);

  await seedSession(collision);
  await ingestFixture(collision);
  const persistedSequenceNamespace = await sql<
    { event_id: string; sequence: number; kind: string }[]
  >`
    SELECT event_id, sequence::int, 'transcript'::text AS kind
    FROM transcript_turn
    WHERE session_id = ${collision.sessionId}::uuid
    UNION ALL
    SELECT event_id, sequence::int, 'interruption_marker'::text AS kind
    FROM transcript_interruption_marker
    WHERE session_id = ${collision.sessionId}::uuid
    ORDER BY sequence
  `;
  assert.deepEqual(
    persistedSequenceNamespace.map((row) => ({ ...row })),
    [
      ...collision.events.map((event) => ({
        event_id: event.event_id,
        sequence: event.sequence,
        kind: "transcript",
      })),
      ...collision.markers.map((marker) => ({
        event_id: marker.event_id,
        sequence: marker.sequence,
        kind: "interruption_marker",
      })),
    ].sort((left, right) => left.sequence - right.sequence)
  );
  const collisionFinalizedAt = new Date(
    Date.parse(collision.settlement.settled_at) + 1_000
  );
  const collisionCompletion = await finalizeInterviewSession(
    {
      sessionId: collision.sessionId,
      actor: { type: "user", userId: collision.userId },
      requestedTerminalReason: "user_end",
      now: collisionFinalizedAt,
    },
    database
  );
  assert.ok(collisionCompletion.ok);
  assert.equal(collisionCompletion.feedback.status, "skipped");
  assert.equal(
    collisionCompletion.feedback.outcomeReason,
    "transcript_integrity_degraded"
  );
  assert.deepEqual(
    await getFrozenFeedbackTranscriptTurns(collision.sessionId, database),
    []
  );
  const collisionRecord = await getFeedbackBySessionId(
    collision.sessionId,
    database
  );
  assert.ok(collisionRecord);
  assert.notEqual(collisionRecord.completionTier, null);
  const skippedPayload = buildSkippedFeedbackLifecycleResponse(collisionRecord);
  assert.ok(skippedPayload);
  const skippedDecoded = core.decodeFeedbackLifecycleResponse(skippedPayload);
  assert.ok(skippedDecoded);
  assert.equal(
    core.toFeedbackViewState(skippedDecoded).kind,
    "transcript-integrity-degraded"
  );
  const collisionReplay = await finalizeInterviewSession(
    {
      sessionId: collision.sessionId,
      actor: { type: "user", userId: collision.userId },
      requestedTerminalReason: "user_end",
      now: new Date(collisionFinalizedAt.getTime() + 1_000),
    },
    database
  );
  assert.equal(collisionReplay.ok && collisionReplay.disposition, "existing");
  assert.ok(collisionReplay.ok);
  assert.equal(collisionReplay.feedback.id, collisionCompletion.feedback.id);

  await seedSession(dispatchFailureFixture);
  await ingestFixture(dispatchFailureFixture);
  const failedDispatchCompletion = await finalizeInterviewSession(
    {
      sessionId: dispatchFailureFixture.sessionId,
      actor: {
        type: "user",
        userId: dispatchFailureFixture.userId,
      },
      requestedTerminalReason: "user_end",
      now: new Date(
        Date.parse(dispatchFailureFixture.settlement.settled_at) + 1_000
      ),
    },
    database
  );
  assert.ok(failedDispatchCompletion.ok);
  assert.equal(failedDispatchCompletion.feedback.status, "pending");
  let dispatchFailureReports = 0;
  const failedDispatch = await dispatchFeedbackGenerationWorkflow(
    {
      sessionId: dispatchFailureFixture.sessionId,
      userId: dispatchFailureFixture.userId,
      tier: failedDispatchCompletion.tier,
    },
    {
      store: createDrizzleFeedbackDispatchStore(database),
      now: () =>
        new Date(
          Date.parse(dispatchFailureFixture.settlement.settled_at) + 2_000
        ),
      reportFailure: () => {
        dispatchFailureReports += 1;
      },
      async send() {
        throw new Error("secret-provider-failure-detail");
      },
    }
  );
  assert.equal(failedDispatch.ok, false);
  assert.equal(failedDispatch.disposition, "failed");
  assert.equal(dispatchFailureReports, 1);
  const failedDispatchRecord = await getFeedbackBySessionId(
    dispatchFailureFixture.sessionId,
    database
  );
  assert.ok(failedDispatchRecord);
  assert.equal(failedDispatchRecord.status, "pending");
  assert.equal(failedDispatchRecord.dispatchStatus, "failed");
  assert.equal(failedDispatchRecord.outcomeReason, "dispatch_failed");
  const failedDispatchPayload =
    buildDispatchFailedFeedbackLifecycleResponse(true);
  const failedDispatchDecoded = core.decodeFeedbackLifecycleResponse(
    failedDispatchPayload
  );
  assert.ok(failedDispatchDecoded);
  assert.equal(
    core.toFeedbackViewState(failedDispatchDecoded).kind,
    "dispatch-failed"
  );
  assert.doesNotMatch(
    JSON.stringify(failedDispatchPayload),
    /secret|provider|model|duration|microphone|answer quality/i
  );

  console.log(
    "Disposable PostgreSQL feedback lifecycle: finalizer/outbox/frozen-read/dispatch/Inngest/CAS/read/API-view passed"
  );
}

async function seedFeedbackOutcomeBackfillFixtures(sql: postgres.Sql) {
  const [completed, failed, noAnswer, degraded] =
    FEEDBACK_OUTCOME_BACKFILL_SESSIONS;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      terminal_reason, ending_at, ended_at, transcript_evidence_version,
      transcript_evidence_state, transcript_cutoff_at,
      transcript_evidence_frozen_at
    ) VALUES
      (${completed}::uuid, ${USER_ONE}::uuid, 'product_sense', 'voice_video',
        'in_progress', 'connecting', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      (${failed}::uuid, ${USER_ONE}::uuid, 'product_sense', 'voice_video',
        'in_progress', 'connecting', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      (${noAnswer}::uuid, ${USER_ONE}::uuid, 'product_sense', 'voice_video',
        'in_progress', 'connecting', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      (${degraded}::uuid, ${USER_ONE}::uuid, 'product_sense', 'voice_video',
        'completed', 'completed', 'user_end',
        '2026-08-10T12:00:00.000Z'::timestamptz,
        '2026-08-10T12:00:00.000Z'::timestamptz, 1, 'degraded',
        '2026-08-10T12:00:00.000Z'::timestamptz,
        '2026-08-10T12:00:00.000Z'::timestamptz)
  `;
  await sql`
    INSERT INTO feedback (session_id, status, status_reason)
    VALUES
      (${completed}::uuid, 'completed', 'sav397_completed_fixture'),
      (${failed}::uuid, 'failed', 'sav397_failed_fixture'),
      (${noAnswer}::uuid, 'skipped', 'sav397_no_answer_fixture'),
      (${degraded}::uuid, 'skipped', 'sav397_degraded_fixture')
  `;
}

async function verifyFeedbackOutcomeBackfill(sql: postgres.Sql) {
  const rows = await sql<{ status_reason: string; outcome_reason: string }[]>`
    SELECT status_reason, outcome_reason
    FROM feedback
    WHERE session_id = ANY(${FEEDBACK_OUTCOME_BACKFILL_SESSIONS}::uuid[])
    ORDER BY status_reason
  `;
  assert.deepEqual(Array.from(rows), [
    {
      status_reason: "sav397_completed_fixture",
      outcome_reason: "feedback_generated",
    },
    {
      status_reason: "sav397_degraded_fixture",
      outcome_reason: "transcript_integrity_degraded",
    },
    {
      status_reason: "sav397_failed_fixture",
      outcome_reason: "generation_failed",
    },
    {
      status_reason: "sav397_no_answer_fixture",
      outcome_reason: "no_reviewable_answer",
    },
  ]);
}

async function removeFeedbackOutcomeBackfillFixtures(sql: postgres.Sql) {
  await sql`
    DELETE FROM feedback
    WHERE session_id = ANY(${FEEDBACK_OUTCOME_BACKFILL_SESSIONS}::uuid[])
  `;
  await sql`
    DELETE FROM interview_session
    WHERE id = ANY(${FEEDBACK_OUTCOME_BACKFILL_SESSIONS}::uuid[])
  `;
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

  const serverOwnedBillingTables = [
    "billing_adjustment",
    "billing_payment_state",
    "credit_rollover_lot",
    "credit_rollover_lot_allocation",
  ] as const;
  for (const table of serverOwnedBillingTables) {
    await assert.rejects(
      () =>
        asRole(sql, "authenticated", (tx) =>
          tx.unsafe(`SELECT * FROM ${table}`)
        ),
      /permission denied/
    );
    await assert.rejects(
      () => asRole(sql, "anon", (tx) => tx.unsafe(`SELECT * FROM ${table}`)),
      /permission denied/
    );
    await asRole(sql, "service_role", (tx) =>
      tx.unsafe(`SELECT * FROM ${table} LIMIT 0`)
    );
  }

  for (const role of ["anon", "authenticated"] as const) {
    await assert.rejects(
      () => asRole(sql, role, (tx) => tx`SELECT * FROM public_demo_rate_limit`),
      /permission denied/
    );
    await assert.rejects(
      () =>
        asRole(
          sql,
          role,
          (tx) => tx`SELECT * FROM public.prune_public_demo_abuse_data()`
        ),
      /permission denied/
    );
  }
  await asRole(
    sql,
    "service_role",
    (tx) => tx`SELECT * FROM public.prune_public_demo_abuse_data()`
  );

  const functionPrivileges = await sql<
    {
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      anon_execute: boolean;
      authenticated_execute: boolean;
      service_execute: boolean;
    }[]
  >`
    SELECT p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE')
        AS service_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
    ORDER BY p.proname
  `;
  assert.deepEqual(
    functionPrivileges.map((entry) => entry.proname),
    [
      "complete_public_demo_session",
      "fail_public_demo_recovery_session",
      "finalize_public_demo_recovery_token",
      "prune_public_demo_abuse_data",
      "reserve_public_demo_session",
      "rollback_public_demo_recovery_token",
    ]
  );
  for (const entry of functionPrivileges) {
    assert.equal(entry.prosecdef, false);
    assert.deepEqual(entry.proconfig, ["search_path=public"]);
    assert.equal(entry.anon_execute, false);
    assert.equal(entry.authenticated_execute, false);
    assert.equal(entry.service_execute, true);
  }
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

async function verifyPublicDemoLimits(sql: postgres.Sql) {
  const sessionId = "d1000000-0000-4000-8000-000000000001";
  const ipHash = "a".repeat(64);
  const deviceHash = "b".repeat(64);
  const reserve = (
    client: postgres.Sql,
    requestedSessionId: string,
    requestedIpHash = ipHash,
    requestedDeviceHash = deviceHash
  ) =>
    client<
      {
        decision: string;
        room_name: string | null;
        limiting_scope: string | null;
        retry_after_seconds: number;
        remaining: number;
        recovery_claim_token: string | null;
        deadline_at: Date | string | null;
      }[]
    >`
      SELECT decision, room_name, limiting_scope, retry_after_seconds, remaining,
        recovery_claim_token, deadline_at
      FROM public.reserve_public_demo_session(
        ${requestedSessionId}::uuid,
        'development',
        ${requestedIpHash},
        ${requestedDeviceHash}
      )
    `;

  await sql`DELETE FROM public_demo_session`;
  await sql`DELETE FROM public_demo_rate_limit`;

  const { reservePublicDemoSession } = await import(
    "../lib/db/demo-rate-limits"
  );
  const adapterReservation = await reservePublicDemoSession({
    sessionId: "d0000000-0000-4000-8000-000000000001",
    deploymentScope: "development",
    ipHash: "e".repeat(64),
    deviceHash: "f".repeat(64),
  });
  assert.equal(adapterReservation.action, "provision");
  assert.ok(adapterReservation.deadlineAt);
  assert.equal(adapterReservation.deadlineAt.getTime() > Date.now(), true);

  await sql`DELETE FROM public_demo_session`;
  await sql`DELETE FROM public_demo_rate_limit`;

  const [initial] = await reserve(sql, sessionId);
  assert.equal(initial?.decision, "provision");
  assert.ok(initial?.deadline_at);
  const [initialSession] = await sql<
    { created_at: Date | string; active_expires_at: Date | string }[]
  >`
    SELECT created_at, active_expires_at
    FROM public_demo_session
    WHERE id = ${sessionId}::uuid
  `;
  assert.ok(initialSession);
  const createdAt = databaseTimestamp(initialSession.created_at);
  const activeExpiresAt = databaseTimestamp(initialSession.active_expires_at);
  const initialDeadlineAt = databaseTimestamp(initial.deadline_at);
  assert.equal(activeExpiresAt.getTime() - createdAt.getTime(), 120_000);
  assert.equal(initialDeadlineAt.getTime(), activeExpiresAt.getTime());
  const [completed] = await sql<{ completed: boolean }[]>`
    SELECT public.complete_public_demo_session(
      ${sessionId}::uuid, 'ready', NULL
    ) AS completed
  `;
  assert.equal(completed?.completed, true);

  const recoveryAttempts = await Promise.all(
    Array.from({ length: 12 }, () => reserve(sql, sessionId))
  );
  const recoveryRows = recoveryAttempts.flat();
  assert.equal(
    recoveryRows.filter((row) => row.decision === "issue_token").length,
    1
  );
  const claim = recoveryRows.find((row) => row.decision === "issue_token");
  assert.ok(claim?.deadline_at);
  assert.equal(
    databaseTimestamp(claim.deadline_at).getTime(),
    initialDeadlineAt.getTime()
  );
  const recoveryClaimToken = claim?.recovery_claim_token;
  assert.ok(recoveryClaimToken);
  const [finalized] = await sql<{ completed: boolean }[]>`
    SELECT public.finalize_public_demo_recovery_token(
      ${sessionId}::uuid, ${recoveryClaimToken}::uuid
    ) AS completed
  `;
  const [finalizedAgain] = await sql<{ completed: boolean }[]>`
    SELECT public.finalize_public_demo_recovery_token(
      ${sessionId}::uuid, ${recoveryClaimToken}::uuid
    ) AS completed
  `;
  const [rollbackAfterFinalize] = await sql<{ completed: boolean }[]>`
    SELECT public.rollback_public_demo_recovery_token(
      ${sessionId}::uuid, ${recoveryClaimToken}::uuid
    ) AS completed
  `;
  assert.equal(finalized?.completed, true);
  assert.equal(finalizedAgain?.completed, true);
  assert.equal(rollbackAfterFinalize?.completed, false);
  assert.equal((await reserve(sql, sessionId))[0]?.decision, "rate_limited");

  const delayedCompletionSessionId = "d1000000-0000-4000-8000-000000000003";
  assert.equal(
    (
      await reserve(
        sql,
        delayedCompletionSessionId,
        "1".repeat(64),
        "2".repeat(64)
      )
    )[0]?.decision,
    "provision"
  );
  await sql`
    UPDATE public_demo_session
    SET active_expires_at = clock_timestamp() + interval '4 seconds'
    WHERE id = ${delayedCompletionSessionId}::uuid
  `;
  const [delayedReady] = await sql<{ completed: boolean }[]>`
    SELECT public.complete_public_demo_session(
      ${delayedCompletionSessionId}::uuid, 'ready', NULL
    ) AS completed
  `;
  const [delayedFailed] = await sql<{ completed: boolean }[]>`
    SELECT public.complete_public_demo_session(
      ${delayedCompletionSessionId}::uuid,
      'failed',
      'reservation_finalize_failed'
    ) AS completed
  `;
  assert.equal(delayedReady?.completed, false);
  assert.equal(delayedFailed?.completed, true);

  const delayedRecoverySessionId = "d1000000-0000-4000-8000-000000000002";
  assert.equal(
    (
      await reserve(
        sql,
        delayedRecoverySessionId,
        "3".repeat(64),
        "4".repeat(64)
      )
    )[0]?.decision,
    "provision"
  );
  await sql`
    SELECT public.complete_public_demo_session(
      ${delayedRecoverySessionId}::uuid, 'ready', NULL
    )
  `;
  const [delayedRecoveryClaim] = await reserve(
    sql,
    delayedRecoverySessionId,
    "3".repeat(64),
    "4".repeat(64)
  );
  assert.equal(delayedRecoveryClaim?.decision, "issue_token");
  await sql`
    UPDATE public_demo_session
    SET active_expires_at = clock_timestamp() + interval '4 seconds'
    WHERE id = ${delayedRecoverySessionId}::uuid
  `;
  const [delayedFinalization] = await sql<{ completed: boolean }[]>`
    SELECT public.finalize_public_demo_recovery_token(
      ${delayedRecoverySessionId}::uuid,
      ${delayedRecoveryClaim?.recovery_claim_token}::uuid
    ) AS completed
  `;
  const [failedDelayedRecovery] = await sql<{ completed: boolean }[]>`
    SELECT public.fail_public_demo_recovery_session(
      ${delayedRecoverySessionId}::uuid,
      ${delayedRecoveryClaim?.recovery_claim_token}::uuid,
      'recovery_finalize_failed'
    ) AS completed
  `;
  assert.equal(delayedFinalization?.completed, false);
  assert.equal(failedDelayedRecovery?.completed, true);

  const ipRowsBefore = await sql<{ rows: number }[]>`
    SELECT count(*)::int AS rows
    FROM public_demo_rate_limit
    WHERE deployment_scope = 'development' AND scope = 'ip'
  `;
  const denied = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      reserve(
        sql,
        `d2000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        index.toString(16).padStart(64, "0")
      )
    )
  );
  assert.equal(
    denied.flat().every((row) => row.decision === "rate_limited"),
    true
  );
  const ipRowsAfter = await sql<{ rows: number }[]>`
    SELECT count(*)::int AS rows
    FROM public_demo_rate_limit
    WHERE deployment_scope = 'development' AND scope = 'ip'
  `;
  assert.equal(ipRowsAfter[0]?.rows, ipRowsBefore[0]?.rows);

  await sql`
    UPDATE public_demo_session
    SET active_expires_at = clock_timestamp() - interval '1 second'
    WHERE id = ${sessionId}::uuid
  `;
  const [rotation] = await reserve(sql, sessionId);
  assert.deepEqual(
    {
      decision: rotation?.decision,
      roomName: rotation?.room_name,
      limitingScope: rotation?.limiting_scope,
      retryAfterSeconds: rotation?.retry_after_seconds,
      remaining: rotation?.remaining,
      deadlineAt: rotation?.deadline_at,
    },
    {
      decision: "rotate_session",
      roomName: null,
      limitingScope: null,
      retryAfterSeconds: 0,
      remaining: 0,
      deadlineAt: null,
    }
  );

  const rollbackSessionId = "d3000000-0000-4000-8000-000000000001";
  assert.equal(
    (await reserve(sql, rollbackSessionId, "c".repeat(64), "d".repeat(64)))[0]
      ?.decision,
    "provision"
  );
  await sql`
    SELECT public.complete_public_demo_session(
      ${rollbackSessionId}::uuid, 'ready', NULL
    )
  `;
  const [rollbackClaim] = await reserve(
    sql,
    rollbackSessionId,
    "c".repeat(64),
    "d".repeat(64)
  );
  assert.equal(rollbackClaim?.decision, "issue_token");
  const [rolledBack] = await sql<{ completed: boolean }[]>`
    SELECT public.rollback_public_demo_recovery_token(
      ${rollbackSessionId}::uuid,
      ${rollbackClaim?.recovery_claim_token}::uuid
    ) AS completed
  `;
  assert.equal(rolledBack?.completed, true);
  assert.equal(
    (await reserve(sql, rollbackSessionId, "c".repeat(64), "d".repeat(64)))[0]
      ?.decision,
    "issue_token"
  );

  await sql`DELETE FROM public_demo_session`;
  await sql`DELETE FROM public_demo_rate_limit`;

  const sharedIp = "8".repeat(64);
  const sharedDevice = "9".repeat(64);
  for (let index = 0; index < 10; index += 1) {
    const nextSession = `d4000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const [accepted] = await reserve(sql, nextSession, sharedIp, sharedDevice);
    assert.equal(accepted?.decision, "provision");
    assert.equal(accepted?.remaining, 9 - index);
    const [ready] = await sql<{ completed: boolean }[]>`
      SELECT public.complete_public_demo_session(
        ${nextSession}::uuid, 'ready', NULL
      ) AS completed
    `;
    assert.equal(ready?.completed, true);
    await sql`
      UPDATE public_demo_session
      SET active_expires_at = clock_timestamp() - interval '1 second'
      WHERE id = ${nextSession}::uuid
    `;
  }
  const [sharedIpEleventh] = await reserve(
    sql,
    "d4000000-0000-4000-8000-000000000010",
    sharedIp,
    sharedDevice
  );
  assert.equal(sharedIpEleventh?.decision, "rate_limited");
  assert.ok(["ip", "device"].includes(sharedIpEleventh?.limiting_scope ?? ""));
  assert.ok((sharedIpEleventh?.retry_after_seconds ?? 0) > 0);

  await sql`DELETE FROM public_demo_session`;
  await sql`DELETE FROM public_demo_rate_limit`;

  const dailyDevice = "7".repeat(64);
  for (let index = 0; index < 10; index += 1) {
    const nextSession = `d5000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const [accepted] = await reserve(
      sql,
      nextSession,
      index.toString(16).padStart(64, "0"),
      dailyDevice
    );
    assert.equal(accepted?.decision, "provision");
    const [ready] = await sql<{ completed: boolean }[]>`
      SELECT public.complete_public_demo_session(
        ${nextSession}::uuid, 'ready', NULL
      ) AS completed
    `;
    assert.equal(ready?.completed, true);
    await sql`
      UPDATE public_demo_session
      SET active_expires_at = clock_timestamp() - interval '1 second'
      WHERE id = ${nextSession}::uuid
    `;
  }
  const [deviceEleventh] = await reserve(
    sql,
    "d5000000-0000-4000-8000-000000000010",
    "a".repeat(64),
    dailyDevice
  );
  assert.equal(deviceEleventh?.decision, "rate_limited");
  assert.equal(deviceEleventh?.limiting_scope, "device");

  await sql`DELETE FROM public_demo_session`;
  await sql`DELETE FROM public_demo_rate_limit`;

  const failedSessionId = "d6000000-0000-4000-8000-000000000001";
  const failedIp = "5".repeat(64);
  const failedDevice = "6".repeat(64);
  assert.equal(
    (await reserve(sql, failedSessionId, failedIp, failedDevice))[0]?.decision,
    "provision"
  );
  const [failedCompletion] = await sql<{ completed: boolean }[]>`
    SELECT public.complete_public_demo_session(
      ${failedSessionId}::uuid, 'failed', 'livekit_demo_start_failed'
    ) AS completed
  `;
  assert.equal(failedCompletion?.completed, true);
  const refunded = await sql<{ scope: string; accepted: number }[]>`
    SELECT scope, cardinality(accepted_at)::int AS accepted
    FROM public_demo_rate_limit
    WHERE deployment_scope = 'development'
    ORDER BY scope
  `;
  assert.deepEqual(Array.from(refunded), [
    { scope: "device", accepted: 0 },
    { scope: "global", accepted: 0 },
    { scope: "ip", accepted: 0 },
  ]);
  const [retryAfterRefund] = await reserve(
    sql,
    "d6000000-0000-4000-8000-000000000002",
    failedIp,
    failedDevice
  );
  assert.equal(retryAfterRefund?.decision, "provision");
  assert.equal(retryAfterRefund?.remaining, 9);
}

async function verifyDurableContactSubmission(
  sql: postgres.Sql,
  databaseUrl: string,
  includeApplicationAdapters: boolean
) {
  process.env.DATABASE_URL = databaseUrl;
  const [
    {
      consumeContactSubmissionAttemptBudget,
      createDrizzleContactSubmissionStore,
    },
    { deleteUserApplicationData, requestAccountDeletion },
    { loadAccountExportSource },
    schema,
  ] = await Promise.all([
    import("../lib/db/contact-submissions"),
    import("../lib/db/account-deletions"),
    import("../lib/db/account-export"),
    import("../lib/db/schema"),
  ]);
  await installContactTriageTestOperators(sql);
  const clients = Array.from({ length: 8 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  const operatorClients = [CONTACT_OPERATOR_ONE, CONTACT_OPERATOR_TWO].map(
    (role) =>
      postgres(databaseUrlForRole(databaseUrl, role), {
        max: 1,
        prepare: false,
      })
  );
  const stores = clients.map((client) =>
    createDrizzleContactSubmissionStore(drizzle(client, { schema }))
  );
  const databases = clients.map((client) => drizzle(client, { schema }));
  const rateLimitIdentities = {
    attempt: "d".repeat(64),
    client: "a".repeat(64),
    email: "b".repeat(64),
    global: "c".repeat(64),
  };
  const guessableEmailHash = createHash("sha256")
    .update("migration-test@example.invalid")
    .digest("hex");
  const baseInput = {
    idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: USER_ONE,
    name: "Migration Test",
    email: "migration-test@example.invalid",
    reason: "support" as const,
    subject: "Durable contact migration",
    message: "This disposable fixture verifies durable contact behavior.",
    rateLimitIdentities,
  };
  const accept = async (index: number, input: typeof baseInput) => {
    const attempt = await consumeContactSubmissionAttemptBudget(
      input.rateLimitIdentities.attempt,
      databases[index]
    );
    return attempt.allowed
      ? stores[index]!.accept(input)
      : {
          disposition: "rate_limited" as const,
          retryAfterSeconds: attempt.retryAfterSeconds,
        };
  };

  try {
    const concurrent = await Promise.all(
      stores.map((_, index) => accept(index, baseInput))
    );
    const receiptIds = concurrent.flatMap((decision) =>
      decision.disposition === "stored" || decision.disposition === "replayed"
        ? [decision.receiptId]
        : []
    );
    assert.equal(receiptIds.length, stores.length);
    assert.equal(new Set(receiptIds).size, 1);
    assert.equal(
      concurrent.filter(({ disposition }) => disposition === "stored").length,
      1
    );
    assert.equal(
      concurrent.filter(({ disposition }) => disposition === "replayed").length,
      stores.length - 1
    );

    assert.deepEqual(
      await accept(0, {
        ...baseInput,
        subject: "Changed payload",
      }),
      { disposition: "idempotency_conflict" }
    );

    for (const [index, idempotencyKey] of [
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ].entries()) {
      const decision = await accept(index, {
        ...baseInput,
        idempotencyKey,
      });
      assert.equal(decision.disposition, "stored");
    }

    const limited = await accept(0, {
      ...baseInput,
      idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    assert.equal(limited.disposition, "rate_limited");
    if (limited.disposition === "rate_limited") {
      assert.ok(limited.retryAfterSeconds >= 1);
      assert.ok(limited.retryAfterSeconds <= 3600);
    }

    for (let index = 0; index < 48; index += 1) {
      assert.equal(
        (
          await accept(index % stores.length, {
            ...baseInput,
            subject: `conflict-${index}`,
          })
        ).disposition,
        "idempotency_conflict"
      );
    }
    assert.equal(
      (
        await accept(0, {
          ...baseInput,
          subject: "attempt-budget-exhausted",
        })
      ).disposition,
      "rate_limited"
    );

    const state = await sql<
      {
        submissions: number;
        email_budget: number;
        attempt_budget: number;
        raw_email_hashes: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM contact_submission) AS submissions,
        (SELECT request_count::int FROM contact_submission_rate_limit
          WHERE identity_hash = ${rateLimitIdentities.email}) AS email_budget,
        (SELECT request_count::int FROM contact_submission_rate_limit
          WHERE identity_hash = ${rateLimitIdentities.attempt}) AS attempt_budget,
        (SELECT count(*)::int FROM contact_submission_rate_limit
          WHERE identity_hash = ${guessableEmailHash}) AS raw_email_hashes
    `;
    assert.deepEqual(state[0], {
      submissions: 3,
      email_budget: 3,
      attempt_budget: 60,
      raw_email_hashes: 0,
    });

    const receiptId = receiptIds[0]!;
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await assertContactTriageDenied(sql, role, receiptId);
    }
    await assert.rejects(
      () =>
        operatorClients[0]!`
          SELECT * FROM public.list_contact_submissions(10)
        `,
      /permission denied/
    );

    const operatorIdentities = await Promise.all(
      operatorClients.map((client) =>
        asContactTriageOperator(
          client,
          (tx) =>
            tx<{ session_user: string; current_user: string }[]>`
              SELECT session_user::text AS session_user,
                current_user::text AS current_user
            `
        )
      )
    );
    assert.deepEqual(
      operatorIdentities.map((rows) => rows[0]),
      [
        {
          session_user: CONTACT_OPERATOR_ONE,
          current_user: CONTACT_TRIAGE_ROLE,
        },
        {
          session_user: CONTACT_OPERATOR_TWO,
          current_user: CONTACT_TRIAGE_ROLE,
        },
      ]
    );

    const queue = await asContactTriageOperator(
      operatorClients[0]!,
      (tx) =>
        tx<
          {
            receipt_id: string;
            reason: string;
            triage_state: string;
          }[]
        >`SELECT receipt_id, reason, triage_state FROM public.list_contact_submissions(10)`
    );
    assert.equal(queue.length, 3);
    assert.ok(queue.every(({ triage_state }) => triage_state === "new"));

    const privateResult = await asContactTriageOperator(
      operatorClients[0]!,
      (tx) =>
        tx<
          { receipt_id: string; email: string; persistence_state: string }[]
        >`SELECT receipt_id, email, persistence_state
          FROM public.read_contact_submission(
            ${receiptId}::uuid
          )`
    );
    assert.deepEqual(privateResult[0], {
      receipt_id: receiptId,
      email: baseInput.email,
      persistence_state: "stored",
    });

    assert.equal(
      (
        await asContactTriageOperator(
          operatorClients[0]!,
          (tx) =>
            tx<{ changed: boolean }[]>`
              SELECT public.set_contact_submission_triage_state(
                ${receiptId}::uuid,
                'claimed'
              ) AS changed
            `
        )
      )[0]?.changed,
      true
    );
    assert.equal(
      (
        await asContactTriageOperator(
          operatorClients[1]!,
          (tx) =>
            tx<{ changed: boolean }[]>`
              SELECT public.set_contact_submission_triage_state(
                ${receiptId}::uuid,
                'resolved'
              ) AS changed
            `
        )
      )[0]?.changed,
      true
    );
    await assert.rejects(
      () =>
        asContactTriageOperator(
          operatorClients[0]!,
          (tx) => tx`
            SELECT public.set_contact_submission_triage_state(
              ${receiptId}::uuid,
              'claimed'
            )
          `
        ),
      /contact_triage_state_regression/
    );
    const missingTriage = await asContactTriageOperator(
      operatorClients[0]!,
      (tx) => tx<{ changed: boolean }[]>`
        SELECT public.set_contact_submission_triage_state(
          '99999999-1111-4111-8111-999999999999'::uuid,
          'claimed'
        ) AS changed
      `
    );
    assert.equal(missingTriage[0]?.changed, false);
    await assert.rejects(
      () =>
        asContactTriageOperator(
          operatorClients[0]!,
          (tx) => tx`
            SELECT public.set_contact_submission_triage_state(
              ${receiptId}::uuid,
              'new'
            )
          `
        ),
      /invalid_contact_triage_state/
    );
    assert.equal(
      (
        await asContactTriageOperator(
          operatorClients[1]!,
          (tx) =>
            tx<{ changed: boolean }[]>`
              SELECT public.set_contact_submission_triage_state(
                ${receiptId}::uuid,
                'resolved'
              ) AS changed
            `
        )
      )[0]?.changed,
      true
    );

    const [auditState] = await sql<
      {
        audit_rows: number;
        state: string;
        actors: string[];
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM contact_submission_access_audit
          WHERE submission_id = ${receiptId}::uuid) AS audit_rows,
        (SELECT triage_state FROM contact_submission
          WHERE id = ${receiptId}::uuid) AS state,
        (SELECT array_agg(
            DISTINCT actor_reference ORDER BY actor_reference
          )
          FROM contact_submission_access_audit
          WHERE submission_id = ${receiptId}::uuid) AS actors
    `;
    assert.ok(auditState);
    const expectedActors = [CONTACT_OPERATOR_ONE, CONTACT_OPERATOR_TWO]
      .map((role) => createHash("md5").update(role).digest("hex"))
      .sort();
    assert.deepEqual(auditState, {
      audit_rows: 3,
      state: "resolved",
      actors: expectedActors,
    });

    const staleIdentities = Array.from({ length: 7 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    await sql`
      INSERT INTO contact_submission_rate_limit (
        identity_hash, window_started_at, request_count
      )
      SELECT identity_hash, now() - interval '25 hours', 1
      FROM unnest(${staleIdentities}::text[]) identity_hash
    `;
    const cleanupBatch = await asRole(
      sql,
      "service_role",
      (tx) =>
        tx<{ deleted: number }[]>`
          SELECT public.cleanup_contact_submission_rate_limits(3) AS deleted
        `
    );
    assert.equal(cleanupBatch[0]?.deleted, 3);
    const cleanupRemainder = await asRole(
      sql,
      "service_role",
      (tx) =>
        tx<{ deleted: number }[]>`
          SELECT public.cleanup_contact_submission_rate_limits(5000) AS deleted
        `
    );
    assert.equal(cleanupRemainder[0]?.deleted, 4);
    const [limiterState] = await sql<{ stale: number; active: number }[]>`
      SELECT
        count(*) FILTER (
          WHERE window_started_at < date_trunc('hour', now()) - interval '24 hours'
        )::int AS stale,
        count(*) FILTER (
          WHERE window_started_at >= date_trunc('hour', now())
        )::int AS active
      FROM contact_submission_rate_limit
    `;
    assert.deepEqual(limiterState, { stale: 0, active: 4 });

    await verifyContactSubmissionDatabaseBounds(sql);

    if (!includeApplicationAdapters) return;

    await sql`
      INSERT INTO app_user (id, email)
      VALUES (${CONTACT_DELETE_USER}::uuid, 'delete-contact@example.invalid')
    `;
    await sql`
      INSERT INTO contact_submission (
        idempotency_key, user_id, name, email, reason, subject, message
      ) VALUES
      ('13131313-1313-4313-8313-131313131313'::uuid,
        ${CONTACT_DELETE_USER}::uuid, 'Linked',
        'delete-contact@example.invalid', 'support', 'Linked request',
        'This request is linked to the authenticated account.'),
      ('14141414-1414-4414-8414-141414141414'::uuid,
        NULL, 'Unlinked', 'delete-contact@example.invalid', 'support',
        'Unlinked request',
        'This request must not be deleted by matching email text.')
    `;
    const contactExport = await loadAccountExportSource(CONTACT_DELETE_USER);
    assert.equal(contactExport.contactSubmissions.length, 1);
    assert.deepEqual(
      Object.keys(contactExport.contactSubmissions[0] ?? {}).sort(),
      [
        "createdAt",
        "email",
        "message",
        "name",
        "persistenceState",
        "reason",
        "receiptId",
        "subject",
        "triageState",
        "userId",
      ]
    );
    assert.equal(
      contactExport.contactSubmissions[0]?.email,
      "delete-contact@example.invalid"
    );
    await sql`
      INSERT INTO interview_session (id, user_id, round_type, mode)
      VALUES (
        ${CONTACT_DELETE_SESSION}::uuid,
        ${CONTACT_DELETE_USER}::uuid,
        'product_sense',
        'text'
      )
    `;
    await sql`
      INSERT INTO user_insights (
        user_id, overall_stats, by_interview_type, by_difficulty, trends,
        competency_breakdown, last_session_id
      ) VALUES (
        ${CONTACT_DELETE_USER}::uuid,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        ${CONTACT_DELETE_SESSION}::uuid
      )
    `;
    await deleteUserApplicationData(CONTACT_DELETE_USER);
    const [privacyDeletion] = await sql<
      {
        insights: number;
        linked: number;
        sessions: number;
        unlinked: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM user_insights
          WHERE user_id = ${CONTACT_DELETE_USER}::uuid) AS insights,
        count(*) FILTER (WHERE user_id = ${CONTACT_DELETE_USER}::uuid)::int AS linked,
        count(*) FILTER (
          WHERE idempotency_key = '14141414-1414-4414-8414-141414141414'::uuid
        )::int AS unlinked,
        (SELECT count(*)::int FROM interview_session
          WHERE id = ${CONTACT_DELETE_SESSION}::uuid) AS sessions
      FROM contact_submission
    `;
    assert.deepEqual(privacyDeletion, {
      insights: 0,
      linked: 0,
      sessions: 0,
      unlinked: 1,
    });

    await sql`
      INSERT INTO app_user (id, email)
      VALUES
        (${CONTACT_WINS_RACE_USER}::uuid, 'contact-wins@example.invalid'),
        (${DELETION_WINS_RACE_USER}::uuid, 'deletion-wins@example.invalid')
    `;

    const contactWinsInput = contactRaceInput({
      userId: CONTACT_WINS_RACE_USER,
      idempotencyKey: "18181818-1818-4818-8818-181818181818",
      identitySeed: "1",
    });
    const contactWinsBarrier = await holdIdempotencyLock(
      databaseUrl,
      contactWinsInput.idempotencyKey
    );
    const contactWins = stores[0]!.accept(contactWinsInput);
    await waitForAccountIdentityLock(databaseUrl, CONTACT_WINS_RACE_USER);
    const deletionAfterContact = requestAccountDeletion({
      userId: CONTACT_WINS_RACE_USER,
      stripeSubjects: [],
    });
    await contactWinsBarrier.release();

    const contactWinsDecision = await contactWins;
    assert.equal(contactWinsDecision.disposition, "stored");
    await deletionAfterContact;
    await deleteUserApplicationData(CONTACT_WINS_RACE_USER);
    const [contactWinsState] = await sql<{ remaining: number }[]>`
      SELECT count(*)::int AS remaining
      FROM contact_submission
      WHERE user_id = ${CONTACT_WINS_RACE_USER}::uuid
    `;
    assert.equal(contactWinsState?.remaining, 0);

    const deletionWinsInput = contactRaceInput({
      userId: DELETION_WINS_RACE_USER,
      idempotencyKey: "19191919-1919-4919-8919-191919191919",
      identitySeed: "2",
    });
    const deletionWinsBarrier = await holdAppUserRowLock(
      databaseUrl,
      DELETION_WINS_RACE_USER
    );
    const deletionBeforeContact = requestAccountDeletion({
      userId: DELETION_WINS_RACE_USER,
      stripeSubjects: [],
    });
    await waitForAccountIdentityLock(databaseUrl, DELETION_WINS_RACE_USER);
    const rejectedContact = assert.rejects(
      stores[1]!.accept(deletionWinsInput),
      /contact_account_unavailable/
    );
    await deletionWinsBarrier.release();

    await deletionBeforeContact;
    await rejectedContact;
    const [deletionWinsState] = await sql<
      { remaining: number; tombstones: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM contact_submission
          WHERE user_id = ${DELETION_WINS_RACE_USER}::uuid) AS remaining,
        (SELECT count(*)::int FROM account_deletion_request
          WHERE user_id = ${DELETION_WINS_RACE_USER}::uuid) AS tombstones
    `;
    assert.deepEqual(deletionWinsState, { remaining: 0, tombstones: 1 });

    await assert.rejects(
      stores[2]!.accept(
        contactRaceInput({
          userId: "20202020-2020-4020-8020-202020202020",
          idempotencyKey: "21212121-2121-4121-8121-212121212121",
          identitySeed: "3",
        })
      ),
      /contact_account_unavailable/
    );
  } finally {
    await Promise.all(
      [...clients, ...operatorClients].map((client) => client.end())
    );
  }
}

async function verifyContactSubmissionDatabaseBounds(sql: postgres.Sql) {
  const invalidRows = [
    {
      key: "31313131-3131-4131-8131-313131313131",
      name: " Untrimmed",
      email: "valid@example.invalid",
      subject: "Valid subject",
      message: "A valid contact message.",
      error: /contact_submission_name_bounds_check/,
    },
    {
      key: "32323232-3232-4232-8232-323232323232",
      name: `Control${String.fromCharCode(1)}`,
      email: "valid@example.invalid",
      subject: "Valid subject",
      message: "A valid contact message.",
      error: /contact_submission_name_bounds_check/,
    },
    {
      key: "33333333-3333-4333-8333-333333333333",
      name: "Valid name",
      email: "Uppercase@Example.invalid",
      subject: "Valid subject",
      message: "A valid contact message.",
      error: /contact_submission_email_bounds_check/,
    },
    {
      key: "34343434-3434-4434-8434-343434343434",
      name: "Valid name",
      email: "valid@example.invalid",
      subject: "x".repeat(201),
      message: "A valid contact message.",
      error: /contact_submission_subject_bounds_check/,
    },
    {
      key: "35353535-3535-4535-8535-353535353535",
      name: "Valid name",
      email: "valid@example.invalid",
      subject: "Valid subject",
      message: "too short",
      error: /contact_submission_message_bounds_check/,
    },
    {
      key: "36363636-3636-4636-8636-363636363636",
      name: "Valid name",
      email: "valid@example.invalid",
      subject: "Valid subject",
      message: `Invalid${String.fromCharCode(1)} message`,
      error: /contact_submission_message_bounds_check/,
    },
  ] as const;

  await sql.begin(async (tx) => {
    for (const [index, row] of invalidRows.entries()) {
      await assert.rejects(
        tx.savepoint(
          `invalid_contact_${index}`,
          (savepoint) =>
            savepoint`
            INSERT INTO contact_submission (
              idempotency_key, name, email, reason, subject, message
            ) VALUES (
              ${row.key}::uuid,
              ${row.name},
              ${row.email},
              'support',
              ${row.subject},
              ${row.message}
            )
          `
        ),
        row.error
      );
    }

    await assert.rejects(
      tx.savepoint(
        "orphan_contact_user",
        (savepoint) => savepoint`
        INSERT INTO contact_submission (
          idempotency_key, user_id, name, email, reason, subject, message
        ) VALUES (
          '37373737-3737-4737-8737-373737373737'::uuid,
          '38383838-3838-4838-8838-383838383838'::uuid,
          'Valid name',
          'valid@example.invalid',
          'support',
          'Valid subject',
          'A valid contact message.'
        )
      `
      ),
      /contact_submission_user_id_app_user_id_fk/
    );
  });
}

function contactRaceInput({
  userId,
  idempotencyKey,
  identitySeed,
}: {
  userId: string;
  idempotencyKey: string;
  identitySeed: string;
}) {
  return {
    idempotencyKey,
    userId,
    name: "Deletion Race",
    email: `${identitySeed}@example.invalid`,
    reason: "support" as const,
    subject: "Concurrent deletion",
    message: "This disposable fixture verifies deletion serialization.",
    rateLimitIdentities: {
      attempt: identitySeed.repeat(64),
      client: (Number(identitySeed) + 3).toString(16).repeat(64),
      email: (Number(identitySeed) + 6).toString(16).repeat(64),
      global: (Number(identitySeed) + 9).toString(16).repeat(64),
    },
  };
}

async function holdIdempotencyLock(
  databaseUrl: string,
  idempotencyKey: string
) {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  let releaseBarrier!: () => void;
  let signalReady!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const transaction = client.begin(async (tx) => {
    await tx`
      SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))
    `;
    signalReady();
    await release;
  });
  await ready;

  return {
    async release() {
      releaseBarrier();
      await transaction;
      await client.end();
    },
  };
}

async function holdAppUserRowLock(databaseUrl: string, userId: string) {
  const client = postgres(databaseUrl, { max: 1, prepare: false });
  let releaseBarrier!: () => void;
  let signalReady!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const transaction = client.begin(async (tx) => {
    await tx`
      SELECT id FROM app_user WHERE id = ${userId}::uuid FOR UPDATE
    `;
    signalReady();
    await release;
  });
  await ready;

  return {
    async release() {
      releaseBarrier();
      await transaction;
      await client.end();
    },
  };
}

async function waitForAccountIdentityLock(databaseUrl: string, userId: string) {
  const probe = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const acquired = await probe.begin(async (tx) => {
        const [row] = await tx<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(
            hashtextextended(
              ${userId},
              ${ACCOUNT_IDENTITY_LOCK_NAMESPACE}::bigint
            )
          ) AS acquired
        `;
        return row?.acquired ?? false;
      });
      if (!acquired) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  } finally {
    await probe.end();
  }
  throw new Error(`Timed out waiting for account identity lock: ${userId}`);
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

    const adjustmentUser = creditTestUserId(8);
    await seedCreditTestUser(
      sql,
      adjustmentUser,
      `${scope}-billing-adjustment`
    );
    const paidGrant = await ledgers[0]!.grantCredits({
      userId: adjustmentUser,
      catalogId: "interview_pass",
      source: "checkout",
      sourceId: key("checkout-session"),
      idempotencyKey: key("paid-grant"),
      includedCredits: 1,
      expiresAt: null,
    });
    const [payment] = await sql<{ id: string }[]>`
      INSERT INTO payment_history (
        user_id, stripe_payment_intent_id, stripe_checkout_session_id,
        credit_grant_id, catalog_id, amount_in_cents, currency, status
      ) VALUES (
        ${adjustmentUser}::uuid, ${key("pi")}, ${key("checkout-session")},
        ${paidGrant.grant.id}::uuid, 'interview_pass', 900, 'usd', 'succeeded'
      ) RETURNING id
    `;
    assert.ok(payment?.id);
    await ledgers[0]!.reserveCredit({
      userId: adjustmentUser,
      reservationKey: key("adjustment-reservation"),
      credits: 1,
    });
    const adjustmentBase = {
      userId: adjustmentUser,
      paymentHistoryId: payment.id,
      grantIdempotencyKey: key("paid-grant"),
      providerAdjustmentId: key("refund-object"),
      adjustmentType: "refund" as const,
      amountInCents: 900,
      sourcePaymentAmountInCents: 900,
      currency: "usd",
    };
    const withdrawalAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.revokePaidGrant({
            ...adjustmentBase,
            stripeEventId: key(`refund-delivery:${index}`),
          })
      )
    );
    assert.equal(rejected(withdrawalAttempts).length, 0);
    const secondAdjustmentBase = {
      ...adjustmentBase,
      providerAdjustmentId: key("second-refund-object"),
    };
    await ledgers[0]!.revokePaidGrant({
      ...secondAdjustmentBase,
      stripeEventId: key("second-refund-delivery"),
    });
    await ledgers[0]!.releaseReservation({
      reservationKey: key("adjustment-reservation"),
      idempotencyKey: key("adjustment-release"),
    });
    const reinstatementAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reinstatePaidGrant({
            ...adjustmentBase,
            stripeEventId: key(`reinstatement-delivery:${index}`),
          })
      )
    );
    assert.equal(rejected(reinstatementAttempts).length, 0);
    const [transferredState] = await sql<
      {
        remaining: number;
        revocation_key: string | null;
        payment_status: string;
      }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        grant_row.revocation_key,
        payment.status AS payment_status
      FROM credit_grant grant_row
      JOIN payment_history payment ON payment.credit_grant_id = grant_row.id
      WHERE grant_row.id = ${paidGrant.grant.id}::uuid
    `;
    assert.deepEqual(transferredState, {
      remaining: 0,
      revocation_key: `payment:${payment.id}`,
      payment_status: "refunded",
    });
    const secondReinstatementAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reinstatePaidGrant({
            ...secondAdjustmentBase,
            stripeEventId: key(`second-reinstatement-delivery:${index}`),
          })
      )
    );
    assert.equal(rejected(secondReinstatementAttempts).length, 0);
    const [adjustmentState] = await sql<
      {
        remaining: number;
        reserved: number;
        revoked_at: Date | null;
        adjustment_rows: number;
        adjustment_transactions: number;
        payment_status: string;
      }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        grant_row.reserved_credits::int AS reserved,
        grant_row.revoked_at,
        (SELECT count(*)::int FROM billing_adjustment
          WHERE user_id = ${adjustmentUser}::uuid) AS adjustment_rows,
        (SELECT count(*)::int FROM credit_transaction
          WHERE user_id = ${adjustmentUser}::uuid AND type = 'adjustment')
          AS adjustment_transactions,
        (SELECT status FROM payment_history WHERE id = ${payment.id}::uuid)
          AS payment_status
      FROM credit_grant grant_row
      WHERE grant_row.id = ${paidGrant.grant.id}::uuid
    `;
    assert.deepEqual(adjustmentState, {
      remaining: 1,
      reserved: 0,
      revoked_at: null,
      adjustment_rows: 4,
      adjustment_transactions: 1,
      payment_status: "succeeded",
    });
    await assert.rejects(
      () => sql`
        UPDATE billing_adjustment
        SET metadata = jsonb_build_object('rewritten', true)
        WHERE user_id = ${adjustmentUser}::uuid
      `,
      /billing adjustment evidence is immutable/
    );

    const partialUser = creditTestUserId(9);
    await seedCreditTestUser(sql, partialUser, `${scope}-partial-adjustment`);
    const partialGrant = await ledgers[0]!.grantCredits({
      userId: partialUser,
      catalogId: "starter",
      source: "subscription_renewal",
      sourceId: key("partial-invoice"),
      idempotencyKey: key("partial-paid-grant"),
      includedCredits: 4,
      expiresAt: null,
    });
    const [partialPayment] = await sql<{ id: string }[]>`
      INSERT INTO payment_history (
        user_id, stripe_payment_intent_id, stripe_invoice_id,
        credit_grant_id, catalog_id, amount_in_cents, currency, status
      ) VALUES (
        ${partialUser}::uuid, ${key("partial-pi")}, ${key("partial-invoice")},
        ${partialGrant.grant.id}::uuid, 'starter', 1900, 'usd', 'succeeded'
      ) RETURNING id
    `;
    assert.ok(partialPayment?.id);
    await ledgers[0]!.reserveCredit({
      userId: partialUser,
      reservationKey: key("partial-consumed"),
      credits: 1,
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("partial-consumed"),
      idempotencyKey: key("partial-consume"),
    });
    await ledgers[0]!.reserveCredit({
      userId: partialUser,
      reservationKey: key("partial-active"),
      credits: 2,
    });
    const partialBase = {
      userId: partialUser,
      paymentHistoryId: partialPayment.id,
      grantIdempotencyKey: key("partial-paid-grant"),
      adjustmentType: "refund" as const,
      amountInCents: 950,
      sourcePaymentAmountInCents: 1900,
      currency: "usd",
    };
    await ledgers[0]!.revokePaidGrant({
      ...partialBase,
      stripeEventId: key("partial-a"),
      providerAdjustmentId: key("partial-refund-a"),
    });
    await ledgers[0]!.revokePaidGrant({
      ...partialBase,
      stripeEventId: key("partial-b"),
      providerAdjustmentId: key("partial-refund-b"),
    });
    await ledgers[0]!.releaseReservation({
      reservationKey: key("partial-active"),
      idempotencyKey: key("partial-release"),
    });
    const partialFirstReinstatements = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reinstatePaidGrant({
            ...partialBase,
            stripeEventId: key(`partial-a-reinstate:${index}`),
            providerAdjustmentId: key("partial-refund-a"),
          })
      )
    );
    assert.equal(rejected(partialFirstReinstatements).length, 0);
    const [partialIntermediate] = await sql<
      {
        remaining: number;
        revoked_at: Date | null;
        payment_status: string;
      }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        grant_row.revoked_at,
        payment.status AS payment_status
      FROM credit_grant grant_row
      JOIN payment_history payment ON payment.credit_grant_id = grant_row.id
      WHERE grant_row.id = ${partialGrant.grant.id}::uuid
    `;
    assert.deepEqual(partialIntermediate, {
      remaining: 2,
      revoked_at: null,
      payment_status: "partially_refunded",
    });
    const partialSecondReinstatements = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reinstatePaidGrant({
            ...partialBase,
            stripeEventId: key(`partial-b-reinstate:${index}`),
            providerAdjustmentId: key("partial-refund-b"),
          })
      )
    );
    assert.equal(rejected(partialSecondReinstatements).length, 0);
    const [partialFinal] = await sql<
      { remaining: number; payment_status: string; adjustment_rows: number }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        payment.status AS payment_status,
        (SELECT count(*)::int FROM billing_adjustment
          WHERE user_id = ${partialUser}::uuid) AS adjustment_rows
      FROM credit_grant grant_row
      JOIN payment_history payment ON payment.credit_grant_id = grant_row.id
      WHERE grant_row.id = ${partialGrant.grant.id}::uuid
    `;
    assert.deepEqual(partialFinal, {
      remaining: 3,
      payment_status: "succeeded",
      adjustment_rows: 4,
    });

    const overlapUser = creditTestUserId(10);
    await seedCreditTestUser(
      sql,
      overlapUser,
      `${scope}-overlapping-adjustments`
    );
    const overlapGrant = await ledgers[0]!.grantCredits({
      userId: overlapUser,
      catalogId: "starter",
      source: "subscription_renewal",
      sourceId: key("overlap-invoice"),
      idempotencyKey: key("overlap-paid-grant"),
      includedCredits: 4,
      expiresAt: null,
    });
    const [overlapPayment] = await sql<{ id: string }[]>`
      INSERT INTO payment_history (
        user_id, stripe_payment_intent_id, stripe_invoice_id,
        credit_grant_id, catalog_id, amount_in_cents, currency, status
      ) VALUES (
        ${overlapUser}::uuid, ${key("overlap-pi")}, ${key("overlap-invoice")},
        ${overlapGrant.grant.id}::uuid, 'starter', 1900, 'usd', 'succeeded'
      ) RETURNING id
    `;
    assert.ok(overlapPayment?.id);
    await ledgers[0]!.reserveCredit({
      userId: overlapUser,
      reservationKey: key("overlap-consumed"),
      credits: 3,
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("overlap-consumed"),
      idempotencyKey: key("overlap-consume"),
    });
    const overlapBase = {
      userId: overlapUser,
      paymentHistoryId: overlapPayment.id,
      grantIdempotencyKey: key("overlap-paid-grant"),
      adjustmentType: "refund" as const,
      amountInCents: 950,
      sourcePaymentAmountInCents: 1900,
      currency: "usd",
    };
    for (const providerAdjustmentId of [
      key("overlap-refund-a"),
      key("overlap-refund-b"),
    ]) {
      await ledgers[0]!.revokePaidGrant({
        ...overlapBase,
        stripeEventId: `${providerAdjustmentId}:withdraw`,
        providerAdjustmentId,
      });
    }
    await ledgers[0]!.reinstatePaidGrant({
      ...overlapBase,
      stripeEventId: key("overlap-a-reinstate"),
      providerAdjustmentId: key("overlap-refund-a"),
    });
    await ledgers[0]!.revokePaidGrant({
      ...overlapBase,
      stripeEventId: key("overlap-c-withdraw"),
      providerAdjustmentId: key("overlap-refund-c"),
    });
    const overlapReinstatementAttempts = await runConcurrently(
      ledgers.map(
        (ledger, index) => () =>
          ledger.reinstatePaidGrant({
            ...overlapBase,
            stripeEventId: key(`overlap-b-reinstate:${index}`),
            providerAdjustmentId: key("overlap-refund-b"),
          })
      )
    );
    assert.equal(rejected(overlapReinstatementAttempts).length, 0);
    const [overlapState] = await sql<
      {
        remaining: number;
        revoked_at: Date | null;
        target: number;
        revoked: number;
        unrecoverable: number;
        consumed: number;
        grant_evidence: number;
        allocation_evidence: number;
      }[]
    >`
      SELECT grant_row.remaining_credits::int AS remaining,
        grant_row.revoked_at,
        state.target_credits::int AS target,
        state.revoked_credits::int AS revoked,
        state.unrecoverable_credits::int AS unrecoverable,
        state.consumed_credits::int AS consumed,
        jsonb_array_length(state.grant_revocations)::int AS grant_evidence,
        jsonb_array_length(state.allocation_revocations)::int
          AS allocation_evidence
      FROM credit_grant grant_row
      JOIN billing_payment_state state
        ON state.credit_grant_id = grant_row.id
      WHERE grant_row.id = ${overlapGrant.grant.id}::uuid
    `;
    assert.deepEqual(overlapState, {
      remaining: 1,
      revoked_at: null,
      target: 2,
      revoked: 0,
      unrecoverable: 2,
      consumed: 2,
      grant_evidence: 0,
      allocation_evidence: 0,
    });

    for (const [offset, firstProvider] of [
      [11, "a"],
      [12, "b"],
    ] as const) {
      const frozenUser = creditTestUserId(offset);
      await seedCreditTestUser(
        sql,
        frozenUser,
        `${scope}-refunded-frozen-${firstProvider}`
      );
      const frozenGrant = await ledgers[0]!.grantCredits({
        userId: frozenUser,
        catalogId: "interview_pass",
        source: "checkout",
        sourceId: key(`frozen-checkout-${firstProvider}`),
        idempotencyKey: key(`frozen-grant-${firstProvider}`),
        includedCredits: 1,
        expiresAt: null,
      });
      const [frozenPayment] = await sql<{ id: string }[]>`
        INSERT INTO payment_history (
          user_id, stripe_payment_intent_id, stripe_checkout_session_id,
          credit_grant_id, catalog_id, amount_in_cents, currency, status
        ) VALUES (
          ${frozenUser}::uuid, ${key(`frozen-pi-${firstProvider}`)},
          ${key(`frozen-checkout-${firstProvider}`)},
          ${frozenGrant.grant.id}::uuid, 'interview_pass', 900, 'usd',
          'succeeded'
        ) RETURNING id
      `;
      assert.ok(frozenPayment?.id);
      const reservationKey = key(`frozen-reservation-${firstProvider}`);
      await ledgers[0]!.reserveCredit({
        userId: frozenUser,
        reservationKey,
      });
      const frozenBase = {
        userId: frozenUser,
        paymentHistoryId: frozenPayment.id,
        grantIdempotencyKey: key(`frozen-grant-${firstProvider}`),
        adjustmentType: "refund" as const,
        amountInCents: 900,
        sourcePaymentAmountInCents: 900,
        currency: "usd",
      };
      for (const provider of ["a", "b"] as const) {
        if (provider === "b") {
          await ledgers[0]!.consumeReservation({
            reservationKey,
            idempotencyKey: key(`frozen-consume-${firstProvider}`),
          });
        }
        await ledgers[0]!.revokePaidGrant({
          ...frozenBase,
          stripeEventId: key(`frozen-${firstProvider}-${provider}-withdraw`),
          providerAdjustmentId: key(`frozen-${firstProvider}-${provider}`),
        });
      }
      await ledgers[0]!.refundReservation({
        reservationKey,
        idempotencyKey: key(`frozen-refund-${firstProvider}`),
      });
      const secondProvider = firstProvider === "a" ? "b" : "a";
      await ledgers[0]!.reinstatePaidGrant({
        ...frozenBase,
        stripeEventId: key(`frozen-${firstProvider}-first-reinstate`),
        providerAdjustmentId: key(`frozen-${firstProvider}-${firstProvider}`),
      });
      const [frozenIntermediate] = await sql<
        { remaining: number; target: number; unrecoverable: number }[]
      >`
        SELECT grant_row.remaining_credits::int AS remaining,
          state.target_credits::int AS target,
          state.unrecoverable_credits::int AS unrecoverable
        FROM credit_grant grant_row
        JOIN billing_payment_state state
          ON state.credit_grant_id = grant_row.id
        WHERE grant_row.id = ${frozenGrant.grant.id}::uuid
      `;
      assert.deepEqual(frozenIntermediate, {
        remaining: 0,
        target: 1,
        unrecoverable: 1,
      });
      await ledgers[0]!.reinstatePaidGrant({
        ...frozenBase,
        stripeEventId: key(`frozen-${firstProvider}-second-reinstate`),
        providerAdjustmentId: key(`frozen-${firstProvider}-${secondProvider}`),
      });
      const [frozenFinal] = await sql<
        {
          remaining: number;
          revoked_at: Date | null;
          target: number;
          revoked: number;
          unrecoverable: number;
        }[]
      >`
        SELECT grant_row.remaining_credits::int AS remaining,
          grant_row.revoked_at,
          state.target_credits::int AS target,
          state.revoked_credits::int AS revoked,
          state.unrecoverable_credits::int AS unrecoverable
        FROM credit_grant grant_row
        JOIN billing_payment_state state
          ON state.credit_grant_id = grant_row.id
        WHERE grant_row.id = ${frozenGrant.grant.id}::uuid
      `;
      assert.deepEqual(frozenFinal, {
        remaining: 0,
        revoked_at: null,
        target: 0,
        revoked: 0,
        unrecoverable: 0,
      });
    }

    const pooledUser = creditTestUserId(13);
    await seedCreditTestUser(sql, pooledUser, `${scope}-pooled-rollover`);
    const pooledGrantAKey = key("pooled-grant-a");
    const pooledGrantBKey = key("pooled-grant-b");
    const pooledGrantA = await ledgers[0]!.grantCredits({
      userId: pooledUser,
      catalogId: "starter",
      source: "subscription_renewal",
      sourceId: key("pooled-invoice-a"),
      idempotencyKey: pooledGrantAKey,
      includedCredits: 4,
      expiresAt: null,
    });
    const [pooledPaymentA] = await sql<{ id: string }[]>`
      INSERT INTO payment_history (
        user_id, stripe_payment_intent_id, stripe_invoice_id,
        credit_grant_id, catalog_id, amount_in_cents, currency, status
      ) VALUES (
        ${pooledUser}::uuid, ${key("pooled-pi-a")},
        ${key("pooled-invoice-a")}, ${pooledGrantA.grant.id}::uuid,
        'starter', 1900, 'usd', 'succeeded'
      ) RETURNING id
    `;
    assert.ok(pooledPaymentA?.id);
    await ledgers[0]!.reserveCredit({
      userId: pooledUser,
      reservationKey: key("pooled-consume-a"),
      credits: 3,
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("pooled-consume-a"),
      idempotencyKey: key("pooled-consume-a-terminal"),
    });
    const temporaryPooledDispute = {
      userId: pooledUser,
      paymentHistoryId: pooledPaymentA.id,
      grantIdempotencyKey: pooledGrantAKey,
      providerAdjustmentId: key("pooled-temporary-dispute"),
      adjustmentType: "dispute" as const,
      amountInCents: 1900,
      sourcePaymentAmountInCents: 1900,
      currency: "usd",
    };
    await ledgers[0]!.revokePaidGrant({
      ...temporaryPooledDispute,
      stripeEventId: key("pooled-temporary-withdraw"),
    });
    const pooledGrantB = await ledgers[0]!.grantCredits({
      userId: pooledUser,
      catalogId: "starter",
      source: "subscription_renewal",
      sourceId: key("pooled-invoice-b"),
      idempotencyKey: pooledGrantBKey,
      includedCredits: 4,
      expiresAt: null,
    });
    const [pooledPaymentB] = await sql<{ id: string }[]>`
      INSERT INTO payment_history (
        user_id, stripe_payment_intent_id, stripe_invoice_id,
        credit_grant_id, catalog_id, amount_in_cents, currency, status
      ) VALUES (
        ${pooledUser}::uuid, ${key("pooled-pi-b")},
        ${key("pooled-invoice-b")}, ${pooledGrantB.grant.id}::uuid,
        'starter', 1900, 'usd', 'succeeded'
      ) RETURNING id
    `;
    assert.ok(pooledPaymentB?.id);
    await ledgers[0]!.reserveCredit({
      userId: pooledUser,
      reservationKey: key("pooled-consume-b"),
      credits: 3,
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("pooled-consume-b"),
      idempotencyKey: key("pooled-consume-b-terminal"),
    });
    await ledgers[0]!.reinstatePaidGrant({
      ...temporaryPooledDispute,
      stripeEventId: key("pooled-temporary-reinstate"),
    });
    const pooledRenewal = await ledgers[0]!.renewSubscriptionCredits({
      userId: pooledUser,
      catalogId: "starter",
      sourceId: key("pooled-invoice-c"),
      renewalIdempotencyKey: key("pooled-grant-c"),
      rolloverIdempotencyKey: key("pooled-rollover-c"),
    });
    assert.equal(pooledRenewal.rolledCredits, 2);
    await ledgers[0]!.reserveCredit({
      userId: pooledUser,
      reservationKey: key("pooled-consume-rollover"),
    });
    await ledgers[0]!.consumeReservation({
      reservationKey: key("pooled-consume-rollover"),
      idempotencyKey: key("pooled-consume-rollover-terminal"),
    });

    const pooledRefundA = {
      userId: pooledUser,
      paymentHistoryId: pooledPaymentA.id,
      grantIdempotencyKey: pooledGrantAKey,
      stripeEventId: key("pooled-refund-a"),
      providerAdjustmentId: key("pooled-refund-object-a"),
      adjustmentType: "refund" as const,
      amountInCents: 1900,
      sourcePaymentAmountInCents: 1900,
      currency: "usd",
    };
    const pooledRefundB = {
      ...pooledRefundA,
      paymentHistoryId: pooledPaymentB.id,
      grantIdempotencyKey: pooledGrantBKey,
      stripeEventId: key("pooled-refund-b"),
      providerAdjustmentId: key("pooled-refund-object-b"),
    };
    const pooledRefundResults = await runConcurrently([
      () => ledgers[1]!.revokePaidGrant(pooledRefundA),
      () => ledgers[2]!.revokePaidGrant(pooledRefundB),
      () => ledgers[3]!.revokePaidGrant(pooledRefundA),
      () => ledgers[4]!.revokePaidGrant(pooledRefundB),
    ]);
    assert.equal(
      rejected(pooledRefundResults).length,
      0,
      rejected(pooledRefundResults)
        .map(({ reason }) => errorMessage(reason))
        .join(" | ")
    );
    const [pooledTruth] = await sql<
      {
        available: number;
        revoked: number;
        unrecoverable: number;
        consumed_lot_credits: number;
      }[]
    >`
      SELECT
        (SELECT COALESCE(sum(remaining_credits), 0)::int
          FROM credit_grant
          WHERE user_id = ${pooledUser}::uuid
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > ${ledgerNow.toISOString()}::timestamptz))
          AS available,
        (SELECT sum(revoked_credits)::int FROM billing_payment_state
          WHERE credit_grant_id IN (
            ${pooledGrantA.grant.id}::uuid, ${pooledGrantB.grant.id}::uuid
          )) AS revoked,
        (SELECT sum(unrecoverable_credits)::int FROM billing_payment_state
          WHERE credit_grant_id IN (
            ${pooledGrantA.grant.id}::uuid, ${pooledGrantB.grant.id}::uuid
          )) AS unrecoverable,
        (SELECT sum(consumed_credits)::int FROM credit_rollover_lot
          WHERE source_grant_id IN (
            ${pooledGrantA.grant.id}::uuid, ${pooledGrantB.grant.id}::uuid
          )) AS consumed_lot_credits
    `;
    assert.deepEqual(pooledTruth, {
      available: 4,
      revoked: 1,
      unrecoverable: 7,
      consumed_lot_credits: 1,
    });
    const pooledPreflight = runPreflight(databaseUrl, true, "reconciled")!;
    const billingIntegrity = (
      pooledPreflight as MigrationPreflightResult & {
        billingAdjustmentIntegrity: Record<string, number>;
      }
    ).billingAdjustmentIntegrity;
    assert.equal(
      billingIntegrity["rollover_lot_balance_mismatches"],
      scope === "upgrade" ? 2 : 0
    );
    assert.ok(
      Object.entries(billingIntegrity).every(
        ([keyName, count]) =>
          keyName === "rollover_lot_balance_mismatches" || count === 0
      ),
      JSON.stringify(billingIntegrity)
    );
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
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  return cause instanceof Error
    ? `${error.message}: ${cause.message}`
    : error.message;
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
    INSERT INTO user_achievement (user_id, achievement_id)
    VALUES (${USER_TWO}::uuid, 'legacy_first_interview')
  `;
  await sql`
    INSERT INTO interview_session (
      id, user_id, round_type, mode, status, lifecycle_state,
      livekit_room_name, activated_at, start_contract_version,
      start_attempt_id, start_request_fingerprint, provisioning_state,
      provisioned_at
    ) VALUES (
      ${SESSION_DELETION_MARKER}::uuid,
      ${USER_TWO}::uuid,
      'product_sense',
      'voice_video',
      'in_progress',
      'active',
      ${`interview-${SESSION_DELETION_MARKER}`},
      now(),
      1,
      ${SESSION_DELETION_MARKER}::uuid,
      ${"d".repeat(64)},
      'ready',
      now()
    )
  `;
  await sql`
    INSERT INTO credit_reservation (
      user_id, reservation_key, status, credits, session_id,
      start_contract_version, start_attempt_id, expires_at
    ) VALUES (
      ${USER_TWO}::uuid,
      ${`interview-start:${USER_TWO}:${SESSION_DELETION_MARKER}`},
      'active',
      1,
      ${SESSION_DELETION_MARKER}::uuid,
      1,
      ${SESSION_DELETION_MARKER}::uuid,
      now() + interval '1 hour'
    )
  `;
  await sql`
    INSERT INTO transcript_runtime_writer (
      session_id, generation, contract_version, room_name, writer_id,
      registered_at
    ) VALUES (
      ${SESSION_DELETION_MARKER}::uuid,
      1,
      1,
      ${`interview-${SESSION_DELETION_MARKER}`},
      'deletion-marker-writer',
      now()
    )
  `;
  await sql`
    UPDATE interview_session
    SET lifecycle_state = 'ending',
      lifecycle_version = 2,
      terminal_reason = 'user_end',
      ending_at = date_trunc('milliseconds', clock_timestamp())
    WHERE id = ${SESSION_DELETION_MARKER}::uuid
  `;
  await sql`
    INSERT INTO transcript_runtime_settlement_command (
      session_id, lifecycle_version, contract_version, command_id,
      room_name, writer_id, writer_generation, cutoff_at, expires_at
    )
    SELECT id, lifecycle_version, 1,
      ${`runtime-settlement:${SESSION_DELETION_MARKER}:2`},
      livekit_room_name, 'deletion-marker-writer', 1, ending_at,
      ending_at + interval '20 seconds'
    FROM interview_session
    WHERE id = ${SESSION_DELETION_MARKER}::uuid
  `;
  await sql`
    INSERT INTO transcript_interruption_marker (
      session_id, contract_version, event_id, writer_id, writer_generation,
      sequence, room_name, speaker, occurred_at, reason
    ) VALUES (
      ${SESSION_DELETION_MARKER}::uuid,
      1,
      'deletion-marker-event',
      'deletion-marker-writer',
      1,
      1,
      ${`interview-${SESSION_DELETION_MARKER}`},
      'interviewer',
      now(),
      'no_provider_confirmed_prefix'
    )
  `;
  await sql`
    INSERT INTO transcript_runtime_settlement (
      session_id, writer_generation, contract_version, room_name, writer_id,
      state, settled_at
    ) VALUES (
      ${SESSION_DELETION_MARKER}::uuid,
      1,
      1,
      ${`interview-${SESSION_DELETION_MARKER}`},
      'deletion-marker-writer',
      'degraded',
      now()
    )
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
  const privateCustomerFingerprint = deletionRequest.stripeSubjects.find(
    (subject) => subject.providerId === "cus_private"
  )?.fingerprint;
  assert.ok(privateCustomerFingerprint);
  await sql`
    INSERT INTO stripe_event_log (
      stripe_event_id, event_type, subject_fingerprint,
      subject_fingerprints, payload, status, attempts, last_error
    ) VALUES (
      'evt_private',
      'customer.subscription.deleted',
      ${privateCustomerFingerprint},
      ${JSON.stringify([privateCustomerFingerprint])}::jsonb,
      ${JSON.stringify({ data: { object: { customer: "cus_private" } } })},
      'failed',
      1,
      'user@example.invalid'
    )
  `;
  const [triggerRedaction] = await sql<
    Array<{ payload: string; last_error: string | null }>
  >`
    SELECT payload, last_error FROM stripe_event_log
    WHERE stripe_event_id = 'evt_private'
  `;
  assert.deepEqual(triggerRedaction, { payload: "{}", last_error: null });
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
      user_achievement_exists: boolean;
      tombstone_exists: boolean;
      raw_provider_ids: number;
      provider_fingerprints: number;
      deletion_status: string;
      redacted_payload: string;
      redacted_error: string | null;
      interruption_markers: number;
      runtime_settlements: number;
      runtime_settlement_commands: number;
      reservations: number;
      runtime_writers: number;
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
        SELECT 1 FROM user_achievement
        WHERE user_id = ${USER_TWO}::uuid
      ) AS user_achievement_exists,
      EXISTS (
        SELECT 1 FROM account_deletion_request
        WHERE user_id = ${USER_TWO}::uuid
      ) AS tombstone_exists,
      (SELECT count(*)::int FROM transcript_interruption_marker
        WHERE session_id = ${SESSION_DELETION_MARKER}::uuid)
        AS interruption_markers,
      (SELECT count(*)::int FROM transcript_runtime_settlement
        WHERE session_id = ${SESSION_DELETION_MARKER}::uuid)
        AS runtime_settlements,
      (SELECT count(*)::int FROM transcript_runtime_settlement_command
        WHERE session_id = ${SESSION_DELETION_MARKER}::uuid)
        AS runtime_settlement_commands,
      (SELECT count(*)::int FROM credit_reservation
        WHERE user_id = ${USER_TWO}::uuid) AS reservations,
      (SELECT count(*)::int FROM transcript_runtime_writer
        WHERE session_id = ${SESSION_DELETION_MARKER}::uuid)
        AS runtime_writers,
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
    user_achievement_exists: false,
    tombstone_exists: true,
    interruption_markers: 0,
    runtime_settlements: 0,
    runtime_settlement_commands: 0,
    reservations: 0,
    runtime_writers: 0,
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

async function verifyDeletionWebhookConcurrency(
  sql: postgres.Sql,
  cleanUrl: string
) {
  const writer = postgres(cleanUrl, { max: 1, prepare: false });
  const fingerprintA = "a".repeat(64);
  const fingerprintB = "b".repeat(64);
  let releaseFirst!: () => void;
  let firstLocked!: () => void;
  const release = new Promise<void>((resolve) => (releaseFirst = resolve));
  const locked = new Promise<void>((resolve) => (firstLocked = resolve));

  try {
    const tombstoneFirst = sql.begin(async (tx) => {
      await tx`
        INSERT INTO account_deletion_request (user_id, stripe_subjects)
        VALUES ('12121212-1212-4212-8212-121212121212'::uuid,
          jsonb_build_array(jsonb_build_object(
            'kind', 'customer', 'providerId', NULL,
            'fingerprint', ${fingerprintA}::text
          )))
      `;
      firstLocked();
      await release;
    });
    await locked;
    let eventCommitted = false;
    const eventSecond = writer`
      INSERT INTO stripe_event_log (
        stripe_event_id, event_type, subject_fingerprint,
        subject_fingerprints, payload, status, attempts, last_error
      ) VALUES (
        'evt_deletion_race_tombstone_first', 'charge.refunded',
        ${fingerprintA}, jsonb_build_array(${fingerprintA}::text),
        '{"secret":"must-not-persist"}', 'failed', 1, 'private error'
      )
    `.then(
      () => {
        eventCommitted = true;
        return { ok: true as const };
      },
      (error) => ({ ok: false as const, error })
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(eventCommitted, false);
    releaseFirst();
    const [, eventAttempt] = await Promise.all([tombstoneFirst, eventSecond]);
    if (!eventAttempt.ok) {
      assert.match(
        errorMessage(eventAttempt.error),
        /stripe_deletion_redaction_retry/
      );
      await writer`
        INSERT INTO stripe_event_log (
          stripe_event_id, event_type, subject_fingerprint,
          subject_fingerprints, payload, status, attempts, last_error
        ) VALUES (
          'evt_deletion_race_tombstone_first', 'charge.refunded',
          ${fingerprintA}, jsonb_build_array(${fingerprintA}::text),
          '{"secret":"must-not-persist"}', 'failed', 1, 'private error'
        )
      `;
    }

    let releaseWebhook!: () => void;
    let webhookLocked!: () => void;
    const releaseWebhookTransaction = new Promise<void>(
      (resolve) => (releaseWebhook = resolve)
    );
    const webhookHasLock = new Promise<void>(
      (resolve) => (webhookLocked = resolve)
    );
    const webhookFirst = sql.begin(async (tx) => {
      await tx`
        INSERT INTO stripe_event_log (
          stripe_event_id, event_type, subject_fingerprint,
          subject_fingerprints, payload, status, attempts, last_error
        ) VALUES (
          'evt_deletion_race_webhook_first', 'charge.refunded',
          ${fingerprintB}, jsonb_build_array(${fingerprintB}::text),
          '{"secret":"must-be-redacted"}', 'failed', 1, 'private error'
        )
      `;
      webhookLocked();
      await releaseWebhookTransaction;
    });
    await webhookHasLock;
    let deletionCommitted = false;
    const deletionSecond = writer
      .begin(async (tx) => {
        await tx`
        INSERT INTO account_deletion_request (user_id, stripe_subjects)
        VALUES ('34343434-3434-4434-8434-343434343434'::uuid,
          jsonb_build_array(jsonb_build_object(
            'kind', 'customer', 'providerId', NULL,
            'fingerprint', ${fingerprintB}::text
          )))
      `;
        await tx`
        UPDATE stripe_event_log
        SET payload = '{}', last_error = NULL
        WHERE subject_fingerprint = ${fingerprintB}
           OR subject_fingerprints ? ${fingerprintB}
      `;
      })
      .then(
        () => {
          deletionCommitted = true;
          return { ok: true as const };
        },
        (error) => ({ ok: false as const, error })
      );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(deletionCommitted, false);
    releaseWebhook();
    const [, deletionAttempt] = await Promise.all([
      webhookFirst,
      deletionSecond,
    ]);
    if (!deletionAttempt.ok) {
      assert.match(
        errorMessage(deletionAttempt.error),
        /stripe_deletion_redaction_retry/
      );
      await writer.begin(async (tx) => {
        await tx`
          INSERT INTO account_deletion_request (user_id, stripe_subjects)
          VALUES ('34343434-3434-4434-8434-343434343434'::uuid,
            jsonb_build_array(jsonb_build_object(
              'kind', 'customer', 'providerId', NULL,
              'fingerprint', ${fingerprintB}::text
            )))
        `;
        await tx`
          UPDATE stripe_event_log
          SET payload = '{}', last_error = NULL
          WHERE subject_fingerprint = ${fingerprintB}
             OR subject_fingerprints ? ${fingerprintB}
        `;
      });
    }

    const fingerprintC = "c".repeat(64);
    await sql`
      INSERT INTO stripe_event_log (
        stripe_event_id, event_type, subject_fingerprint,
        subject_fingerprints, payload, status, attempts, last_error
      ) VALUES (
        'evt_deletion_partial_overlap', 'charge.refunded',
        ${fingerprintA},
        jsonb_build_array(${fingerprintA}::text, ${fingerprintC}::text),
        '{"secret":"partial-overlap"}', 'failed', 1, 'private error'
      )
    `;
    let rowLocked!: () => void;
    let deletionLocked!: () => void;
    const rowHasLock = new Promise<void>((resolve) => (rowLocked = resolve));
    const deletionHasLock = new Promise<void>(
      (resolve) => (deletionLocked = resolve)
    );
    const partialWebhook = writer.begin(async (tx) => {
      await tx`
        SELECT id FROM stripe_event_log
        WHERE stripe_event_id = 'evt_deletion_partial_overlap'
        FOR UPDATE
      `;
      rowLocked();
      await deletionHasLock;
      await tx`
        UPDATE stripe_event_log
        SET attempts = attempts + 1,
          subject_fingerprints = subject_fingerprints
        WHERE stripe_event_id = 'evt_deletion_partial_overlap'
      `;
    });
    await rowHasLock;
    const partialDeletion = sql.begin(async (tx) => {
      await tx`
        INSERT INTO account_deletion_request (user_id, stripe_subjects)
        VALUES ('56565656-5656-4565-8565-565656565656'::uuid,
          jsonb_build_array(
            jsonb_build_object(
              'kind', 'customer', 'providerId', NULL,
              'fingerprint', ${fingerprintB}::text
            ),
            jsonb_build_object(
              'kind', 'customer', 'providerId', NULL,
              'fingerprint', ${fingerprintC}::text
            )
          ))
      `;
      deletionLocked();
      await tx`
        UPDATE stripe_event_log SET payload = '{}', last_error = NULL
        WHERE stripe_event_id = 'evt_deletion_partial_overlap'
      `;
    });
    const partialResults = await Promise.allSettled([
      partialWebhook,
      partialDeletion,
    ]);
    assert.equal(partialResults[0]?.status, "rejected");
    assert.match(
      errorMessage((partialResults[0] as PromiseRejectedResult).reason),
      /stripe_deletion_redaction_retry/
    );
    assert.equal(partialResults[1]?.status, "fulfilled");
    await writer`
      UPDATE stripe_event_log
      SET attempts = attempts + 1,
        subject_fingerprints = subject_fingerprints
      WHERE stripe_event_id = 'evt_deletion_partial_overlap'
    `;
    const rows = await sql<
      Array<{ payload: string; last_error: string | null }>
    >`
      SELECT payload, last_error
      FROM stripe_event_log
      WHERE stripe_event_id IN (
        'evt_deletion_race_tombstone_first',
        'evt_deletion_race_webhook_first',
        'evt_deletion_partial_overlap'
      )
      ORDER BY stripe_event_id
    `;
    assert.deepEqual(
      rows.map((row) => ({ ...row })),
      [
        { payload: "{}", last_error: null },
        { payload: "{}", last_error: null },
        { payload: "{}", last_error: null },
      ]
    );
  } finally {
    await writer.end();
  }
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

async function installContactTriageTestOperators(sql: postgres.Sql) {
  for (const role of [CONTACT_OPERATOR_ONE, CONTACT_OPERATOR_TWO]) {
    await sql.unsafe(`
      DO $$
      BEGIN
        CREATE ROLE ${role}
          LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await sql.unsafe(`
      ALTER ROLE ${role}
        LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS
        PASSWORD '${CONTACT_OPERATOR_TEST_PASSWORD}'
    `);
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT pg_has_role(
          '${role}', '${CONTACT_TRIAGE_ROLE}', 'MEMBER'
        ) THEN
          GRANT ${CONTACT_TRIAGE_ROLE} TO ${role};
        END IF;
      END $$
    `);
  }
}

async function assertContactTriageDenied(
  sql: postgres.Sql,
  role: "anon" | "authenticated" | "service_role",
  receiptId: string
) {
  for (const operation of [
    (tx: postgres.TransactionSql) =>
      tx`SELECT * FROM public.list_contact_submissions(10)`,
    (tx: postgres.TransactionSql) =>
      tx`SELECT * FROM public.read_contact_submission(${receiptId}::uuid)`,
    (tx: postgres.TransactionSql) =>
      tx`SELECT public.set_contact_submission_triage_state(
        ${receiptId}::uuid, 'claimed'
      )`,
  ]) {
    await assert.rejects(
      () => asRole(sql, role, operation),
      /permission denied/
    );
  }
}

async function asContactTriageOperator<T>(
  sql: postgres.Sql,
  operation: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${CONTACT_TRIAGE_ROLE}`);
    return operation(tx);
  }) as Promise<T>;
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
      questions: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM app_user) AS users,
      (SELECT count(*)::int FROM subscription) AS subscriptions,
      (SELECT count(*)::int FROM interview_session) AS sessions,
      (SELECT count(*)::int FROM interview_question) AS questions
  `;
  return rows[0];
}

function databaseUrl(url: string, database: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
}

function databaseUrlForRole(url: string, role: string): string {
  const next = new URL(url);
  next.username = role;
  next.password = CONTACT_OPERATOR_TEST_PASSWORD;
  return next.toString();
}
