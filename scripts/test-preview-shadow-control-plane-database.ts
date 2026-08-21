import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  type AdaptiveInterviewerPreviewShadowAuthorization,
} from "@meelni/agent";
import {
  createDurablePreviewShadowCohortStopEvent,
  createDurablePreviewShadowControlPlaneStore,
  createDurablePreviewShadowSessionReceipt,
  createDurablePreviewShadowStopIncompleteIncident,
  type DurablePreviewShadowControlPlaneStore,
  PreviewShadowControlPlaneError,
  verifyDurablePreviewShadowSessionLeaseAdmission,
} from "../lib/db/adaptive-interviewer-preview-shadow-control-plane";
import * as schema from "../lib/db/schema";
import {
  PREVIEW_SHADOW_OWNER_APPROVAL,
  PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
  PREVIEW_SHADOW_OWNER_ID,
  PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
  PREVIEW_SHADOW_OWNER_ROLE,
  previewShadowOwnerDecisionSignatureMessage,
  authenticatePreviewShadowOwnerDecision,
  type PreviewShadowOwnerDecisionArtifact,
  type PreviewShadowOwnerDecisionPayload,
  type PreviewShadowOwnerKeyRegistry,
} from "../lib/security/adaptive-interviewer-preview-shadow-owner-decision";

const MIGRATION = resolve(
  "lib/db/migrations/0043_sav_480_durable_preview_shadow_control_plane.sql"
);
const CANDIDATE_SHA = "5cf8e4f0c6e99cd41eaa582fa1e85fabc173e3be";
const KEY_ID = "sav-480-local-test-key";
const TABLES = [
  "adaptive_interviewer_preview_shadow_run",
  "adaptive_interviewer_preview_shadow_session_lease",
  "adaptive_interviewer_preview_shadow_session_receipt",
  "adaptive_interviewer_preview_shadow_stop_incomplete_incident",
  "adaptive_interviewer_preview_shadow_cohort_stop_event",
  "adaptive_interviewer_preview_shadow_termination_acknowledgement",
] as const;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const SENSITIVE_VALUES = new Set<string>();

type Database = ReturnType<typeof drizzle<typeof schema>>;

interface Fixture {
  authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  artifact: PreviewShadowOwnerDecisionArtifact;
  registry: PreviewShadowOwnerKeyRegistry;
  now: Date;
}

void main().catch((error) => {
  const message =
    error instanceof PreviewShadowControlPlaneError
      ? error.code
      : error instanceof Error
        ? error.message
        : "preview_shadow_database_test_failed";
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const databaseUrl = process.argv[2];
  if (!databaseUrl) {
    throw new Error("local *_test database URL argument is required");
  }
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.slice(1);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^[a-z0-9_]+_test$/.test(databaseName) ||
    databaseName === "postgres"
  ) {
    throw new Error(
      "database test requires an explicit loopback *_test target"
    );
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, prepare: false });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  const clients = Array.from({ length: 4 }, () =>
    postgres(databaseUrl, { max: 1, prepare: false })
  );
  try {
    await installMigration(clients[0]!);
    const databases = clients.map((client) => drizzle(client, { schema }));
    await verifyMigrationBoundaries(clients[0]!);
    await verifyActivationCasAndRestart(databases);
    await verifyActivationDatabaseClockAtLock(databases, clients);
    await verifyConcurrentLeaseAndUpwardReconciliation(databases, clients);
    await verifyRevokedLeaseIncidentReconciliation(databases);
    await verifyExpiredLeaseReplay(databases, clients[0]!);
    await verifyStopIncompleteRecovery(databases);
    await verifyDatabaseClockAtLock(databases, clients);
    await verifyDatabaseClockAtAllocationCompletion(databases[0]!, clients[0]!);
    await verifyTransactionRollback(databases[0]!, clients[0]!);
    await verifyGlobalReservationCap(databases[0]!);
    await verifyPrivacy(clients[0]!);
    console.log(
      "Preview-shadow durable control plane: 6 tables, activation CAS, concurrency, restart, replay, caps, recovery, and privacy green"
    );
  } finally {
    await Promise.all(clients.map((client) => client.end()));
    const cleanup = postgres(adminUrl.toString(), { max: 1, prepare: false });
    await cleanup.unsafe(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`
    );
    await cleanup.end();
  }
}

async function installMigration(client: postgres.Sql): Promise<void> {
  await client.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$
  `);
  await client`ALTER ROLE service_role BYPASSRLS`;
  const migration = (await readFile(MIGRATION, "utf8")).replaceAll(
    "--> statement-breakpoint",
    ""
  );
  await client.unsafe(migration);
}

async function verifyMigrationBoundaries(client: postgres.Sql): Promise<void> {
  const rls = await client<
    {
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }[]
  >`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname IN ${client(TABLES)}
    ORDER BY relname
  `;
  assert.equal(rls.length, TABLES.length);
  assert.ok(rls.every((row) => row.relrowsecurity && row.relforcerowsecurity));
  const forbiddenPolicies = await client<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM pg_policies
    WHERE tablename IN ${client(TABLES)}
  `;
  assert.equal(forbiddenPolicies[0]!.count, 0);
  const securityDefiners = await client<{ count: number }[]>`
    SELECT count(*)::integer AS count
    FROM pg_proc
    WHERE prosecdef AND proname LIKE '%preview_shadow%'
  `;
  assert.equal(securityDefiners[0]!.count, 0);

  const exactRelations = await client<
    { conname: string; definition: string }[]
  >`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname IN (
      'preview_shadow_lease_evidence_binding_uniq',
      'preview_shadow_receipt_exact_lease_fk',
      'preview_shadow_incident_exact_lease_fk',
      'preview_shadow_incident_ack_binding_uniq',
      'preview_shadow_ack_exact_incident_fk'
    )
    ORDER BY conname
  `;
  assert.equal(exactRelations.length, 5);
  assert.match(
    exactRelations.map((row) => `${row.conname}:${row.definition}`).join("\n"),
    /receipt_exact_lease_fk:[\s\S]*FOREIGN KEY \(run_id, lease_id, session_ordinal, allocation_ledger_revision, preview_shadow_configuration_sha256\)/
  );
  assert.match(
    exactRelations.map((row) => `${row.conname}:${row.definition}`).join("\n"),
    /ack_exact_incident_fk:[\s\S]*FOREIGN KEY \(run_id, lease_id, incident_id\)/
  );

  const grants = await client<{ table_name: string; privileges: string[] }[]>`
    SELECT table_name,
      array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE table_name IN ${client(TABLES)} AND grantee = 'service_role'
    GROUP BY table_name
    ORDER BY table_name
  `;
  assert.equal(grants.length, TABLES.length);
  for (const row of grants) {
    assert.deepEqual(
      row.privileges,
      [
        "adaptive_interviewer_preview_shadow_run",
        "adaptive_interviewer_preview_shadow_session_lease",
      ].includes(row.table_name)
        ? ["INSERT", "SELECT", "UPDATE"]
        : ["INSERT", "SELECT"]
    );
  }
  await client`SET ROLE authenticated`;
  await assert.rejects(
    () => client`SELECT count(*) FROM adaptive_interviewer_preview_shadow_run`,
    /permission denied/
  );
  await client`RESET ROLE`;
  await client`SET ROLE service_role`;
  await client`SELECT count(*) FROM adaptive_interviewer_preview_shadow_run`;
  await client`RESET ROLE`;
}

async function verifyActivationCasAndRestart(
  databases: Database[]
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "activation");
  const verified = verifyFixture(fixture);
  const runCapability = capability("activation-run");
  const stores = databases.map(createDurablePreviewShadowControlPlaneStore);
  const results = await Promise.all(
    stores.slice(0, 2).map((store) =>
      store.activate({
        authenticatedOwnerDecision: verified,
        runControlCapability: runCapability,
      })
    )
  );
  assert.deepEqual(results.map((result) => result.outcome).sort(), [
    "activated",
    "replayed",
  ]);
  assert.equal(results[0]!.run.run_id, results[1]!.run.run_id);
  await assertCode(
    () =>
      stores[0]!.activate({
        authenticatedOwnerDecision: {
          ...verified,
        } as typeof verified,
        runControlCapability: runCapability,
      }),
    "preview_shadow_control_plane_unauthenticated"
  );

  const restartedStore = createDurablePreviewShadowControlPlaneStore(
    databases[2]!
  );
  const restarted = await restartedStore.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: runCapability,
  });
  assert.equal(restarted.outcome, "replayed");
  await assertCode(
    () =>
      restartedStore.activate({
        authenticatedOwnerDecision: verifyFixture(fixture),
        runControlCapability: capability("divergent-run"),
      }),
    "preview_shadow_control_plane_conflict"
  );

  const postExpiry = await createFixture(
    databases[0]!,
    "post-expiry-replay",
    -60,
    3
  );
  const postExpiryCapability = capability("post-expiry-run");
  await restartedStore.activate({
    authenticatedOwnerDecision: verifyFixture(postExpiry),
    runControlCapability: postExpiryCapability,
  });
  await databases[0]!.execute(
    (await import("drizzle-orm")).sql`SELECT pg_sleep(3.1)`
  );
  const databaseAfterExpiry = await databaseNow(databases[0]!);
  const postExpiryReplay = await createDurablePreviewShadowControlPlaneStore(
    databases[3]!
  ).activate({
    authenticatedOwnerDecision: verifyFixture(postExpiry, databaseAfterExpiry),
    runControlCapability: postExpiryCapability,
  });
  assert.equal(postExpiryReplay.outcome, "replayed");
  await assertCode(
    () =>
      restartedStore.activate({
        authenticatedOwnerDecision: verifyFixture(
          postExpiry,
          databaseAfterExpiry
        ),
        runControlCapability: capability("post-expiry-divergent-run"),
      }),
    "preview_shadow_control_plane_conflict"
  );

  const expired = await createFixture(databases[0]!, "expired", -7_200, -3_600);
  const verifiedBeforeExpiry = verifyFixture(expired);
  await assertCode(
    () =>
      restartedStore.activate({
        authenticatedOwnerDecision: verifiedBeforeExpiry,
        runControlCapability: capability("expired-run"),
      }),
    "preview_shadow_control_plane_expired"
  );

  const nonceLeft = await createFixture(databases[0]!, "nonce-left");
  const nonceRight = resignFixture(
    await createFixture(databases[0]!, "nonce-right"),
    {
      authorization_nonce: nonceLeft.authorization.authorization_nonce,
    }
  );
  await assertOneActivationConflict([
    stores[0]!.activate({
      authenticatedOwnerDecision: verifyFixture(nonceLeft),
      runControlCapability: capability("nonce-left-run"),
    }),
    stores[1]!.activate({
      authenticatedOwnerDecision: verifyFixture(nonceRight),
      runControlCapability: capability("nonce-right-run"),
    }),
  ]);

  const referenceLeft = await createFixture(databases[0]!, "reference-left");
  const referenceRight = resignFixture(
    await createFixture(databases[0]!, "reference-right"),
    {
      owner_decision_reference:
        referenceLeft.authorization.owner_decision_reference,
    }
  );
  await assertOneActivationConflict([
    stores[2]!.activate({
      authenticatedOwnerDecision: verifyFixture(referenceLeft),
      runControlCapability: capability("reference-left-run"),
    }),
    stores[3]!.activate({
      authenticatedOwnerDecision: verifyFixture(referenceRight),
      runControlCapability: capability("reference-right-run"),
    }),
  ]);
}

async function verifyConcurrentLeaseAndUpwardReconciliation(
  databases: Database[],
  clients: postgres.Sql[]
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "reconcile");
  const stores = databases.map(createDurablePreviewShadowControlPlaneStore);
  const activated = await stores[0]!.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("reconcile-run"),
  });
  const runId = activated.run.run_id;
  await assertCode(
    () =>
      stores[0]!.allocateSessionLease({
        runId,
        expectedRevision: 0,
        sessionBindingSha256: sha("oversized-time-session"),
        expiresAt: "2".repeat(1_000_000),
        workerEvidenceCapability: capability("oversized-time-worker"),
        terminationCapability: capability("oversized-time-termination"),
      }),
    "preview_shadow_control_plane_invalid"
  );
  const expiresAt = new Date(fixture.now.getTime() + 1_800_000).toISOString();
  const sameRequest = {
    runId,
    expectedRevision: 0,
    sessionBindingSha256: sha("same-session"),
    expiresAt,
    workerEvidenceCapability: capability("same-worker"),
    terminationCapability: capability("same-termination"),
  };
  const same = (
    await Promise.all([
      stores[0]!.allocateSessionLease(sameRequest),
      stores[1]!.allocateSessionLease(sameRequest),
    ])
  ).map(executableAllocation);
  assert.deepEqual(same.map((result) => result.outcome).sort(), [
    "allocated",
    "replayed",
  ]);
  assert.equal(same[0]!.lease.lease_id, same[1]!.lease.lease_id);
  assert.deepEqual(
    await verifyDurablePreviewShadowSessionLeaseAdmission(databases[2]!, {
      lease: same[0]!.lease,
      workerEvidenceCapability: capability("same-worker"),
    }),
    same[0]!.lease
  );
  await verifyAdmissionUsesRunThenLeaseLockOrder(
    databases[1]!,
    clients,
    runId,
    same[0]!.lease,
    capability("same-worker")
  );
  await assertCode(
    () =>
      verifyDurablePreviewShadowSessionLeaseAdmission(databases[2]!, {
        lease: same[0]!.lease,
        workerEvidenceCapability: capability("wrong-admission-worker"),
      }),
    "preview_shadow_control_plane_unauthenticated"
  );
  await assertCode(
    () =>
      verifyDurablePreviewShadowSessionLeaseAdmission(databases[2]!, {
        lease: {
          ...same[0]!.lease,
          session_binding_sha256: sha("forged-admission-binding"),
        },
        workerEvidenceCapability: capability("same-worker"),
      }),
    "preview_shadow_control_plane_denied"
  );
  await assertCode(
    () =>
      stores[2]!.allocateSessionLease({
        ...sameRequest,
        expiresAt: new Date(fixture.now.getTime() + 1_700_000).toISOString(),
      }),
    "preview_shadow_control_plane_conflict"
  );

  await assertCode(
    () =>
      stores[2]!.allocateSessionLease({
        ...sameRequest,
        sessionBindingSha256: sha("stale-distinct"),
        workerEvidenceCapability: capability("stale-worker"),
        terminationCapability: capability("stale-termination"),
      }),
    "preview_shadow_control_plane_stale"
  );
  for (const [workerEvidenceCapability, terminationCapability] of [
    [capability("same-channel"), capability("same-channel")],
    [capability("reconcile-run"), capability("run-control-cross")],
    [capability("run-control-cross"), capability("reconcile-run")],
    [capability("same-termination"), capability("cross-lease-termination")],
  ] as const) {
    await assertCode(
      () =>
        stores[2]!.allocateSessionLease({
          ...sameRequest,
          expectedRevision: 1,
          sessionBindingSha256: sha(
            `cross-channel-${workerEvidenceCapability}-${terminationCapability}`
          ),
          workerEvidenceCapability,
          terminationCapability,
        }),
      "preview_shadow_control_plane_invalid"
    );
  }
  const second = executableAllocation(
    await stores[2]!.allocateSessionLease({
      ...sameRequest,
      expectedRevision: 1,
      sessionBindingSha256: sha("second-session"),
      workerEvidenceCapability: capability("second-worker"),
      terminationCapability: capability("second-termination"),
    })
  );
  assert.equal(second.lease.session_ordinal, 2);

  const stop = createDurablePreviewShadowCohortStopEvent({
    contract_version:
      "adaptive-interviewer-preview-shadow-cohort-stop-event.v1",
    run_id: runId,
    reason: "evidence_digest_drift",
    evidence_sha256: sha("stop-evidence"),
    observed_at: fixture.now.toISOString(),
  });
  await assertCode(
    () =>
      stores[0]!.recordCohortStopEvent({
        runId,
        expectedRevision: 2,
        runControlCapability: capability("wrong-reconcile-run"),
        event: stop,
      }),
    "preview_shadow_control_plane_unauthenticated"
  );
  const stopped = await stores[0]!.recordCohortStopEvent({
    runId,
    expectedRevision: 2,
    runControlCapability: capability("reconcile-run"),
    event: stop,
  });
  assert.equal(stopped.run.stopped, true);
  await assertCode(
    () =>
      verifyDurablePreviewShadowSessionLeaseAdmission(databases[2]!, {
        lease: same[0]!.lease,
        workerEvidenceCapability: capability("same-worker"),
      }),
    "preview_shadow_control_plane_denied"
  );
  const replayedStop = await stores[1]!.recordCohortStopEvent({
    runId,
    expectedRevision: 2,
    runControlCapability: capability("reconcile-run"),
    event: stop,
  });
  assert.equal(replayedStop.outcome, "replayed");
  const revokedReplay = await stores[1]!.allocateSessionLease(sameRequest);
  assert.deepEqual(
    {
      outcome: revokedReplay.outcome,
      state:
        revokedReplay.outcome === "replayed_closed"
          ? revokedReplay.lease_state
          : null,
      hasLease: Object.hasOwn(revokedReplay, "lease"),
    },
    { outcome: "replayed_closed", state: "revoked", hasLease: false }
  );
  await assertCode(
    () =>
      stores[1]!.recordCohortStopEvent({
        runId,
        expectedRevision: 3,
        runControlCapability: capability("reconcile-run"),
        event: stop,
      }),
    "preview_shadow_control_plane_conflict"
  );
  await assertCode(
    () =>
      stores[2]!.recordCohortStopEvent({
        runId,
        expectedRevision: 2,
        runControlCapability: capability("reconcile-run"),
        event: createDurablePreviewShadowCohortStopEvent({
          contract_version:
            "adaptive-interviewer-preview-shadow-cohort-stop-event.v1",
          run_id: runId,
          reason: "evidence_digest_drift",
          evidence_sha256: sha("divergent-stop-evidence"),
          observed_at: fixture.now.toISOString(),
        }),
      }),
    "preview_shadow_control_plane_conflict"
  );

  const firstReceipt = receipt(
    runId,
    same[0]!.lease,
    fixture.now,
    250_000_000_000,
    "first"
  );
  await assertCode(
    () =>
      stores[0]!.reconcileSessionReceipt({
        runId,
        expectedRevision: 3,
        workerEvidenceCapability: capability("wrong-first-worker"),
        receipt: firstReceipt,
      }),
    "preview_shadow_control_plane_unauthenticated"
  );
  const firstResults = await Promise.all([
    stores[0]!.reconcileSessionReceipt({
      runId,
      expectedRevision: 3,
      workerEvidenceCapability: capability("same-worker"),
      receipt: firstReceipt,
    }),
    stores[1]!.reconcileSessionReceipt({
      runId,
      expectedRevision: 3,
      workerEvidenceCapability: capability("same-worker"),
      receipt: firstReceipt,
    }),
  ]);
  assert.deepEqual(firstResults.map((result) => result.outcome).sort(), [
    "recorded",
    "replayed",
  ]);
  const settledReplay = await stores[2]!.allocateSessionLease(sameRequest);
  assert.deepEqual(
    settledReplay.outcome === "replayed_closed"
      ? [settledReplay.outcome, settledReplay.lease_state]
      : [settledReplay.outcome, "unexpected"],
    ["replayed_closed", "settled"]
  );
  await assertCode(
    () =>
      stores[1]!.reconcileSessionReceipt({
        runId,
        expectedRevision: 4,
        workerEvidenceCapability: capability("same-worker"),
        receipt: firstReceipt,
      }),
    "preview_shadow_control_plane_conflict"
  );
  await assertCode(
    () =>
      stores[2]!.reconcileSessionReceipt({
        runId,
        expectedRevision: 3,
        workerEvidenceCapability: capability("same-worker"),
        receipt: receipt(
          runId,
          same[0]!.lease,
          fixture.now,
          249_000_000_000,
          "divergent-first"
        ),
      }),
    "preview_shadow_control_plane_conflict"
  );
  const secondReceipt = receipt(
    runId,
    second.lease,
    fixture.now,
    250_000_000_000,
    "second"
  );
  const final = await stores[3]!.reconcileSessionReceipt({
    runId,
    expectedRevision: 4,
    workerEvidenceCapability: capability("second-worker"),
    receipt: secondReceipt,
  });
  assert.equal(final.run.reconciled_spend_nano_usd, 500_000_000_000);
  assert.equal(final.run.outstanding_session_reservations_nano_usd, 0);
  assert.equal(final.run.stopped, true);
}

async function verifyAdmissionUsesRunThenLeaseLockOrder(
  database: Database,
  clients: postgres.Sql[],
  runId: string,
  lease: Parameters<
    typeof verifyDurablePreviewShadowSessionLeaseAdmission
  >[1]["lease"],
  workerEvidenceCapability: string
): Promise<void> {
  const applicationName = `preview_shadow_admission_${process.pid}`;
  let releaseRunLock!: () => void;
  let markRunLocked!: () => void;
  const runLockReleased = new Promise<void>((resolve) => {
    releaseRunLock = resolve;
  });
  const runLocked = new Promise<void>((resolve) => {
    markRunLocked = resolve;
  });
  const blocker = clients[0]!.begin(async (tx) => {
    await tx`
      SELECT run_id
      FROM adaptive_interviewer_preview_shadow_run
      WHERE run_id = ${runId}
      FOR UPDATE
    `;
    markRunLocked();
    await runLockReleased;
  });
  await runLocked;
  await clients[1]!`SELECT set_config('application_name', ${applicationName}, false)`;
  const admission = verifyDurablePreviewShadowSessionLeaseAdmission(database, {
    lease,
    workerEvidenceCapability,
  });
  let probeError: unknown;
  try {
    await waitForDatabaseLock(clients[3]!, applicationName);
    await clients[2]!.begin(async (tx) => {
      await tx`
        SELECT lease_id
        FROM adaptive_interviewer_preview_shadow_session_lease
        WHERE lease_id = ${(lease as { lease_id: string }).lease_id}
        FOR UPDATE NOWAIT
      `;
    });
  } catch (error) {
    probeError = error;
  } finally {
    releaseRunLock();
  }
  try {
    await Promise.all([blocker, admission]);
    assert.equal(
      probeError,
      undefined,
      "admission must wait on the run row before locking the lease row"
    );
  } finally {
    await clients[1]!`SELECT set_config('application_name', '', false)`;
  }
}

async function waitForDatabaseLock(
  client: postgres.Sql,
  applicationName: string
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await client<{ waiting: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE application_name = ${applicationName}
          AND wait_event_type = 'Lock'
      ) AS waiting
    `;
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("preview_shadow_admission_lock_wait_not_observed");
}

async function verifyStopIncompleteRecovery(
  databases: Database[]
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "recovery");
  const stores = databases.map(createDurablePreviewShadowControlPlaneStore);
  const activated = await stores[0]!.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("recovery-run"),
  });
  const leaseResult = executableAllocation(
    await stores[0]!.allocateSessionLease({
      runId: activated.run.run_id,
      expectedRevision: 0,
      sessionBindingSha256: sha("recovery-session"),
      expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
      workerEvidenceCapability: capability("recovery-worker"),
      terminationCapability: capability("recovery-termination"),
    })
  );
  const incident = createDurablePreviewShadowStopIncompleteIncident({
    contract_version:
      "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1",
    run_id: activated.run.run_id,
    lease_id: leaseResult.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed",
    attempt_count: 10,
    reconciled_spend_nano_usd: 1_500_000_000,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: sha("recovery-attempts"),
    observed_at: fixture.now.toISOString(),
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  });
  await assertCode(
    () =>
      stores[0]!.recordStopIncompleteIncident({
        runId: activated.run.run_id,
        expectedRevision: 1,
        workerEvidenceCapability: capability("wrong-recovery-worker"),
        incident,
      }),
    "preview_shadow_control_plane_unauthenticated"
  );
  const recorded = await stores[0]!.recordStopIncompleteIncident({
    runId: activated.run.run_id,
    expectedRevision: 1,
    workerEvidenceCapability: capability("recovery-worker"),
    incident,
  });
  assert.equal(
    recorded.run.outstanding_session_reservations_nano_usd,
    1_000_000_000
  );
  assert.equal(recorded.run.stop_incomplete_excess_spend_nano_usd, 500_000_000);
  assert.equal(recorded.run.stopped, true);
  const incompleteReplay = await stores[1]!.allocateSessionLease({
    runId: activated.run.run_id,
    expectedRevision: 0,
    sessionBindingSha256: sha("recovery-session"),
    expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
    workerEvidenceCapability: capability("recovery-worker"),
    terminationCapability: capability("recovery-termination"),
  });
  assert.deepEqual(
    incompleteReplay.outcome === "replayed_closed"
      ? [incompleteReplay.outcome, incompleteReplay.lease_state]
      : [incompleteReplay.outcome, "unexpected"],
    ["replayed_closed", "stop_incomplete"]
  );
  const replayedIncident = await stores[1]!.recordStopIncompleteIncident({
    runId: activated.run.run_id,
    expectedRevision: 1,
    workerEvidenceCapability: capability("recovery-worker"),
    incident,
  });
  assert.equal(replayedIncident.outcome, "replayed");
  await assertCode(
    () =>
      stores[1]!.recordStopIncompleteIncident({
        runId: activated.run.run_id,
        expectedRevision: 2,
        workerEvidenceCapability: capability("recovery-worker"),
        incident,
      }),
    "preview_shadow_control_plane_conflict"
  );
  const divergentIncident = createDurablePreviewShadowStopIncompleteIncident({
    contract_version:
      "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1",
    run_id: activated.run.run_id,
    lease_id: leaseResult.lease.lease_id,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed",
    attempt_count: 10,
    reconciled_spend_nano_usd: 1_600_000_000,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: sha("divergent-recovery-attempts"),
    observed_at: fixture.now.toISOString(),
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  });
  await assertCode(
    () =>
      stores[1]!.recordStopIncompleteIncident({
        runId: activated.run.run_id,
        expectedRevision: 1,
        workerEvidenceCapability: capability("recovery-worker"),
        incident: divergentIncident,
      }),
    "preview_shadow_control_plane_conflict"
  );
  await assertCode(
    () =>
      stores[1]!.allocateSessionLease({
        runId: activated.run.run_id,
        expectedRevision: 2,
        sessionBindingSha256: sha("forbidden-after-incident"),
        expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
        workerEvidenceCapability: capability("forbidden-worker"),
        terminationCapability: capability("forbidden-termination"),
      }),
    "preview_shadow_control_plane_denied"
  );
  await assertCode(
    () =>
      stores[2]!.acknowledgeTermination({
        runId: activated.run.run_id,
        leaseId: leaseResult.lease.lease_id,
        incidentId: incident.incident_id,
        expectedRevision: 2,
        terminationCapability: capability("wrong-recovery-termination"),
        disposition: "process_terminated",
        terminationEvidenceSha256: sha("termination-evidence"),
        finalReconciledSpendNanoUsd: 2_000_000_000,
      }),
    "preview_shadow_control_plane_unauthenticated"
  );
  const acknowledged = await stores[2]!.acknowledgeTermination({
    runId: activated.run.run_id,
    leaseId: leaseResult.lease.lease_id,
    incidentId: incident.incident_id,
    expectedRevision: 2,
    terminationCapability: capability("recovery-termination"),
    disposition: "process_terminated",
    terminationEvidenceSha256: sha("termination-evidence"),
    finalReconciledSpendNanoUsd: 2_000_000_000,
  });
  assert.equal(acknowledged.run.reconciled_spend_nano_usd, 2_000_000_000);
  assert.equal(acknowledged.run.outstanding_session_reservations_nano_usd, 0);
  assert.equal(acknowledged.run.stop_incomplete_excess_spend_nano_usd, 0);
  assert.equal(acknowledged.run.stopped, true);
  const acknowledgedReplay = await stores[3]!.allocateSessionLease({
    runId: activated.run.run_id,
    expectedRevision: 0,
    sessionBindingSha256: sha("recovery-session"),
    expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
    workerEvidenceCapability: capability("recovery-worker"),
    terminationCapability: capability("recovery-termination"),
  });
  assert.deepEqual(
    acknowledgedReplay.outcome === "replayed_closed"
      ? [acknowledgedReplay.outcome, acknowledgedReplay.lease_state]
      : [acknowledgedReplay.outcome, "unexpected"],
    ["replayed_closed", "termination_acknowledged"]
  );
  const replayed = await stores[3]!.acknowledgeTermination({
    runId: activated.run.run_id,
    leaseId: leaseResult.lease.lease_id,
    incidentId: incident.incident_id,
    expectedRevision: 2,
    terminationCapability: capability("recovery-termination"),
    disposition: "process_terminated",
    terminationEvidenceSha256: sha("termination-evidence"),
    finalReconciledSpendNanoUsd: 2_000_000_000,
  });
  assert.equal(replayed.outcome, "replayed");
  assert.equal(
    replayed.acknowledgement.acknowledgement_id,
    acknowledged.acknowledgement.acknowledgement_id
  );
  await assertCode(
    () =>
      stores[3]!.acknowledgeTermination({
        runId: activated.run.run_id,
        leaseId: leaseResult.lease.lease_id,
        incidentId: incident.incident_id,
        expectedRevision: 3,
        terminationCapability: capability("recovery-termination"),
        disposition: "process_terminated",
        terminationEvidenceSha256: sha("termination-evidence"),
        finalReconciledSpendNanoUsd: 2_000_000_000,
      }),
    "preview_shadow_control_plane_conflict"
  );
  await assertCode(
    () =>
      stores[3]!.acknowledgeTermination({
        runId: activated.run.run_id,
        leaseId: leaseResult.lease.lease_id,
        incidentId: incident.incident_id,
        expectedRevision: 2,
        terminationCapability: capability("recovery-termination"),
        disposition: "worker_terminated",
        terminationEvidenceSha256: sha("termination-evidence"),
        finalReconciledSpendNanoUsd: 2_000_000_000,
      }),
    "preview_shadow_control_plane_conflict"
  );
}

async function verifyRevokedLeaseIncidentReconciliation(
  databases: Database[]
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "revoked-incident");
  const store = createDurablePreviewShadowControlPlaneStore(databases[0]!);
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("revoked-incident-run"),
  });
  const request = {
    runId: activated.run.run_id,
    expectedRevision: 0,
    sessionBindingSha256: sha("revoked-incident-session"),
    expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
    workerEvidenceCapability: capability("revoked-incident-worker"),
    terminationCapability: capability("revoked-incident-termination"),
  };
  const allocated = executableAllocation(
    await store.allocateSessionLease(request)
  );
  const stop = createDurablePreviewShadowCohortStopEvent({
    contract_version:
      "adaptive-interviewer-preview-shadow-cohort-stop-event.v1",
    run_id: activated.run.run_id,
    reason: "kill_switch_failure",
    evidence_sha256: sha("revoked-incident-stop"),
    observed_at: fixture.now.toISOString(),
  });
  await store.recordCohortStopEvent({
    runId: activated.run.run_id,
    expectedRevision: 1,
    runControlCapability: capability("revoked-incident-run"),
    event: stop,
  });
  const replay = await store.allocateSessionLease(request);
  assert.ok(
    replay.outcome === "replayed_closed" && replay.lease_state === "revoked"
  );
  const incident = createDurablePreviewShadowStopIncompleteIncident({
    contract_version:
      "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1",
    run_id: activated.run.run_id,
    lease_id: allocated.lease.lease_id,
    session_ordinal: allocated.lease.session_ordinal,
    allocation_ledger_revision: allocated.lease.allocation_ledger_revision,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed",
    attempt_count: 1,
    reconciled_spend_nano_usd: 100_000_000,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: sha("revoked-incident-attempts"),
    observed_at: fixture.now.toISOString(),
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  });
  const recorded = await store.recordStopIncompleteIncident({
    runId: activated.run.run_id,
    expectedRevision: 2,
    workerEvidenceCapability: capability("revoked-incident-worker"),
    incident,
  });
  assert.equal(recorded.outcome, "recorded");
  assert.equal(
    recorded.run.outstanding_session_reservations_nano_usd,
    1_000_000_000
  );
}

async function verifyActivationDatabaseClockAtLock(
  databases: Database[],
  clients: postgres.Sql[]
): Promise<void> {
  const fixture = await createFixture(
    databases[0]!,
    "activation-db-clock-lock",
    -60,
    3
  );
  const store = createDurablePreviewShadowControlPlaneStore(databases[1]!);
  const runControlCapability = capability("activation-db-clock-run");
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability,
  });
  let releaseLock!: () => void;
  let signalLocked!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    signalLocked = resolve;
  });
  const holder = clients[0]!.begin(async (transaction) => {
    await transaction`
      SELECT run_id
      FROM adaptive_interviewer_preview_shadow_run
      WHERE run_id = ${activated.run.run_id}
      FOR UPDATE
    `;
    signalLocked();
    await release;
  });
  await locked;
  const replay = store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability,
  });
  const waitMilliseconds = Math.max(
    0,
    new Date(fixture.authorization.authorization_expires_at).getTime() -
      Date.now() +
      150
  );
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
  releaseLock();
  await holder;
  assert.equal((await replay).outcome, "replayed");
}

async function verifyExpiredLeaseReplay(
  databases: Database[],
  client: postgres.Sql
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "expired-lease");
  const store = createDurablePreviewShadowControlPlaneStore(databases[0]!);
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("expired-lease-run"),
  });
  const expiresAt = new Date(fixture.now.getTime() + 2_000).toISOString();
  const request = {
    runId: activated.run.run_id,
    expectedRevision: 0,
    sessionBindingSha256: sha("expired-lease-session"),
    expiresAt,
    workerEvidenceCapability: capability("expired-lease-worker"),
    terminationCapability: capability("expired-lease-termination"),
  };
  executableAllocation(await store.allocateSessionLease(request));
  await client`SELECT pg_sleep(2.1)`;
  const replay = await createDurablePreviewShadowControlPlaneStore(
    databases[2]!
  ).allocateSessionLease(request);
  assert.deepEqual(
    replay.outcome === "replayed_closed"
      ? [replay.outcome, replay.lease_state, Object.hasOwn(replay, "lease")]
      : [replay.outcome, "unexpected", true],
    ["replayed_closed", "expired", false]
  );
}

async function verifyDatabaseClockAtLock(
  databases: Database[],
  clients: postgres.Sql[]
): Promise<void> {
  const fixture = await createFixture(databases[0]!, "db-clock-lock", -60, 3);
  const store = createDurablePreviewShadowControlPlaneStore(databases[1]!);
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("db-clock-run"),
  });
  let releaseLock!: () => void;
  let signalLocked!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    signalLocked = resolve;
  });
  const holder = clients[0]!.begin(async (transaction) => {
    await transaction`
      SELECT run_id
      FROM adaptive_interviewer_preview_shadow_run
      WHERE run_id = ${activated.run.run_id}
      FOR UPDATE
    `;
    signalLocked();
    await release;
  });
  await locked;
  const allocation = store.allocateSessionLease({
    runId: activated.run.run_id,
    expectedRevision: 0,
    sessionBindingSha256: sha("db-clock-session"),
    expiresAt: fixture.authorization.authorization_expires_at,
    workerEvidenceCapability: capability("db-clock-worker"),
    terminationCapability: capability("db-clock-termination"),
  });
  const waitMilliseconds = Math.max(
    0,
    new Date(fixture.authorization.authorization_expires_at).getTime() -
      Date.now() +
      150
  );
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
  releaseLock();
  await holder;
  await assertCode(() => allocation, "preview_shadow_control_plane_denied");
}

async function verifyDatabaseClockAtAllocationCompletion(
  database: Database,
  client: postgres.Sql
): Promise<void> {
  const fixture = await createFixture(
    database,
    "db-clock-allocation-completion",
    -60,
    5
  );
  const store = createDurablePreviewShadowControlPlaneStore(database);
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("db-clock-completion-run"),
  });
  await client.unsafe(`
    CREATE FUNCTION sav_480_delay_lease_insert() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_sleep(5.1);
      RETURN NEW;
    END
    $$;
    CREATE TRIGGER sav_480_delay_lease_insert
    BEFORE INSERT ON adaptive_interviewer_preview_shadow_session_lease
    FOR EACH ROW EXECUTE FUNCTION sav_480_delay_lease_insert();
  `);
  try {
    await assertCode(
      () =>
        store.allocateSessionLease({
          runId: activated.run.run_id,
          expectedRevision: 0,
          sessionBindingSha256: sha("db-clock-completion-session"),
          expiresAt: fixture.authorization.authorization_expires_at,
          workerEvidenceCapability: capability("db-clock-completion-worker"),
          terminationCapability: capability("db-clock-completion-termination"),
        }),
      "preview_shadow_control_plane_denied"
    );
  } finally {
    await client.unsafe(`
      DROP TRIGGER sav_480_delay_lease_insert
      ON adaptive_interviewer_preview_shadow_session_lease;
      DROP FUNCTION sav_480_delay_lease_insert();
    `);
  }
  const [run] = await client<
    {
      allocated_session_count: number;
      outstanding_session_reservations_nano_usd: string;
      revision: number;
    }[]
  >`
    SELECT allocated_session_count,
      outstanding_session_reservations_nano_usd::text,
      revision
    FROM adaptive_interviewer_preview_shadow_run
    WHERE run_id = ${activated.run.run_id}
  `;
  assert.deepEqual(run, {
    allocated_session_count: 0,
    outstanding_session_reservations_nano_usd: "0",
    revision: 0,
  });
  const [leaseCount] = await client<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM adaptive_interviewer_preview_shadow_session_lease
    WHERE run_id = ${activated.run.run_id}
  `;
  assert.equal(leaseCount!.count, "0");
}

async function verifyTransactionRollback(
  database: Database,
  client: postgres.Sql
): Promise<void> {
  const fixture = await createFixture(database, "rollback");
  const store = createDurablePreviewShadowControlPlaneStore(database);
  const activated = await store.activate({
    authenticatedOwnerDecision: verifyFixture(fixture),
    runControlCapability: capability("rollback-run"),
  });
  const allocated = executableAllocation(
    await store.allocateSessionLease({
      runId: activated.run.run_id,
      expectedRevision: 0,
      sessionBindingSha256: sha("rollback-session"),
      expiresAt: new Date(fixture.now.getTime() + 1_800_000).toISOString(),
      workerEvidenceCapability: capability("rollback-worker"),
      terminationCapability: capability("rollback-termination"),
    })
  );
  const terminal = receipt(
    activated.run.run_id,
    allocated.lease,
    fixture.now,
    1_000_000_000,
    "rollback"
  );
  await client.unsafe(`
    CREATE FUNCTION sav_480_fail_run_update() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'raw-rollback-secret';
    END
    $$;
    CREATE TRIGGER sav_480_fail_run_update
      BEFORE UPDATE ON adaptive_interviewer_preview_shadow_run
      FOR EACH ROW EXECUTE FUNCTION sav_480_fail_run_update()
  `);
  await assertCode(
    () =>
      store.reconcileSessionReceipt({
        runId: activated.run.run_id,
        expectedRevision: 1,
        workerEvidenceCapability: capability("rollback-worker"),
        receipt: terminal,
      }),
    "preview_shadow_control_plane_unavailable"
  );
  await client.unsafe(`
    DROP TRIGGER sav_480_fail_run_update
      ON adaptive_interviewer_preview_shadow_run;
    DROP FUNCTION sav_480_fail_run_update()
  `);
  const rows = await client<
    {
      revision: number;
      state: string;
      receipt_count: number;
    }[]
  >`
    SELECT run.revision, lease.state,
      (SELECT count(*)::integer
       FROM adaptive_interviewer_preview_shadow_session_receipt receipt
       WHERE receipt.run_id = run.run_id) AS receipt_count
    FROM adaptive_interviewer_preview_shadow_run run
    JOIN adaptive_interviewer_preview_shadow_session_lease lease
      ON lease.run_id = run.run_id
    WHERE run.run_id = ${activated.run.run_id}
  `;
  assert.deepEqual(rows[0], {
    revision: 1,
    state: "open",
    receipt_count: 0,
  });
  const retried = await store.reconcileSessionReceipt({
    runId: activated.run.run_id,
    expectedRevision: 1,
    workerEvidenceCapability: capability("rollback-worker"),
    receipt: terminal,
  });
  assert.equal(retried.outcome, "recorded");
}

async function verifyGlobalReservationCap(database: Database): Promise<void> {
  const fixture = await createFixture(database, "caps");
  const store = createDurablePreviewShadowControlPlaneStore(database);
  let run = (
    await store.activate({
      authenticatedOwnerDecision: verifyFixture(fixture),
      runControlCapability: capability("caps-run"),
    })
  ).run;
  const expiresAt = new Date(fixture.now.getTime() + 1_800_000).toISOString();
  let finalRequest:
    | Parameters<
        DurablePreviewShadowControlPlaneStore["allocateSessionLease"]
      >[0]
    | null = null;
  for (let index = 1; index <= 10; index += 1) {
    finalRequest = {
      runId: run.run_id,
      expectedRevision: run.revision,
      sessionBindingSha256: sha(`cap-session-${index}`),
      expiresAt,
      workerEvidenceCapability: capability(`cap-worker-${index}`),
      terminationCapability: capability(`cap-termination-${index}`),
    };
    run = executableAllocation(
      await store.allocateSessionLease(finalRequest)
    ).run;
  }
  assert.equal(run.allocated_session_count, 10);
  assert.equal(run.outstanding_session_reservations_nano_usd, 10_000_000_000);
  assert.equal(run.stopped, true);
  assert.equal(run.revision, 11);
  assert.ok(finalRequest);
  const replay = await store.allocateSessionLease(finalRequest);
  assert.equal(replay.outcome, "replayed");
  assert.ok(
    replay.outcome === "replayed" && replay.lease.session_ordinal === 10
  );
}

async function verifyPrivacy(client: postgres.Sql): Promise<void> {
  const columns = await client<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name IN ${client(TABLES)}
  `;
  const names = columns.map((row) => row.column_name).join(" ");
  assert.doesNotMatch(
    names,
    /signature|public_key|raw_|transcript|content|room/
  );
  let durableRows = "";
  for (const table of TABLES) {
    const rows = await client.unsafe<{ row: unknown }[]>(
      `SELECT row_to_json(candidate) AS row FROM "${table}" AS candidate`
    );
    durableRows += JSON.stringify(rows);
  }
  for (const raw of SENSITIVE_VALUES) {
    assert.equal(durableRows.includes(raw), false);
  }
}

async function createFixture(
  database: Database,
  tag: string,
  decidedOffsetSeconds = -60,
  expiresOffsetSeconds = 3_600
): Promise<Fixture> {
  const rows = await database.execute<{ databaseNow: Date | string }>(
    // DB time is the independent authority for all fixture boundaries.
    (await import("drizzle-orm"))
      .sql`SELECT date_trunc('second', clock_timestamp()) AS "databaseNow"`
  );
  const databaseNow = new Date(rows[0]!.databaseNow);
  const now = new Date(databaseNow.getTime());
  const authorization: AdaptiveInterviewerPreviewShadowAuthorization = {
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    requested_authority: "execute_bounded_preview_shadow_only",
    current_stage: "synthetic",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    candidate_git_sha: CANDIDATE_SHA,
    preview_shadow_configuration:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    owner_direction_reference:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
    owner_decision: "approved",
    owner_decision_reference: `linear:SAV-480:test:${tag}`,
    owner_decided_at: new Date(
      now.getTime() + decidedOffsetSeconds * 1_000
    ).toISOString(),
    authorization_expires_at: new Date(
      now.getTime() + expiresOffsetSeconds * 1_000
    ).toISOString(),
    authorization_nonce: sha(`authorization-${tag}`),
    one_time_execution: true,
    maximum_consumptions: 1,
    preview_shadow_execution_authorized: true,
    preview_influence_authorized: false,
    later_stage_authorized: false,
    production_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
  };
  const payload: PreviewShadowOwnerDecisionPayload = {
    authorization_expires_at: authorization.authorization_expires_at,
    authorization_id:
      adaptiveInterviewerPreviewShadowAuthorizationId(authorization),
    authorization_nonce: authorization.authorization_nonce,
    candidate_git_sha: CANDIDATE_SHA,
    default_on_authorized: false,
    exposure: "none",
    later_stage_authorized: false,
    launch_go_no_go_authorized: false,
    owner_decided_at: authorization.owner_decided_at,
    owner_decision: PREVIEW_SHADOW_OWNER_APPROVAL,
    owner_decision_reference: authorization.owner_decision_reference,
    owner_direction_reference: authorization.owner_direction_reference,
    owner_id: PREVIEW_SHADOW_OWNER_ID,
    owner_role: PREVIEW_SHADOW_OWNER_ROLE,
    preview_influence_authorized: false,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    production_authorized: false,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    signing_key_id: KEY_ID,
    target_cohort: "shadow",
    target_environment: "preview_staging",
    target_stage: "preview_shadow",
  };
  const artifact: PreviewShadowOwnerDecisionArtifact = {
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: KEY_ID,
      value: sign(
        null,
        previewShadowOwnerDecisionSignatureMessage(payload),
        privateKey
      ).toString("base64"),
    },
  };
  SENSITIVE_VALUES.add(artifact.signature.value);
  SENSITIVE_VALUES.add(JSON.stringify(artifact));
  SENSITIVE_VALUES.add(JSON.stringify(authorization));
  const registry: PreviewShadowOwnerKeyRegistry = {
    contract: PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
    ownerId: PREVIEW_SHADOW_OWNER_ID,
    keys: [
      {
        algorithm: "ed25519",
        keyId: KEY_ID,
        notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2027-01-01T00:00:00.000Z",
        publicKeyPem: publicKey.export({
          type: "spki",
          format: "pem",
        }) as string,
        status: "active",
      },
    ],
  };
  return { authorization, artifact, registry, now };
}

function verifyFixture(fixture: Fixture, verifierNow = fixture.now) {
  return authenticatePreviewShadowOwnerDecision({
    artifact: fixture.artifact,
    authorization: fixture.authorization,
    context: {
      candidateGitSha: CANDIDATE_SHA,
      previewShadowConfigurationSha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      selectedCandidateConfigurationSha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
      targetStage: "preview_shadow",
      targetEnvironment: "preview_staging",
      targetCohort: "shadow",
      exposure: "none",
    },
    keyRegistry: fixture.registry,
    now: verifierNow,
  });
}

async function databaseNow(database: Database): Promise<Date> {
  const rows = await database.execute<{ databaseNow: Date | string }>(
    (await import("drizzle-orm"))
      .sql`SELECT date_trunc('second', clock_timestamp()) AS "databaseNow"`
  );
  return new Date(rows[0]!.databaseNow);
}

type AllocationResult = Awaited<
  ReturnType<DurablePreviewShadowControlPlaneStore["allocateSessionLease"]>
>;

function executableAllocation(
  result: AllocationResult
): Extract<AllocationResult, { outcome: "allocated" | "replayed" }> {
  if (result.outcome === "replayed_closed") {
    throw new Error("expected_executable_preview_shadow_lease");
  }
  return result;
}

function resignFixture(
  fixture: Fixture,
  updates: Partial<AdaptiveInterviewerPreviewShadowAuthorization>
): Fixture {
  const authorization = {
    ...fixture.authorization,
    ...updates,
  } as AdaptiveInterviewerPreviewShadowAuthorization;
  const payload: PreviewShadowOwnerDecisionPayload = {
    authorization_expires_at: authorization.authorization_expires_at,
    authorization_id:
      adaptiveInterviewerPreviewShadowAuthorizationId(authorization),
    authorization_nonce: authorization.authorization_nonce,
    candidate_git_sha: authorization.candidate_git_sha,
    default_on_authorized: false,
    exposure: "none",
    later_stage_authorized: false,
    launch_go_no_go_authorized: false,
    owner_decided_at: authorization.owner_decided_at,
    owner_decision: PREVIEW_SHADOW_OWNER_APPROVAL,
    owner_decision_reference: authorization.owner_decision_reference,
    owner_direction_reference: authorization.owner_direction_reference,
    owner_id: PREVIEW_SHADOW_OWNER_ID,
    owner_role: PREVIEW_SHADOW_OWNER_ROLE,
    preview_influence_authorized: false,
    preview_shadow_configuration_sha256:
      authorization.preview_shadow_configuration_sha256,
    production_authorized: false,
    selected_candidate_configuration_sha256:
      authorization.selected_candidate_configuration_sha256,
    signing_key_id: KEY_ID,
    target_cohort: "shadow",
    target_environment: "preview_staging",
    target_stage: "preview_shadow",
  };
  const artifact: PreviewShadowOwnerDecisionArtifact = {
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: KEY_ID,
      value: sign(
        null,
        previewShadowOwnerDecisionSignatureMessage(payload),
        privateKey
      ).toString("base64"),
    },
  };
  SENSITIVE_VALUES.add(artifact.signature.value);
  SENSITIVE_VALUES.add(JSON.stringify(artifact));
  SENSITIVE_VALUES.add(JSON.stringify(authorization));
  return { ...fixture, authorization, artifact };
}

function receipt(
  runId: string,
  lease: {
    lease_id: string;
    session_ordinal: number;
    allocation_ledger_revision: number;
  },
  now: Date,
  spend: number,
  tag: string
) {
  return createDurablePreviewShadowSessionReceipt({
    contract_version: "adaptive-interviewer-preview-shadow-session-receipt.v1",
    run_id: runId,
    lease_id: lease.lease_id,
    session_ordinal: lease.session_ordinal,
    allocation_ledger_revision: lease.allocation_ledger_revision,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled",
    attempt_count: 10,
    reconciled_spend_nano_usd: spend,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: sha(`receipt-${tag}`),
    settled_at: now.toISOString(),
  });
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function capability(value: string): string {
  const token = createHash("sha256")
    .update(`capability:${value}`)
    .digest("base64url");
  SENSITIVE_VALUES.add(token);
  return token;
}

async function assertOneActivationConflict(
  operations: [Promise<unknown>, Promise<unknown>]
): Promise<void> {
  const results = await Promise.allSettled(operations);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  assert.ok(rejected?.reason instanceof PreviewShadowControlPlaneError);
  assert.equal(rejected.reason.code, "preview_shadow_control_plane_conflict");
}

async function assertCode(
  operation: () => Promise<unknown>,
  code: PreviewShadowControlPlaneError["code"]
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof PreviewShadowControlPlaneError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}
