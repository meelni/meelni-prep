import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 } from "@meelni/agent";
import {
  assertPreviewShadowOwnerDecisionAuthenticated,
  PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_DOMAIN,
  type AuthenticatedPreviewShadowOwnerDecision,
} from "@/lib/security/adaptive-interviewer-preview-shadow-owner-decision";
import * as schema from "./schema";
import {
  adaptiveInterviewerPreviewShadowCohortStopEvent as stopEventTable,
  adaptiveInterviewerPreviewShadowRun as runTable,
  adaptiveInterviewerPreviewShadowSessionLease as leaseTable,
  adaptiveInterviewerPreviewShadowSessionReceipt as receiptTable,
  adaptiveInterviewerPreviewShadowStopIncompleteIncident as incidentTable,
  adaptiveInterviewerPreviewShadowTerminationAcknowledgement as acknowledgementTable,
} from "./schema-preview-shadow";

export const PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION =
  "adaptive-interviewer-preview-shadow-durable-control-plane.v1" as const;
export const PREVIEW_SHADOW_RUN_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-run-digest.v1" as const;
export const PREVIEW_SHADOW_SESSION_LEASE_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease.v1" as const;
export const PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease-digest.v1" as const;
export const PREVIEW_SHADOW_SESSION_RECEIPT_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt.v1" as const;
export const PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt-digest.v1" as const;
export const PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1" as const;
export const PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident-digest.v1" as const;
export const PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-stop-event.v1" as const;
export const PREVIEW_SHADOW_COHORT_STOP_EVENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-stop-event-digest.v1" as const;
export const PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_VERSION =
  "adaptive-interviewer-preview-shadow-termination-acknowledgement.v1" as const;
export const PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-termination-acknowledgement-digest.v1" as const;

const WORKER_EVIDENCE_CAPABILITY_DOMAIN =
  "adaptive-interviewer-preview-shadow-worker-evidence-capability.v1";
const TERMINATION_CAPABILITY_DOMAIN =
  "adaptive-interviewer-preview-shadow-termination-capability.v1";
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const SESSION_LEASE_RESERVATION_NANO_USD = 1_000_000_000;
const ATTEMPT_RESERVATION_NANO_USD = 100_000_000;
const MAXIMUM_ATTEMPTS = 10;
const MAXIMUM_SESSIONS = 25;
const MAXIMUM_SPEND_NANO_USD = 25_000_000_000;
const MAXIMUM_CUMULATIVE_SPEND_NANO_USD = 10_000_000_000;
const MAXIMUM_OBSERVED_SESSION_SPEND_NANO_USD = 250_000_000_000;
const MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD =
  MAXIMUM_SESSIONS * MAXIMUM_OBSERVED_SESSION_SPEND_NANO_USD;
const MAXIMUM_LEASE_TTL_MS = 60 * 60 * 1_000;

export type PreviewShadowControlPlaneDatabase = PostgresJsDatabase<
  typeof schema
>;
type PreviewShadowTransaction = Parameters<
  Parameters<PreviewShadowControlPlaneDatabase["transaction"]>[0]
>[0];

export type PreviewShadowCohortStopReason =
  | "evidence_digest_drift"
  | "version_pin_mismatch"
  | "unauthorized_stage_or_cohort"
  | "deterministic_invariant_regression"
  | "session_or_transcript_loss"
  | "kill_switch_failure"
  | "maximum_sessions_reached"
  | "maximum_spend_reached"
  | "maximum_cumulative_spend_reached";

export interface DurablePreviewShadowRun {
  contract_version: typeof PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION;
  run_id: string;
  authorization_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  exposure: "none";
  maximum_sessions: 25;
  maximum_spend_nano_usd: 25000000000;
  maximum_cumulative_spend_nano_usd: 10000000000;
  allocated_session_count: number;
  reconciled_spend_nano_usd: number;
  outstanding_session_reservations_nano_usd: number;
  stop_incomplete_excess_spend_nano_usd: number;
  stopped: boolean;
  revision: number;
  activated_at: string;
  authorization_expires_at: string;
}

export interface DurablePreviewShadowSessionLease {
  contract_version: typeof PREVIEW_SHADOW_SESSION_LEASE_VERSION;
  run_id: string;
  authorization_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  adapter_id: "meelni_director_openai_responses";
  adapter_version: "interview-director-adapter.openai-responses.v1";
  provider: "openai-api";
  model: "gpt-5.4-mini-2026-03-17";
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  exposure: "none";
  session_ordinal: number;
  session_binding_sha256: string;
  session_budget_nano_usd: 1000000000;
  maximum_attempts: 10;
  attempt_reservation_nano_usd: 100000000;
  issued_at: string;
  expires_at: string;
  allocation_ledger_revision: number;
  lease_id: string;
  integrity_sha256: string;
}

export interface DurablePreviewShadowSessionReceipt {
  contract_version: typeof PREVIEW_SHADOW_SESSION_RECEIPT_VERSION;
  run_id: string;
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  preview_shadow_configuration_sha256: string;
  outcome: "settled" | "stopped";
  attempt_count: number;
  reconciled_spend_nano_usd: number;
  outstanding_attempt_reservations_nano_usd: 0;
  attempt_receipts_sha256: string;
  settled_at: string;
  receipt_id: string;
  integrity_sha256: string;
}

export interface DurablePreviewShadowStopIncompleteIncident {
  contract_version: typeof PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION;
  run_id: string;
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  preview_shadow_configuration_sha256: string;
  reason: "cleanup_unconfirmed";
  attempt_count: number;
  reconciled_spend_nano_usd: number;
  retained_session_reservation_nano_usd: 1000000000;
  attempt_receipts_sha256: string;
  observed_at: string;
  requires_allocation_stop: true;
  termination_acknowledgement_required: true;
  incident_id: string;
  integrity_sha256: string;
}

export interface DurablePreviewShadowCohortStopEvent {
  contract_version: typeof PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION;
  run_id: string;
  reason: PreviewShadowCohortStopReason;
  evidence_sha256: string;
  observed_at: string;
  stop_event_id: string;
  integrity_sha256: string;
}

export interface DurablePreviewShadowTerminationAcknowledgement {
  contract_version: typeof PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_VERSION;
  run_id: string;
  lease_id: string;
  incident_id: string;
  disposition: "worker_terminated" | "process_terminated";
  termination_evidence_sha256: string;
  final_reconciled_spend_nano_usd: number;
  acknowledged_at: string;
  acknowledgement_id: string;
  integrity_sha256: string;
}

export type DurablePreviewShadowMutationOutcome = "recorded" | "replayed";

export class PreviewShadowControlPlaneError extends Error {
  constructor(
    readonly code:
      | "preview_shadow_control_plane_invalid"
      | "preview_shadow_control_plane_conflict"
      | "preview_shadow_control_plane_stale"
      | "preview_shadow_control_plane_denied"
      | "preview_shadow_control_plane_expired"
      | "preview_shadow_control_plane_unauthenticated"
      | "preview_shadow_control_plane_invariant"
      | "preview_shadow_control_plane_unavailable"
  ) {
    super(code);
    this.name = "PreviewShadowControlPlaneError";
  }
}

export interface DurablePreviewShadowControlPlaneStore {
  activate(input: {
    authenticatedOwnerDecision: AuthenticatedPreviewShadowOwnerDecision;
    runControlCapability: string;
  }): Promise<{
    outcome: "activated" | "replayed";
    run: DurablePreviewShadowRun;
  }>;
  allocateSessionLease(input: {
    runId: string;
    expectedRevision: number;
    sessionBindingSha256: string;
    expiresAt: string;
    workerEvidenceCapability: string;
    terminationCapability: string;
  }): Promise<
    | {
        outcome: "allocated" | "replayed";
        run: DurablePreviewShadowRun;
        lease: DurablePreviewShadowSessionLease;
      }
    | {
        outcome: "replayed_closed";
        run: DurablePreviewShadowRun;
        lease_id: string;
        lease_state:
          | "expired"
          | "revoked"
          | "settled"
          | "stopped"
          | "stop_incomplete"
          | "termination_acknowledged";
      }
  >;
  reconcileSessionReceipt(input: {
    runId: string;
    expectedRevision: number;
    workerEvidenceCapability: string;
    receipt: unknown;
  }): Promise<{
    outcome: DurablePreviewShadowMutationOutcome;
    run: DurablePreviewShadowRun;
    receipt: DurablePreviewShadowSessionReceipt;
  }>;
  recordStopIncompleteIncident(input: {
    runId: string;
    expectedRevision: number;
    workerEvidenceCapability: string;
    incident: unknown;
  }): Promise<{
    outcome: DurablePreviewShadowMutationOutcome;
    run: DurablePreviewShadowRun;
    incident: DurablePreviewShadowStopIncompleteIncident;
  }>;
  recordCohortStopEvent(input: {
    runId: string;
    expectedRevision: number;
    runControlCapability: string;
    event: unknown;
  }): Promise<{
    outcome: DurablePreviewShadowMutationOutcome;
    run: DurablePreviewShadowRun;
    event: DurablePreviewShadowCohortStopEvent;
  }>;
  acknowledgeTermination(input: {
    runId: string;
    leaseId: string;
    incidentId: string;
    expectedRevision: number;
    terminationCapability: string;
    disposition: "worker_terminated" | "process_terminated";
    terminationEvidenceSha256: string;
    finalReconciledSpendNanoUsd: number;
  }): Promise<{
    outcome: DurablePreviewShadowMutationOutcome;
    run: DurablePreviewShadowRun;
    acknowledgement: DurablePreviewShadowTerminationAcknowledgement;
  }>;
}

export function createDurablePreviewShadowControlPlaneStore(
  database: PreviewShadowControlPlaneDatabase
): DurablePreviewShadowControlPlaneStore {
  try {
    if (!database || typeof database.transaction !== "function") invalid();
  } catch {
    invalid();
  }
  const store: DurablePreviewShadowControlPlaneStore = {
    activate: (input) => sanitized(() => activate(database, input)),
    allocateSessionLease: (input) =>
      sanitized(() => allocateSessionLease(database, input)),
    reconcileSessionReceipt: (input) =>
      sanitized(() => reconcileSessionReceipt(database, input)),
    recordStopIncompleteIncident: (input) =>
      sanitized(() => recordStopIncompleteIncident(database, input)),
    recordCohortStopEvent: (input) =>
      sanitized(() => recordCohortStopEvent(database, input)),
    acknowledgeTermination: (input) =>
      sanitized(() => acknowledgeTermination(database, input)),
  };
  return Object.freeze(store);
}

/**
 * Worker admission is a read-only, capability-authenticated durable check.
 * It locks the run so a concurrent manual stop either completes first and
 * revokes the lease, or observes this admission before it revokes new work.
 */
export async function verifyDurablePreviewShadowSessionLeaseAdmission(
  database: PreviewShadowControlPlaneDatabase,
  input: { lease: unknown; workerEvidenceCapability: string }
): Promise<DurablePreviewShadowSessionLease> {
  return sanitized(async () => {
    const request = exactRecord(input, ["lease", "workerEvidenceCapability"]);
    const leaseCandidate = request.lease;
    if (
      leaseCandidate === null ||
      typeof leaseCandidate !== "object" ||
      Array.isArray(leaseCandidate)
    ) {
      invalid();
    }
    const idDescriptor = Object.getOwnPropertyDescriptor(
      leaseCandidate,
      "lease_id"
    );
    if (
      !idDescriptor ||
      !("value" in idDescriptor) ||
      !isSha256(idDescriptor.value)
    ) {
      invalid();
    }
    const capabilitySha256 = capabilityHash(
      WORKER_EVIDENCE_CAPABILITY_DOMAIN,
      request.workerEvidenceCapability
    );
    return database.transaction(async (tx) => {
      const discoveredRows = await tx
        .select()
        .from(leaseTable)
        .where(eq(leaseTable.leaseId, idDescriptor.value as string))
        .limit(1);
      const discovered = discoveredRows[0];
      if (!discovered) denied();
      const run = await lockRun(tx, discovered.runId);
      const lease = await lockLease(tx, idDescriptor.value as string);
      if (lease.runId !== run.runId) invariant();
      await assertRelationalState(tx, run);
      const databaseNow = await readDatabaseNow(tx);
      assertCapability(lease.workerEvidenceCapabilitySha256, capabilitySha256);
      if (
        lease.state !== "open" ||
        lease.expiresAt.getTime() <= databaseNow.getTime() ||
        run.authorizationExpiresAt.getTime() <= databaseNow.getTime()
      ) {
        denied();
      }
      const normalized = normalizeLease(lease);
      const candidate = exactRecord(
        leaseCandidate,
        Object.keys(normalized) as Array<keyof typeof normalized>
      );
      if (JSON.stringify(candidate) !== JSON.stringify(normalized)) denied();
      return normalized;
    });
  });
}

async function activate(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    authenticatedOwnerDecision: AuthenticatedPreviewShadowOwnerDecision;
    runControlCapability: string;
  }
) {
  const request = exactRecord(input, [
    "authenticatedOwnerDecision",
    "runControlCapability",
  ]);
  const authenticated =
    request.authenticatedOwnerDecision as AuthenticatedPreviewShadowOwnerDecision;
  try {
    assertPreviewShadowOwnerDecisionAuthenticated(authenticated);
  } catch {
    unauthenticated();
  }
  const runControlCapabilitySha256 = capabilityHash(
    PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_DOMAIN,
    request.runControlCapability
  );
  assertCapability(
    authenticated.runControlCapabilitySha256,
    runControlCapabilitySha256
  );
  const runId = digest(PREVIEW_SHADOW_RUN_DIGEST_VERSION, {
    authorization_id: authenticated.authorizationId,
    candidate_git_sha: authenticated.candidateGitSha,
    preview_shadow_configuration_sha256:
      authenticated.previewShadowConfigurationSha256,
    selected_candidate_configuration_sha256:
      authenticated.selectedCandidateConfigurationSha256,
    target_stage: authenticated.targetStage,
    target_environment: authenticated.targetEnvironment,
    target_cohort: authenticated.targetCohort,
    exposure: authenticated.exposure,
  });

  return database.transaction(async (tx) => {
    const decidedAt = parseWholeSecond(authenticated.ownerDecidedAt);
    const expiresAt = parseWholeSecond(authenticated.authorizationExpiresAt);
    const existing = await findRunForUpdate(tx, authenticated.authorizationId);
    if (existing) {
      assertExactActivationReplay(existing, {
        authenticated,
        runId,
        runControlCapabilitySha256,
      });
      await assertRelationalState(tx, existing);
      return { outcome: "replayed" as const, run: normalizeRun(existing) };
    }
    const databaseNow = await readDatabaseNow(tx);
    if (
      decidedAt.getTime() > databaseNow.getTime() ||
      expiresAt.getTime() <= databaseNow.getTime()
    ) {
      expired();
    }

    const inserted = await tx
      .insert(runTable)
      .values({
        runId,
        contractVersion: PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION,
        authorizationContractVersion:
          authenticated.authorization.contract_version,
        authorizationId: authenticated.authorizationId,
        authorizationNonce: authenticated.authorization.authorization_nonce,
        ownerDecisionArtifactSha256: authenticated.artifactSha256,
        ownerDecisionReference: authenticated.ownerDecisionReference,
        ownerDecidedAt: decidedAt,
        authorizationExpiresAt: expiresAt,
        ownerSigningKeyId: authenticated.ownerSigningKeyId,
        candidateGitSha: authenticated.candidateGitSha,
        previewShadowConfigurationSha256:
          authenticated.previewShadowConfigurationSha256,
        selectedCandidateConfigurationSha256:
          authenticated.selectedCandidateConfigurationSha256,
        targetStage: authenticated.targetStage,
        targetEnvironment: authenticated.targetEnvironment,
        targetCohort: authenticated.targetCohort,
        exposure: authenticated.exposure,
        maximumSessions: MAXIMUM_SESSIONS,
        maximumSpendNanoUsd: MAXIMUM_SPEND_NANO_USD,
        maximumCumulativeSpendNanoUsd: MAXIMUM_CUMULATIVE_SPEND_NANO_USD,
        allocatedSessionCount: 0,
        reconciledSpendNanoUsd: 0,
        outstandingSessionReservationsNanoUsd: 0,
        stopIncompleteExcessSpendNanoUsd: 0,
        stopped: false,
        revision: 0,
        runControlCapabilitySha256,
        activatedAt: databaseNow,
        updatedAt: databaseNow,
      })
      .onConflictDoNothing()
      .returning({ runId: runTable.runId });

    const current = await findRunForUpdate(tx, authenticated.authorizationId);
    if (!current) conflict();
    if (inserted[0]) {
      const postClaimDatabaseNow = await readDatabaseNow(tx);
      if (
        decidedAt.getTime() > postClaimDatabaseNow.getTime() ||
        expiresAt.getTime() <= postClaimDatabaseNow.getTime()
      ) {
        expired();
      }
    }
    assertExactActivationReplay(current, {
      authenticated,
      runId,
      runControlCapabilitySha256,
    });
    await assertRelationalState(tx, current);
    return {
      outcome: inserted[0] ? ("activated" as const) : ("replayed" as const),
      run: normalizeRun(current),
    };
  });
}

async function allocateSessionLease(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    runId: string;
    expectedRevision: number;
    sessionBindingSha256: string;
    expiresAt: string;
    workerEvidenceCapability: string;
    terminationCapability: string;
  }
) {
  const request = exactRecord(input, [
    "runId",
    "expectedRevision",
    "sessionBindingSha256",
    "expiresAt",
    "workerEvidenceCapability",
    "terminationCapability",
  ]);
  if (
    !isSha256(request.runId) ||
    !nonNegativeInteger(request.expectedRevision) ||
    !isSha256(request.sessionBindingSha256)
  ) {
    invalid();
  }
  const expiresAt = parseWholeSecond(request.expiresAt);
  const workerCapabilitySha256 = capabilityHash(
    WORKER_EVIDENCE_CAPABILITY_DOMAIN,
    request.workerEvidenceCapability
  );
  const terminationCapabilitySha256 = capabilityHash(
    TERMINATION_CAPABILITY_DOMAIN,
    request.terminationCapability
  );
  const workerAsTerminationCapabilitySha256 = capabilityHash(
    TERMINATION_CAPABILITY_DOMAIN,
    request.workerEvidenceCapability
  );
  const workerAsRunControlCapabilitySha256 = capabilityHash(
    PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_DOMAIN,
    request.workerEvidenceCapability
  );
  const terminationAsWorkerCapabilitySha256 = capabilityHash(
    WORKER_EVIDENCE_CAPABILITY_DOMAIN,
    request.terminationCapability
  );
  const terminationAsRunControlCapabilitySha256 = capabilityHash(
    PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_DOMAIN,
    request.terminationCapability
  );
  if (
    timingSafeHexEqual(
      workerAsTerminationCapabilitySha256,
      terminationCapabilitySha256
    )
  ) {
    invalid();
  }

  return database.transaction(async (tx) => {
    const run = await lockRun(tx, request.runId as string);
    await assertRelationalState(tx, run);
    const databaseNow = await readDatabaseNow(tx);
    if (
      timingSafeHexEqual(
        run.runControlCapabilitySha256,
        workerAsRunControlCapabilitySha256
      ) ||
      timingSafeHexEqual(
        run.runControlCapabilitySha256,
        terminationAsRunControlCapabilitySha256
      )
    ) {
      invalid();
    }
    const existing = await tx
      .select()
      .from(leaseTable)
      .where(
        and(
          eq(leaseTable.runId, run.runId),
          eq(
            leaseTable.sessionBindingSha256,
            request.sessionBindingSha256 as string
          )
        )
      )
      .limit(1);
    if (existing[0]) {
      if (
        request.expectedRevision !== existing[0].allocationLedgerRevision - 1 ||
        existing[0].expiresAt.getTime() !== expiresAt.getTime() ||
        !timingSafeHexEqual(
          existing[0].workerEvidenceCapabilitySha256,
          workerCapabilitySha256
        ) ||
        !timingSafeHexEqual(
          existing[0].terminationCapabilitySha256,
          terminationCapabilitySha256
        )
      ) {
        conflict();
      }
      if (
        existing[0].state !== "open" ||
        existing[0].expiresAt.getTime() <= databaseNow.getTime()
      ) {
        return {
          outcome: "replayed_closed" as const,
          run: normalizeRun(run),
          lease_id: existing[0].leaseId,
          lease_state:
            existing[0].state === "open"
              ? ("expired" as const)
              : (existing[0].state as
                  | "revoked"
                  | "settled"
                  | "stopped"
                  | "stop_incomplete"
                  | "termination_acknowledged"),
        };
      }
      return {
        outcome: "replayed" as const,
        run: normalizeRun(run),
        lease: normalizeLease(existing[0]),
      };
    }
    const crossChannelReuse = await tx
      .select({ leaseId: leaseTable.leaseId })
      .from(leaseTable)
      .where(
        and(
          eq(leaseTable.runId, run.runId),
          or(
            eq(
              leaseTable.terminationCapabilitySha256,
              workerAsTerminationCapabilitySha256
            ),
            eq(
              leaseTable.workerEvidenceCapabilitySha256,
              terminationAsWorkerCapabilitySha256
            )
          )
        )
      )
      .limit(1);
    if (crossChannelReuse[0]) invalid();
    if (run.revision !== request.expectedRevision) stale();
    if (
      run.stopped ||
      run.authorizationExpiresAt.getTime() <= databaseNow.getTime() ||
      expiresAt.getTime() <= databaseNow.getTime() ||
      expiresAt.getTime() > databaseNow.getTime() + MAXIMUM_LEASE_TTL_MS ||
      expiresAt.getTime() > run.authorizationExpiresAt.getTime() ||
      run.allocatedSessionCount >= MAXIMUM_SESSIONS
    ) {
      denied();
    }
    const accounted = accountedSpend(run);
    const projected = accounted + SESSION_LEASE_RESERVATION_NANO_USD;
    if (
      !Number.isSafeInteger(projected) ||
      projected > MAXIMUM_SPEND_NANO_USD ||
      projected > MAXIMUM_CUMULATIVE_SPEND_NANO_USD
    ) {
      denied();
    }
    const sessionOrdinal = run.allocatedSessionCount + 1;
    const allocationRevision = run.revision + 1;
    const leasePayload = {
      contract_version: PREVIEW_SHADOW_SESSION_LEASE_VERSION,
      run_id: run.runId,
      authorization_id: run.authorizationId,
      candidate_git_sha: run.candidateGitSha,
      preview_shadow_configuration_sha256: run.previewShadowConfigurationSha256,
      adapter_id: "meelni_director_openai_responses" as const,
      adapter_version:
        "interview-director-adapter.openai-responses.v1" as const,
      provider: "openai-api" as const,
      model: "gpt-5.4-mini-2026-03-17" as const,
      target_stage: "preview_shadow" as const,
      target_environment: "preview_staging" as const,
      target_cohort: "shadow" as const,
      exposure: "none" as const,
      session_ordinal: sessionOrdinal,
      session_binding_sha256: request.sessionBindingSha256 as string,
      session_budget_nano_usd: SESSION_LEASE_RESERVATION_NANO_USD as 1000000000,
      maximum_attempts: MAXIMUM_ATTEMPTS as 10,
      attempt_reservation_nano_usd: ATTEMPT_RESERVATION_NANO_USD as 100000000,
      issued_at: databaseNow.toISOString(),
      expires_at: expiresAt.toISOString(),
      allocation_ledger_revision: allocationRevision,
    };
    const leaseId = digest(
      PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
      leasePayload
    );
    const lease: DurablePreviewShadowSessionLease = deepFreeze({
      ...leasePayload,
      lease_id: leaseId,
      integrity_sha256: leaseId,
    });
    await tx.insert(leaseTable).values({
      leaseId,
      contractVersion: lease.contract_version,
      integritySha256: lease.integrity_sha256,
      runId: lease.run_id,
      authorizationId: lease.authorization_id,
      candidateGitSha: lease.candidate_git_sha,
      previewShadowConfigurationSha256:
        lease.preview_shadow_configuration_sha256,
      adapterId: lease.adapter_id,
      adapterVersion: lease.adapter_version,
      provider: lease.provider,
      model: lease.model,
      targetStage: lease.target_stage,
      targetEnvironment: lease.target_environment,
      targetCohort: lease.target_cohort,
      exposure: lease.exposure,
      sessionOrdinal: lease.session_ordinal,
      sessionBindingSha256: lease.session_binding_sha256,
      sessionBudgetNanoUsd: lease.session_budget_nano_usd,
      maximumAttempts: lease.maximum_attempts,
      attemptReservationNanoUsd: lease.attempt_reservation_nano_usd,
      issuedAt: databaseNow,
      expiresAt,
      allocationLedgerRevision: allocationRevision,
      workerEvidenceCapabilitySha256: workerCapabilitySha256,
      terminationCapabilitySha256,
      state: "open",
      updatedAt: databaseNow,
    });

    const automaticStopReason =
      sessionOrdinal >= MAXIMUM_SESSIONS
        ? "maximum_sessions_reached"
        : projected >= MAXIMUM_CUMULATIVE_SPEND_NANO_USD
          ? "maximum_cumulative_spend_reached"
          : projected >= MAXIMUM_SPEND_NANO_USD
            ? "maximum_spend_reached"
            : null;
    let nextRevision = allocationRevision;
    if (automaticStopReason) {
      nextRevision += 1;
      const event = createCohortStopEvent({
        runId: run.runId,
        reason: automaticStopReason,
        evidenceSha256: leaseId,
        observedAt: databaseNow.toISOString(),
      });
      await insertStopEvent(tx, event, nextRevision);
    }
    const updated = await tx
      .update(runTable)
      .set({
        allocatedSessionCount: sessionOrdinal,
        outstandingSessionReservationsNanoUsd:
          run.outstandingSessionReservationsNanoUsd +
          SESSION_LEASE_RESERVATION_NANO_USD,
        stopped: automaticStopReason !== null,
        revision: nextRevision,
        updatedAt: databaseNow,
      })
      .where(
        and(eq(runTable.runId, run.runId), eq(runTable.revision, run.revision))
      )
      .returning();
    if (!updated[0]) stale();
    await assertRelationalState(tx, updated[0]);
    const completionDatabaseNow = await readDatabaseNow(tx);
    if (
      expiresAt.getTime() <= completionDatabaseNow.getTime() ||
      updated[0].authorizationExpiresAt.getTime() <=
        completionDatabaseNow.getTime()
    ) {
      denied();
    }
    return {
      outcome: "allocated" as const,
      run: normalizeRun(updated[0]),
      lease,
    };
  });
}

async function reconcileSessionReceipt(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    runId: string;
    expectedRevision: number;
    workerEvidenceCapability: string;
    receipt: unknown;
  }
) {
  const request = exactRecord(input, [
    "runId",
    "expectedRevision",
    "workerEvidenceCapability",
    "receipt",
  ]);
  if (
    !isSha256(request.runId) ||
    !nonNegativeInteger(request.expectedRevision)
  ) {
    invalid();
  }
  const receipt = parseSessionReceipt(request.receipt);
  if (receipt.run_id !== request.runId) invalid();
  const capabilitySha256 = capabilityHash(
    WORKER_EVIDENCE_CAPABILITY_DOMAIN,
    request.workerEvidenceCapability
  );

  return database.transaction(async (tx) => {
    const run = await lockRun(tx, request.runId as string);
    await assertRelationalState(tx, run);
    const lease = await lockLease(tx, receipt.lease_id);
    if (lease.runId !== run.runId) invalid();
    assertCapability(lease.workerEvidenceCapabilitySha256, capabilitySha256);
    const existing = await tx
      .select()
      .from(receiptTable)
      .where(eq(receiptTable.leaseId, lease.leaseId))
      .limit(1);
    if (existing[0]) {
      if (
        existing[0].receiptId !== receipt.receipt_id ||
        request.expectedRevision !== existing[0].recordedLedgerRevision - 1
      ) {
        conflict();
      }
      return {
        outcome: "replayed" as const,
        run: normalizeRun(run),
        receipt: normalizeReceipt(existing[0]),
      };
    }
    if (run.revision !== request.expectedRevision) stale();
    if (
      (lease.state !== "open" && lease.state !== "revoked") ||
      lease.sessionOrdinal !== receipt.session_ordinal ||
      lease.allocationLedgerRevision !== receipt.allocation_ledger_revision ||
      lease.previewShadowConfigurationSha256 !==
        receipt.preview_shadow_configuration_sha256
    ) {
      conflict();
    }
    const existingIncident = await tx
      .select({ incidentId: incidentTable.incidentId })
      .from(incidentTable)
      .where(eq(incidentTable.leaseId, lease.leaseId))
      .limit(1);
    if (existingIncident[0]) conflict();
    const databaseNow = await readDatabaseNow(tx);
    const nextRevision = run.revision + 1;
    const reconciled =
      run.reconciledSpendNanoUsd + receipt.reconciled_spend_nano_usd;
    const outstanding =
      run.outstandingSessionReservationsNanoUsd -
      SESSION_LEASE_RESERVATION_NANO_USD;
    const accounted =
      reconciled + outstanding + run.stopIncompleteExcessSpendNanoUsd;
    if (
      !safeIntegerBetween(
        reconciled,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      ) ||
      !safeIntegerBetween(outstanding, 0, MAXIMUM_SPEND_NANO_USD) ||
      !safeIntegerBetween(
        accounted,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      )
    ) {
      invariant();
    }
    await tx.insert(receiptTable).values({
      receiptId: receipt.receipt_id,
      contractVersion: receipt.contract_version,
      integritySha256: receipt.integrity_sha256,
      runId: receipt.run_id,
      leaseId: receipt.lease_id,
      sessionOrdinal: receipt.session_ordinal,
      allocationLedgerRevision: receipt.allocation_ledger_revision,
      previewShadowConfigurationSha256:
        receipt.preview_shadow_configuration_sha256,
      outcome: receipt.outcome,
      attemptCount: receipt.attempt_count,
      reconciledSpendNanoUsd: receipt.reconciled_spend_nano_usd,
      outstandingAttemptReservationsNanoUsd:
        receipt.outstanding_attempt_reservations_nano_usd,
      attemptReceiptsSha256: receipt.attempt_receipts_sha256,
      settledAt: parseWholeSecond(receipt.settled_at),
      recordedLedgerRevision: nextRevision,
    });
    await tx
      .update(leaseTable)
      .set({
        state: receipt.outcome === "settled" ? "settled" : "stopped",
        updatedAt: databaseNow,
      })
      .where(
        and(
          eq(leaseTable.leaseId, lease.leaseId),
          eq(leaseTable.state, lease.state)
        )
      );
    const updated = await tx
      .update(runTable)
      .set({
        reconciledSpendNanoUsd: reconciled,
        outstandingSessionReservationsNanoUsd: outstanding,
        stopped:
          run.stopped ||
          receipt.outcome === "stopped" ||
          accounted >= MAXIMUM_SPEND_NANO_USD ||
          accounted >= MAXIMUM_CUMULATIVE_SPEND_NANO_USD,
        revision: nextRevision,
        updatedAt: databaseNow,
      })
      .where(
        and(eq(runTable.runId, run.runId), eq(runTable.revision, run.revision))
      )
      .returning();
    if (!updated[0]) stale();
    await assertRelationalState(tx, updated[0]);
    return {
      outcome: "recorded" as const,
      run: normalizeRun(updated[0]),
      receipt,
    };
  });
}

async function recordStopIncompleteIncident(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    runId: string;
    expectedRevision: number;
    workerEvidenceCapability: string;
    incident: unknown;
  }
) {
  const request = exactRecord(input, [
    "runId",
    "expectedRevision",
    "workerEvidenceCapability",
    "incident",
  ]);
  if (
    !isSha256(request.runId) ||
    !nonNegativeInteger(request.expectedRevision)
  ) {
    invalid();
  }
  const incident = parseStopIncompleteIncident(request.incident);
  if (incident.run_id !== request.runId) invalid();
  const capabilitySha256 = capabilityHash(
    WORKER_EVIDENCE_CAPABILITY_DOMAIN,
    request.workerEvidenceCapability
  );

  return database.transaction(async (tx) => {
    const run = await lockRun(tx, request.runId as string);
    await assertRelationalState(tx, run);
    const lease = await lockLease(tx, incident.lease_id);
    if (lease.runId !== run.runId) invalid();
    assertCapability(lease.workerEvidenceCapabilitySha256, capabilitySha256);
    const existing = await tx
      .select()
      .from(incidentTable)
      .where(eq(incidentTable.leaseId, lease.leaseId))
      .limit(1);
    if (existing[0]) {
      if (
        existing[0].incidentId !== incident.incident_id ||
        request.expectedRevision !== existing[0].recordedLedgerRevision - 1
      ) {
        conflict();
      }
      return {
        outcome: "replayed" as const,
        run: normalizeRun(run),
        incident: normalizeIncident(existing[0]),
      };
    }
    if (run.revision !== request.expectedRevision) stale();
    if (
      (lease.state !== "open" && lease.state !== "revoked") ||
      lease.sessionOrdinal !== incident.session_ordinal ||
      lease.allocationLedgerRevision !== incident.allocation_ledger_revision ||
      lease.previewShadowConfigurationSha256 !==
        incident.preview_shadow_configuration_sha256
    ) {
      conflict();
    }
    const existingReceipt = await tx
      .select({ receiptId: receiptTable.receiptId })
      .from(receiptTable)
      .where(eq(receiptTable.leaseId, lease.leaseId))
      .limit(1);
    if (existingReceipt[0]) conflict();
    const databaseNow = await readDatabaseNow(tx);
    const nextRevision = run.revision + 1;
    const excess = Math.max(
      0,
      incident.reconciled_spend_nano_usd - SESSION_LEASE_RESERVATION_NANO_USD
    );
    const nextExcess = run.stopIncompleteExcessSpendNanoUsd + excess;
    const accounted =
      run.reconciledSpendNanoUsd +
      run.outstandingSessionReservationsNanoUsd +
      nextExcess;
    if (
      !safeIntegerBetween(
        nextExcess,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      ) ||
      !safeIntegerBetween(
        accounted,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      )
    ) {
      invariant();
    }
    await tx.insert(incidentTable).values({
      incidentId: incident.incident_id,
      contractVersion: incident.contract_version,
      integritySha256: incident.integrity_sha256,
      runId: incident.run_id,
      leaseId: incident.lease_id,
      sessionOrdinal: incident.session_ordinal,
      allocationLedgerRevision: incident.allocation_ledger_revision,
      previewShadowConfigurationSha256:
        incident.preview_shadow_configuration_sha256,
      reason: incident.reason,
      attemptCount: incident.attempt_count,
      reconciledSpendNanoUsd: incident.reconciled_spend_nano_usd,
      retainedSessionReservationNanoUsd:
        incident.retained_session_reservation_nano_usd,
      attemptReceiptsSha256: incident.attempt_receipts_sha256,
      observedAt: parseWholeSecond(incident.observed_at),
      requiresAllocationStop: incident.requires_allocation_stop,
      terminationAcknowledgementRequired:
        incident.termination_acknowledgement_required,
      recordedLedgerRevision: nextRevision,
    });
    await tx
      .update(leaseTable)
      .set({ state: "stop_incomplete", updatedAt: databaseNow })
      .where(
        and(
          eq(leaseTable.leaseId, lease.leaseId),
          eq(leaseTable.state, lease.state)
        )
      );
    const updated = await tx
      .update(runTable)
      .set({
        stopIncompleteExcessSpendNanoUsd: nextExcess,
        stopped: true,
        revision: nextRevision,
        updatedAt: databaseNow,
      })
      .where(
        and(eq(runTable.runId, run.runId), eq(runTable.revision, run.revision))
      )
      .returning();
    if (!updated[0]) stale();
    await assertRelationalState(tx, updated[0]);
    return {
      outcome: "recorded" as const,
      run: normalizeRun(updated[0]),
      incident,
    };
  });
}

async function recordCohortStopEvent(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    runId: string;
    expectedRevision: number;
    runControlCapability: string;
    event: unknown;
  }
) {
  const request = exactRecord(input, [
    "runId",
    "expectedRevision",
    "runControlCapability",
    "event",
  ]);
  if (
    !isSha256(request.runId) ||
    !nonNegativeInteger(request.expectedRevision)
  ) {
    invalid();
  }
  const event = parseCohortStopEvent(request.event);
  if (event.run_id !== request.runId) invalid();
  const capabilitySha256 = capabilityHash(
    PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_DOMAIN,
    request.runControlCapability
  );
  return database.transaction(async (tx) => {
    const run = await lockRun(tx, request.runId as string);
    await assertRelationalState(tx, run);
    assertCapability(run.runControlCapabilitySha256, capabilitySha256);
    const existing = await tx
      .select()
      .from(stopEventTable)
      .where(
        and(
          eq(stopEventTable.runId, run.runId),
          eq(stopEventTable.reason, event.reason)
        )
      )
      .limit(1);
    if (existing[0]) {
      if (
        existing[0].stopEventId !== event.stop_event_id ||
        request.expectedRevision !== existing[0].recordedLedgerRevision - 1
      ) {
        conflict();
      }
      return {
        outcome: "replayed" as const,
        run: normalizeRun(run),
        event: normalizeStopEvent(existing[0]),
      };
    }
    if (run.revision !== request.expectedRevision) stale();
    const databaseNow = await readDatabaseNow(tx);
    const nextRevision = run.revision + 1;
    await insertStopEvent(tx, event, nextRevision);
    await tx
      .update(leaseTable)
      .set({ state: "revoked", updatedAt: databaseNow })
      .where(
        and(eq(leaseTable.runId, run.runId), eq(leaseTable.state, "open"))
      );
    const updated = await tx
      .update(runTable)
      .set({ stopped: true, revision: nextRevision, updatedAt: databaseNow })
      .where(
        and(eq(runTable.runId, run.runId), eq(runTable.revision, run.revision))
      )
      .returning();
    if (!updated[0]) stale();
    await assertRelationalState(tx, updated[0]);
    return {
      outcome: "recorded" as const,
      run: normalizeRun(updated[0]),
      event,
    };
  });
}

async function acknowledgeTermination(
  database: PreviewShadowControlPlaneDatabase,
  input: {
    runId: string;
    leaseId: string;
    incidentId: string;
    expectedRevision: number;
    terminationCapability: string;
    disposition: "worker_terminated" | "process_terminated";
    terminationEvidenceSha256: string;
    finalReconciledSpendNanoUsd: number;
  }
) {
  const request = exactRecord(input, [
    "runId",
    "leaseId",
    "incidentId",
    "expectedRevision",
    "terminationCapability",
    "disposition",
    "terminationEvidenceSha256",
    "finalReconciledSpendNanoUsd",
  ]);
  if (
    !isSha256(request.runId) ||
    !isSha256(request.leaseId) ||
    !isSha256(request.incidentId) ||
    !nonNegativeInteger(request.expectedRevision) ||
    !isSha256(request.terminationEvidenceSha256) ||
    !["worker_terminated", "process_terminated"].includes(
      request.disposition as string
    ) ||
    !safeIntegerBetween(
      request.finalReconciledSpendNanoUsd,
      0,
      MAXIMUM_OBSERVED_SESSION_SPEND_NANO_USD
    )
  ) {
    invalid();
  }
  const finalReconciledSpendNanoUsd =
    request.finalReconciledSpendNanoUsd as number;
  const capabilitySha256 = capabilityHash(
    TERMINATION_CAPABILITY_DOMAIN,
    request.terminationCapability
  );
  return database.transaction(async (tx) => {
    const run = await lockRun(tx, request.runId as string);
    await assertRelationalState(tx, run);
    const lease = await lockLease(tx, request.leaseId as string);
    if (lease.runId !== run.runId) invalid();
    assertCapability(lease.terminationCapabilitySha256, capabilitySha256);
    const incidents = await tx
      .select()
      .from(incidentTable)
      .where(eq(incidentTable.incidentId, request.incidentId as string))
      .limit(1);
    const incident = incidents[0];
    if (
      !incident ||
      incident.runId !== run.runId ||
      incident.leaseId !== lease.leaseId
    ) {
      conflict();
    }
    const existing = await tx
      .select()
      .from(acknowledgementTable)
      .where(eq(acknowledgementTable.leaseId, lease.leaseId))
      .limit(1);
    if (existing[0]) {
      if (
        request.expectedRevision !== existing[0].recordedLedgerRevision - 1 ||
        existing[0].incidentId !== request.incidentId ||
        existing[0].disposition !== request.disposition ||
        existing[0].terminationEvidenceSha256 !==
          request.terminationEvidenceSha256 ||
        existing[0].finalReconciledSpendNanoUsd !==
          request.finalReconciledSpendNanoUsd
      ) {
        conflict();
      }
      return {
        outcome: "replayed" as const,
        run: normalizeRun(run),
        acknowledgement: normalizeAcknowledgement(existing[0]),
      };
    }
    if (run.revision !== request.expectedRevision) stale();
    if (
      lease.state !== "stop_incomplete" ||
      finalReconciledSpendNanoUsd < incident.reconciledSpendNanoUsd
    ) {
      conflict();
    }
    const databaseNow = await readDatabaseNow(tx);
    const nextRevision = run.revision + 1;
    const incidentExcess = Math.max(
      0,
      incident.reconciledSpendNanoUsd - SESSION_LEASE_RESERVATION_NANO_USD
    );
    const reconciled = run.reconciledSpendNanoUsd + finalReconciledSpendNanoUsd;
    const outstanding =
      run.outstandingSessionReservationsNanoUsd -
      SESSION_LEASE_RESERVATION_NANO_USD;
    const remainingExcess =
      run.stopIncompleteExcessSpendNanoUsd - incidentExcess;
    const accounted = reconciled + outstanding + remainingExcess;
    if (
      !safeIntegerBetween(
        reconciled,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      ) ||
      !safeIntegerBetween(outstanding, 0, MAXIMUM_SPEND_NANO_USD) ||
      !safeIntegerBetween(
        remainingExcess,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      ) ||
      !safeIntegerBetween(
        accounted,
        0,
        MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
      )
    ) {
      invariant();
    }
    const acknowledgementPayload = {
      contract_version: PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_VERSION,
      run_id: run.runId,
      lease_id: lease.leaseId,
      incident_id: incident.incidentId,
      disposition: request.disposition as
        | "worker_terminated"
        | "process_terminated",
      termination_evidence_sha256: request.terminationEvidenceSha256 as string,
      final_reconciled_spend_nano_usd: finalReconciledSpendNanoUsd,
      acknowledged_at: databaseNow.toISOString(),
    };
    const acknowledgementId = digest(
      PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_DIGEST_VERSION,
      acknowledgementPayload
    );
    const acknowledgement: DurablePreviewShadowTerminationAcknowledgement =
      deepFreeze({
        ...acknowledgementPayload,
        acknowledgement_id: acknowledgementId,
        integrity_sha256: acknowledgementId,
      });
    await tx.insert(acknowledgementTable).values({
      acknowledgementId,
      contractVersion: acknowledgement.contract_version,
      integritySha256: acknowledgement.integrity_sha256,
      runId: acknowledgement.run_id,
      leaseId: acknowledgement.lease_id,
      incidentId: acknowledgement.incident_id,
      disposition: acknowledgement.disposition,
      terminationEvidenceSha256: acknowledgement.termination_evidence_sha256,
      finalReconciledSpendNanoUsd:
        acknowledgement.final_reconciled_spend_nano_usd,
      acknowledgedAt: databaseNow,
      recordedLedgerRevision: nextRevision,
    });
    await tx
      .update(leaseTable)
      .set({ state: "termination_acknowledged", updatedAt: databaseNow })
      .where(
        and(
          eq(leaseTable.leaseId, lease.leaseId),
          eq(leaseTable.state, "stop_incomplete")
        )
      );
    const updated = await tx
      .update(runTable)
      .set({
        reconciledSpendNanoUsd: reconciled,
        outstandingSessionReservationsNanoUsd: outstanding,
        stopIncompleteExcessSpendNanoUsd: remainingExcess,
        stopped: true,
        revision: nextRevision,
        updatedAt: databaseNow,
      })
      .where(
        and(eq(runTable.runId, run.runId), eq(runTable.revision, run.revision))
      )
      .returning();
    if (!updated[0]) stale();
    await assertRelationalState(tx, updated[0]);
    return {
      outcome: "recorded" as const,
      run: normalizeRun(updated[0]),
      acknowledgement,
    };
  });
}

type RunRow = typeof runTable.$inferSelect;
type LeaseRow = typeof leaseTable.$inferSelect;
type ReceiptRow = typeof receiptTable.$inferSelect;
type IncidentRow = typeof incidentTable.$inferSelect;
type StopEventRow = typeof stopEventTable.$inferSelect;
type AcknowledgementRow = typeof acknowledgementTable.$inferSelect;

async function findRunForUpdate(
  tx: PreviewShadowTransaction,
  authorizationId: string
): Promise<RunRow | undefined> {
  const rows = await tx
    .select()
    .from(runTable)
    .where(eq(runTable.authorizationId, authorizationId))
    .limit(1)
    .for("update");
  return rows[0];
}

async function lockRun(
  tx: PreviewShadowTransaction,
  runId: string
): Promise<RunRow> {
  const rows = await tx
    .select()
    .from(runTable)
    .where(eq(runTable.runId, runId))
    .limit(1)
    .for("update");
  if (!rows[0]) denied();
  return rows[0];
}

async function lockLease(
  tx: PreviewShadowTransaction,
  leaseId: string
): Promise<LeaseRow> {
  const rows = await tx
    .select()
    .from(leaseTable)
    .where(eq(leaseTable.leaseId, leaseId))
    .limit(1)
    .for("update");
  if (!rows[0]) denied();
  return rows[0];
}

async function readDatabaseNow(tx: PreviewShadowTransaction): Promise<Date> {
  const rows = await tx.execute<{ databaseNow: Date | string }>(
    sql`SELECT date_trunc('second', clock_timestamp()) AS "databaseNow"`
  );
  const raw = rows[0]?.databaseNow;
  const value = raw instanceof Date ? raw : new Date(raw ?? Number.NaN);
  if (!wholeSecondDate(value)) invariant();
  return value;
}

function assertExactActivationReplay(
  run: RunRow,
  input: {
    authenticated: AuthenticatedPreviewShadowOwnerDecision;
    runId: string;
    runControlCapabilitySha256: string;
  }
): void {
  const { authenticated } = input;
  if (
    run.runId !== input.runId ||
    run.contractVersion !== PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION ||
    run.authorizationContractVersion !==
      authenticated.authorization.contract_version ||
    run.authorizationId !== authenticated.authorizationId ||
    run.authorizationNonce !==
      authenticated.authorization.authorization_nonce ||
    run.ownerDecisionArtifactSha256 !== authenticated.artifactSha256 ||
    run.ownerDecisionReference !== authenticated.ownerDecisionReference ||
    run.ownerDecidedAt.getTime() !==
      parseWholeSecond(authenticated.ownerDecidedAt).getTime() ||
    run.authorizationExpiresAt.getTime() !==
      parseWholeSecond(authenticated.authorizationExpiresAt).getTime() ||
    run.ownerSigningKeyId !== authenticated.ownerSigningKeyId ||
    run.candidateGitSha !== authenticated.candidateGitSha ||
    run.previewShadowConfigurationSha256 !==
      authenticated.previewShadowConfigurationSha256 ||
    run.selectedCandidateConfigurationSha256 !==
      authenticated.selectedCandidateConfigurationSha256 ||
    run.targetStage !== authenticated.targetStage ||
    run.targetEnvironment !== authenticated.targetEnvironment ||
    run.targetCohort !== authenticated.targetCohort ||
    run.exposure !== authenticated.exposure ||
    !timingSafeHexEqual(
      run.runControlCapabilitySha256,
      input.runControlCapabilitySha256
    )
  ) {
    conflict();
  }
}

async function assertRelationalState(
  tx: PreviewShadowTransaction,
  run: RunRow
): Promise<void> {
  assertRunRow(run);
  const leases = await tx
    .select()
    .from(leaseTable)
    .where(eq(leaseTable.runId, run.runId));
  const receipts = await tx
    .select()
    .from(receiptTable)
    .where(eq(receiptTable.runId, run.runId));
  const incidents = await tx
    .select()
    .from(incidentTable)
    .where(eq(incidentTable.runId, run.runId));
  const events = await tx
    .select()
    .from(stopEventTable)
    .where(eq(stopEventTable.runId, run.runId));
  const acknowledgements = await tx
    .select()
    .from(acknowledgementTable)
    .where(eq(acknowledgementTable.runId, run.runId));

  const receiptByLease = new Map(receipts.map((row) => [row.leaseId, row]));
  const incidentByLease = new Map(incidents.map((row) => [row.leaseId, row]));
  const acknowledgementByLease = new Map(
    acknowledgements.map((row) => [row.leaseId, row])
  );
  const sortedLeases = [...leases].sort(
    (left, right) => left.sessionOrdinal - right.sessionOrdinal
  );
  if (
    leases.length !== run.allocatedSessionCount ||
    leases.length > MAXIMUM_SESSIONS ||
    sortedLeases.some((lease, index) => lease.sessionOrdinal !== index + 1)
  ) {
    invariant();
  }

  let outstanding = 0;
  let reconciled = 0;
  let incidentExcess = 0;
  for (const lease of leases) {
    assertLeaseRow(lease, run);
    normalizeLease(lease);
    const receipt = receiptByLease.get(lease.leaseId);
    const incident = incidentByLease.get(lease.leaseId);
    const acknowledgement = acknowledgementByLease.get(lease.leaseId);
    if (lease.state === "open" || lease.state === "revoked") {
      if (receipt || incident || acknowledgement) invariant();
      outstanding += SESSION_LEASE_RESERVATION_NANO_USD;
    } else if (lease.state === "settled" || lease.state === "stopped") {
      if (
        !receipt ||
        incident ||
        acknowledgement ||
        receipt.outcome !== lease.state
      ) {
        invariant();
      }
      reconciled += receipt.reconciledSpendNanoUsd;
      normalizeReceipt(receipt);
    } else if (lease.state === "stop_incomplete") {
      if (!incident || receipt || acknowledgement) invariant();
      outstanding += SESSION_LEASE_RESERVATION_NANO_USD;
      incidentExcess += Math.max(
        0,
        incident.reconciledSpendNanoUsd - SESSION_LEASE_RESERVATION_NANO_USD
      );
      normalizeIncident(incident);
    } else if (lease.state === "termination_acknowledged") {
      if (!incident || !acknowledgement || receipt) invariant();
      if (
        acknowledgement.incidentId !== incident.incidentId ||
        acknowledgement.finalReconciledSpendNanoUsd <
          incident.reconciledSpendNanoUsd
      ) {
        invariant();
      }
      reconciled += acknowledgement.finalReconciledSpendNanoUsd;
      normalizeIncident(incident);
      normalizeAcknowledgement(acknowledgement);
    } else {
      invariant();
    }
  }
  for (const event of events) normalizeStopEvent(event);
  for (const receipt of receipts) {
    const lease = leases.find((row) => row.leaseId === receipt.leaseId);
    if (
      !lease ||
      receipt.sessionOrdinal !== lease.sessionOrdinal ||
      receipt.allocationLedgerRevision !== lease.allocationLedgerRevision ||
      receipt.recordedLedgerRevision <= lease.allocationLedgerRevision
    ) {
      invariant();
    }
  }
  for (const incident of incidents) {
    const lease = leases.find((row) => row.leaseId === incident.leaseId);
    if (
      !lease ||
      incident.sessionOrdinal !== lease.sessionOrdinal ||
      incident.allocationLedgerRevision !== lease.allocationLedgerRevision ||
      incident.recordedLedgerRevision <= lease.allocationLedgerRevision
    ) {
      invariant();
    }
  }
  for (const acknowledgement of acknowledgements) {
    const incident = incidents.find(
      (row) => row.incidentId === acknowledgement.incidentId
    );
    if (
      !incident ||
      acknowledgement.leaseId !== incident.leaseId ||
      acknowledgement.recordedLedgerRevision <= incident.recordedLedgerRevision
    ) {
      invariant();
    }
  }

  const revisions = [
    ...leases.map((row) => row.allocationLedgerRevision),
    ...receipts.map((row) => row.recordedLedgerRevision),
    ...incidents.map((row) => row.recordedLedgerRevision),
    ...events.map((row) => row.recordedLedgerRevision),
    ...acknowledgements.map((row) => row.recordedLedgerRevision),
  ].sort((left, right) => left - right);
  const accounted = reconciled + outstanding + incidentExcess;
  const mustStop =
    incidents.length > 0 ||
    events.length > 0 ||
    receipts.some((row) => row.outcome === "stopped") ||
    leases.length === MAXIMUM_SESSIONS ||
    accounted >= MAXIMUM_SPEND_NANO_USD ||
    accounted >= MAXIMUM_CUMULATIVE_SPEND_NANO_USD;
  if (
    !Number.isSafeInteger(outstanding) ||
    !Number.isSafeInteger(reconciled) ||
    !Number.isSafeInteger(incidentExcess) ||
    !safeIntegerBetween(
      accounted,
      0,
      MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
    ) ||
    run.outstandingSessionReservationsNanoUsd !== outstanding ||
    run.reconciledSpendNanoUsd !== reconciled ||
    run.stopIncompleteExcessSpendNanoUsd !== incidentExcess ||
    run.stopped !== mustStop ||
    revisions.length !== run.revision ||
    revisions.some((revision, index) => revision !== index + 1)
  ) {
    invariant();
  }
}

function assertRunRow(run: RunRow): void {
  if (
    run.contractVersion !== PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION ||
    !isSha256(run.runId) ||
    !isSha256(run.authorizationId) ||
    !isSha256(run.authorizationNonce) ||
    !isSha256(run.ownerDecisionArtifactSha256) ||
    !isSha256(run.previewShadowConfigurationSha256) ||
    !isSha256(run.selectedCandidateConfigurationSha256) ||
    !isSha256(run.runControlCapabilitySha256) ||
    !GIT_SHA.test(run.candidateGitSha) ||
    run.authorizationContractVersion !==
      "adaptive-interviewer-preview-shadow-authorization.v1" ||
    run.targetStage !== "preview_shadow" ||
    run.targetEnvironment !== "preview_staging" ||
    run.targetCohort !== "shadow" ||
    run.exposure !== "none" ||
    run.maximumSessions !== MAXIMUM_SESSIONS ||
    run.maximumSpendNanoUsd !== MAXIMUM_SPEND_NANO_USD ||
    run.maximumCumulativeSpendNanoUsd !== MAXIMUM_CUMULATIVE_SPEND_NANO_USD ||
    !safeIntegerBetween(run.allocatedSessionCount, 0, MAXIMUM_SESSIONS) ||
    !safeIntegerBetween(
      run.reconciledSpendNanoUsd,
      0,
      MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
    ) ||
    !safeIntegerBetween(
      run.outstandingSessionReservationsNanoUsd,
      0,
      MAXIMUM_SPEND_NANO_USD
    ) ||
    !safeIntegerBetween(
      run.stopIncompleteExcessSpendNanoUsd,
      0,
      MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD
    ) ||
    !nonNegativeInteger(run.revision) ||
    typeof run.stopped !== "boolean" ||
    !wholeSecondDate(run.activatedAt) ||
    !wholeSecondDate(run.authorizationExpiresAt) ||
    !wholeSecondDate(run.ownerDecidedAt) ||
    !wholeSecondDate(run.updatedAt) ||
    run.authorizationExpiresAt.getTime() <= run.ownerDecidedAt.getTime() ||
    run.activatedAt.getTime() < run.ownerDecidedAt.getTime() ||
    run.activatedAt.getTime() >= run.authorizationExpiresAt.getTime() ||
    run.updatedAt.getTime() < run.activatedAt.getTime()
  ) {
    invariant();
  }
}

function assertLeaseRow(lease: LeaseRow, run: RunRow): void {
  if (
    lease.runId !== run.runId ||
    lease.authorizationId !== run.authorizationId ||
    lease.candidateGitSha !== run.candidateGitSha ||
    lease.previewShadowConfigurationSha256 !==
      run.previewShadowConfigurationSha256 ||
    lease.contractVersion !== PREVIEW_SHADOW_SESSION_LEASE_VERSION ||
    lease.integritySha256 !== lease.leaseId ||
    lease.adapterId !== "meelni_director_openai_responses" ||
    lease.adapterVersion !== "interview-director-adapter.openai-responses.v1" ||
    lease.provider !== "openai-api" ||
    lease.model !== "gpt-5.4-mini-2026-03-17" ||
    lease.targetStage !== "preview_shadow" ||
    lease.targetEnvironment !== "preview_staging" ||
    lease.targetCohort !== "shadow" ||
    lease.exposure !== "none" ||
    lease.sessionBudgetNanoUsd !== SESSION_LEASE_RESERVATION_NANO_USD ||
    lease.maximumAttempts !== MAXIMUM_ATTEMPTS ||
    lease.attemptReservationNanoUsd !== ATTEMPT_RESERVATION_NANO_USD ||
    !isSha256(lease.leaseId) ||
    !isSha256(lease.sessionBindingSha256) ||
    !isSha256(lease.workerEvidenceCapabilitySha256) ||
    !isSha256(lease.terminationCapabilitySha256) ||
    timingSafeHexEqual(
      lease.workerEvidenceCapabilitySha256,
      lease.terminationCapabilitySha256
    ) ||
    !wholeSecondDate(lease.issuedAt) ||
    !wholeSecondDate(lease.expiresAt) ||
    lease.expiresAt.getTime() <= lease.issuedAt.getTime() ||
    lease.expiresAt.getTime() - lease.issuedAt.getTime() >
      MAXIMUM_LEASE_TTL_MS ||
    lease.expiresAt.getTime() > run.authorizationExpiresAt.getTime() ||
    !safeIntegerBetween(lease.sessionOrdinal, 1, MAXIMUM_SESSIONS) ||
    !safeIntegerBetween(
      lease.allocationLedgerRevision,
      1,
      Number.MAX_SAFE_INTEGER
    )
  ) {
    invariant();
  }
}

const SESSION_RECEIPT_PAYLOAD_KEYS = [
  "contract_version",
  "run_id",
  "lease_id",
  "session_ordinal",
  "allocation_ledger_revision",
  "preview_shadow_configuration_sha256",
  "outcome",
  "attempt_count",
  "reconciled_spend_nano_usd",
  "outstanding_attempt_reservations_nano_usd",
  "attempt_receipts_sha256",
  "settled_at",
] as const;
const SESSION_RECEIPT_KEYS = [
  ...SESSION_RECEIPT_PAYLOAD_KEYS,
  "receipt_id",
  "integrity_sha256",
] as const;
const STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS = [
  "contract_version",
  "run_id",
  "lease_id",
  "session_ordinal",
  "allocation_ledger_revision",
  "preview_shadow_configuration_sha256",
  "reason",
  "attempt_count",
  "reconciled_spend_nano_usd",
  "retained_session_reservation_nano_usd",
  "attempt_receipts_sha256",
  "observed_at",
  "requires_allocation_stop",
  "termination_acknowledgement_required",
] as const;
const STOP_INCOMPLETE_INCIDENT_KEYS = [
  ...STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS,
  "incident_id",
  "integrity_sha256",
] as const;
const COHORT_STOP_EVENT_PAYLOAD_KEYS = [
  "contract_version",
  "run_id",
  "reason",
  "evidence_sha256",
  "observed_at",
] as const;
const COHORT_STOP_EVENT_KEYS = [
  ...COHORT_STOP_EVENT_PAYLOAD_KEYS,
  "stop_event_id",
  "integrity_sha256",
] as const;
const COHORT_STOP_REASONS: readonly PreviewShadowCohortStopReason[] = [
  "evidence_digest_drift",
  "version_pin_mismatch",
  "unauthorized_stage_or_cohort",
  "deterministic_invariant_regression",
  "session_or_transcript_loss",
  "kill_switch_failure",
  "maximum_sessions_reached",
  "maximum_spend_reached",
  "maximum_cumulative_spend_reached",
];

export function createDurablePreviewShadowSessionReceipt(
  payload: Omit<
    DurablePreviewShadowSessionReceipt,
    "receipt_id" | "integrity_sha256"
  >
): DurablePreviewShadowSessionReceipt {
  const record = exactRecord(payload, SESSION_RECEIPT_PAYLOAD_KEYS);
  if (
    record.contract_version !== PREVIEW_SHADOW_SESSION_RECEIPT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !safeIntegerBetween(record.session_ordinal, 1, MAXIMUM_SESSIONS) ||
    !safeIntegerBetween(
      record.allocation_ledger_revision,
      1,
      Number.MAX_SAFE_INTEGER
    ) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    (record.outcome !== "settled" && record.outcome !== "stopped") ||
    !safeIntegerBetween(record.attempt_count, 0, MAXIMUM_ATTEMPTS) ||
    !safeIntegerBetween(
      record.reconciled_spend_nano_usd,
      (record.attempt_count as number) * ATTEMPT_RESERVATION_NANO_USD,
      MAXIMUM_OBSERVED_SESSION_SPEND_NANO_USD
    ) ||
    record.outstanding_attempt_reservations_nano_usd !== 0 ||
    !isSha256(record.attempt_receipts_sha256)
  ) {
    invalid();
  }
  const settledAt = parseWholeSecond(record.settled_at);
  const canonical: Omit<
    DurablePreviewShadowSessionReceipt,
    "receipt_id" | "integrity_sha256"
  > = {
    contract_version: PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: record.run_id,
    lease_id: record.lease_id,
    session_ordinal: record.session_ordinal as number,
    allocation_ledger_revision: record.allocation_ledger_revision as number,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    outcome: record.outcome as "settled" | "stopped",
    attempt_count: record.attempt_count as number,
    reconciled_spend_nano_usd: record.reconciled_spend_nano_usd as number,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: record.attempt_receipts_sha256 as string,
    settled_at: settledAt.toISOString(),
  };
  const receiptId = digest(
    PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    receipt_id: receiptId,
    integrity_sha256: receiptId,
  });
}

export function createDurablePreviewShadowStopIncompleteIncident(
  payload: Omit<
    DurablePreviewShadowStopIncompleteIncident,
    "incident_id" | "integrity_sha256"
  >
): DurablePreviewShadowStopIncompleteIncident {
  const record = exactRecord(payload, STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS);
  if (
    record.contract_version !==
      PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !safeIntegerBetween(record.session_ordinal, 1, MAXIMUM_SESSIONS) ||
    !safeIntegerBetween(
      record.allocation_ledger_revision,
      1,
      Number.MAX_SAFE_INTEGER
    ) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.reason !== "cleanup_unconfirmed" ||
    !safeIntegerBetween(record.attempt_count, 0, MAXIMUM_ATTEMPTS) ||
    !safeIntegerBetween(
      record.reconciled_spend_nano_usd,
      (record.attempt_count as number) * ATTEMPT_RESERVATION_NANO_USD,
      MAXIMUM_OBSERVED_SESSION_SPEND_NANO_USD
    ) ||
    record.retained_session_reservation_nano_usd !==
      SESSION_LEASE_RESERVATION_NANO_USD ||
    !isSha256(record.attempt_receipts_sha256) ||
    record.requires_allocation_stop !== true ||
    record.termination_acknowledgement_required !== true
  ) {
    invalid();
  }
  const observedAt = parseWholeSecond(record.observed_at);
  const canonical: Omit<
    DurablePreviewShadowStopIncompleteIncident,
    "incident_id" | "integrity_sha256"
  > = {
    contract_version: PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
    run_id: record.run_id,
    lease_id: record.lease_id,
    session_ordinal: record.session_ordinal as number,
    allocation_ledger_revision: record.allocation_ledger_revision as number,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    reason: "cleanup_unconfirmed",
    attempt_count: record.attempt_count as number,
    reconciled_spend_nano_usd: record.reconciled_spend_nano_usd as number,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: record.attempt_receipts_sha256 as string,
    observed_at: observedAt.toISOString(),
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  };
  const incidentId = digest(
    PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    incident_id: incidentId,
    integrity_sha256: incidentId,
  });
}

export function createDurablePreviewShadowCohortStopEvent(
  payload: Omit<
    DurablePreviewShadowCohortStopEvent,
    "stop_event_id" | "integrity_sha256"
  >
): DurablePreviewShadowCohortStopEvent {
  const record = exactRecord(payload, COHORT_STOP_EVENT_PAYLOAD_KEYS);
  if (
    record.contract_version !== PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION ||
    !isSha256(record.run_id) ||
    !COHORT_STOP_REASONS.includes(
      record.reason as PreviewShadowCohortStopReason
    ) ||
    !isSha256(record.evidence_sha256)
  ) {
    invalid();
  }
  const observedAt = parseWholeSecond(record.observed_at);
  const canonical: Omit<
    DurablePreviewShadowCohortStopEvent,
    "stop_event_id" | "integrity_sha256"
  > = {
    contract_version: PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION,
    run_id: record.run_id,
    reason: record.reason as PreviewShadowCohortStopReason,
    evidence_sha256: record.evidence_sha256,
    observed_at: observedAt.toISOString(),
  };
  const stopEventId = digest(
    PREVIEW_SHADOW_COHORT_STOP_EVENT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    stop_event_id: stopEventId,
    integrity_sha256: stopEventId,
  });
}

function parseSessionReceipt(
  value: unknown
): DurablePreviewShadowSessionReceipt {
  const record = exactRecord(value, SESSION_RECEIPT_KEYS);
  const recreated = createDurablePreviewShadowSessionReceipt({
    contract_version:
      record.contract_version as typeof PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: record.run_id as string,
    lease_id: record.lease_id as string,
    session_ordinal: record.session_ordinal as number,
    allocation_ledger_revision: record.allocation_ledger_revision as number,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    outcome: record.outcome as "settled" | "stopped",
    attempt_count: record.attempt_count as number,
    reconciled_spend_nano_usd: record.reconciled_spend_nano_usd as number,
    outstanding_attempt_reservations_nano_usd:
      record.outstanding_attempt_reservations_nano_usd as 0,
    attempt_receipts_sha256: record.attempt_receipts_sha256 as string,
    settled_at: record.settled_at as string,
  });
  if (
    recreated.receipt_id !== record.receipt_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalid();
  }
  return recreated;
}

function parseStopIncompleteIncident(
  value: unknown
): DurablePreviewShadowStopIncompleteIncident {
  const record = exactRecord(value, STOP_INCOMPLETE_INCIDENT_KEYS);
  const recreated = createDurablePreviewShadowStopIncompleteIncident({
    contract_version:
      record.contract_version as typeof PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
    run_id: record.run_id as string,
    lease_id: record.lease_id as string,
    session_ordinal: record.session_ordinal as number,
    allocation_ledger_revision: record.allocation_ledger_revision as number,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    reason: record.reason as "cleanup_unconfirmed",
    attempt_count: record.attempt_count as number,
    reconciled_spend_nano_usd: record.reconciled_spend_nano_usd as number,
    retained_session_reservation_nano_usd:
      record.retained_session_reservation_nano_usd as 1000000000,
    attempt_receipts_sha256: record.attempt_receipts_sha256 as string,
    observed_at: record.observed_at as string,
    requires_allocation_stop: record.requires_allocation_stop as true,
    termination_acknowledgement_required:
      record.termination_acknowledgement_required as true,
  });
  if (
    recreated.incident_id !== record.incident_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalid();
  }
  return recreated;
}

function parseCohortStopEvent(
  value: unknown
): DurablePreviewShadowCohortStopEvent {
  const record = exactRecord(value, COHORT_STOP_EVENT_KEYS);
  const recreated = createDurablePreviewShadowCohortStopEvent({
    contract_version:
      record.contract_version as typeof PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION,
    run_id: record.run_id as string,
    reason: record.reason as PreviewShadowCohortStopReason,
    evidence_sha256: record.evidence_sha256 as string,
    observed_at: record.observed_at as string,
  });
  if (
    recreated.stop_event_id !== record.stop_event_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalid();
  }
  return recreated;
}

function createCohortStopEvent(input: {
  runId: string;
  reason: PreviewShadowCohortStopReason;
  evidenceSha256: string;
  observedAt: string;
}): DurablePreviewShadowCohortStopEvent {
  return createDurablePreviewShadowCohortStopEvent({
    contract_version: PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION,
    run_id: input.runId,
    reason: input.reason,
    evidence_sha256: input.evidenceSha256,
    observed_at: input.observedAt,
  });
}

async function insertStopEvent(
  tx: PreviewShadowTransaction,
  event: DurablePreviewShadowCohortStopEvent,
  revision: number
): Promise<void> {
  await tx.insert(stopEventTable).values({
    stopEventId: event.stop_event_id,
    contractVersion: event.contract_version,
    integritySha256: event.integrity_sha256,
    runId: event.run_id,
    reason: event.reason,
    evidenceSha256: event.evidence_sha256,
    observedAt: parseWholeSecond(event.observed_at),
    recordedLedgerRevision: revision,
  });
}

function normalizeRun(run: RunRow): DurablePreviewShadowRun {
  assertRunRow(run);
  return deepFreeze({
    contract_version: PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION,
    run_id: run.runId,
    authorization_id: run.authorizationId,
    candidate_git_sha: run.candidateGitSha,
    preview_shadow_configuration_sha256: run.previewShadowConfigurationSha256,
    selected_candidate_configuration_sha256:
      run.selectedCandidateConfigurationSha256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    maximum_sessions: 25,
    maximum_spend_nano_usd: 25_000_000_000,
    maximum_cumulative_spend_nano_usd: 10_000_000_000,
    allocated_session_count: run.allocatedSessionCount,
    reconciled_spend_nano_usd: run.reconciledSpendNanoUsd,
    outstanding_session_reservations_nano_usd:
      run.outstandingSessionReservationsNanoUsd,
    stop_incomplete_excess_spend_nano_usd: run.stopIncompleteExcessSpendNanoUsd,
    stopped: run.stopped,
    revision: run.revision,
    activated_at: run.activatedAt.toISOString(),
    authorization_expires_at: run.authorizationExpiresAt.toISOString(),
  });
}

function normalizeLease(lease: LeaseRow): DurablePreviewShadowSessionLease {
  const payload = {
    contract_version: PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    run_id: lease.runId,
    authorization_id: lease.authorizationId,
    candidate_git_sha: lease.candidateGitSha,
    preview_shadow_configuration_sha256: lease.previewShadowConfigurationSha256,
    adapter_id: "meelni_director_openai_responses" as const,
    adapter_version: "interview-director-adapter.openai-responses.v1" as const,
    provider: "openai-api" as const,
    model: "gpt-5.4-mini-2026-03-17" as const,
    target_stage: "preview_shadow" as const,
    target_environment: "preview_staging" as const,
    target_cohort: "shadow" as const,
    exposure: "none" as const,
    session_ordinal: lease.sessionOrdinal,
    session_binding_sha256: lease.sessionBindingSha256,
    session_budget_nano_usd: 1_000_000_000 as const,
    maximum_attempts: 10 as const,
    attempt_reservation_nano_usd: 100_000_000 as const,
    issued_at: lease.issuedAt.toISOString(),
    expires_at: lease.expiresAt.toISOString(),
    allocation_ledger_revision: lease.allocationLedgerRevision,
  };
  const leaseId = digest(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION, payload);
  if (lease.leaseId !== leaseId || lease.integritySha256 !== leaseId)
    invariant();
  return deepFreeze({
    ...payload,
    lease_id: leaseId,
    integrity_sha256: leaseId,
  });
}

function normalizeReceipt(row: ReceiptRow): DurablePreviewShadowSessionReceipt {
  const receipt = createDurablePreviewShadowSessionReceipt({
    contract_version: PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
    run_id: row.runId,
    lease_id: row.leaseId,
    session_ordinal: row.sessionOrdinal,
    allocation_ledger_revision: row.allocationLedgerRevision,
    preview_shadow_configuration_sha256: row.previewShadowConfigurationSha256,
    outcome: row.outcome as "settled" | "stopped",
    attempt_count: row.attemptCount,
    reconciled_spend_nano_usd: row.reconciledSpendNanoUsd,
    outstanding_attempt_reservations_nano_usd: 0,
    attempt_receipts_sha256: row.attemptReceiptsSha256,
    settled_at: row.settledAt.toISOString(),
  });
  if (
    receipt.receipt_id !== row.receiptId ||
    receipt.integrity_sha256 !== row.integritySha256
  ) {
    invariant();
  }
  return receipt;
}

function normalizeIncident(
  row: IncidentRow
): DurablePreviewShadowStopIncompleteIncident {
  const incident = createDurablePreviewShadowStopIncompleteIncident({
    contract_version: PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
    run_id: row.runId,
    lease_id: row.leaseId,
    session_ordinal: row.sessionOrdinal,
    allocation_ledger_revision: row.allocationLedgerRevision,
    preview_shadow_configuration_sha256: row.previewShadowConfigurationSha256,
    reason: "cleanup_unconfirmed",
    attempt_count: row.attemptCount,
    reconciled_spend_nano_usd: row.reconciledSpendNanoUsd,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: row.attemptReceiptsSha256,
    observed_at: row.observedAt.toISOString(),
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  });
  if (
    incident.incident_id !== row.incidentId ||
    incident.integrity_sha256 !== row.integritySha256
  ) {
    invariant();
  }
  return incident;
}

function normalizeStopEvent(
  row: StopEventRow
): DurablePreviewShadowCohortStopEvent {
  const event = createDurablePreviewShadowCohortStopEvent({
    contract_version: PREVIEW_SHADOW_COHORT_STOP_EVENT_VERSION,
    run_id: row.runId,
    reason: row.reason as PreviewShadowCohortStopReason,
    evidence_sha256: row.evidenceSha256,
    observed_at: row.observedAt.toISOString(),
  });
  if (
    event.stop_event_id !== row.stopEventId ||
    event.integrity_sha256 !== row.integritySha256
  ) {
    invariant();
  }
  return event;
}

function normalizeAcknowledgement(
  row: AcknowledgementRow
): DurablePreviewShadowTerminationAcknowledgement {
  const payload = {
    contract_version: PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_VERSION,
    run_id: row.runId,
    lease_id: row.leaseId,
    incident_id: row.incidentId,
    disposition: row.disposition as "worker_terminated" | "process_terminated",
    termination_evidence_sha256: row.terminationEvidenceSha256,
    final_reconciled_spend_nano_usd: row.finalReconciledSpendNanoUsd,
    acknowledged_at: row.acknowledgedAt.toISOString(),
  };
  const acknowledgementId = digest(
    PREVIEW_SHADOW_TERMINATION_ACKNOWLEDGEMENT_DIGEST_VERSION,
    payload
  );
  if (
    acknowledgementId !== row.acknowledgementId ||
    acknowledgementId !== row.integritySha256
  ) {
    invariant();
  }
  return deepFreeze({
    ...payload,
    acknowledgement_id: acknowledgementId,
    integrity_sha256: acknowledgementId,
  });
}

function accountedSpend(run: RunRow): number {
  const total =
    run.reconciledSpendNanoUsd +
    run.outstandingSessionReservationsNanoUsd +
    run.stopIncompleteExcessSpendNanoUsd;
  if (
    !safeIntegerBetween(total, 0, MAXIMUM_OBSERVED_AGGREGATE_SPEND_NANO_USD)
  ) {
    invariant();
  }
  return total;
}

function exactRecord<K extends readonly string[]>(
  value: unknown,
  keys: K
): Record<K[number], unknown> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      invalid();
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      invalid();
    }
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !("value" in descriptor) ||
        "get" in descriptor ||
        "set" in descriptor
      ) {
        invalid();
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot as Record<K[number], unknown>;
  } catch {
    invalid();
  }
}

function capabilityHash(domain: string, value: unknown): string {
  if (typeof value !== "string" || !CAPABILITY.test(value)) unauthenticated();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    unauthenticated();
  }
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    unauthenticated();
  }
  return createHash("sha256")
    .update(domain)
    .update("\0")
    .update(decoded)
    .digest("hex");
}

function assertCapability(expected: string, actual: string): void {
  if (!timingSafeHexEqual(expected, actual)) unauthenticated();
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (!isSha256(left) || !isSha256(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function digest(version: string, payload: unknown): string {
  return createHash("sha256")
    .update(version)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function parseWholeSecond(value: unknown): Date {
  if (typeof value !== "string" || value.length !== 24) invalid();
  const parsed = new Date(value);
  if (!wholeSecondDate(parsed) || parsed.toISOString() !== value) invalid();
  return parsed;
}

function wholeSecondDate(value: Date): boolean {
  return (
    Object.getPrototypeOf(value) === Date.prototype &&
    Number.isFinite(value.getTime()) &&
    value.getUTCMilliseconds() === 0
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

async function sanitized<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PreviewShadowControlPlaneError) throw error;
    throw new PreviewShadowControlPlaneError(
      "preview_shadow_control_plane_unavailable"
    );
  }
}

function invalid(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_invalid"
  );
}

function conflict(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_conflict"
  );
}

function stale(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_stale"
  );
}

function denied(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_denied"
  );
}

function expired(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_expired"
  );
}

function unauthenticated(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_unauthenticated"
  );
}

function invariant(): never {
  throw new PreviewShadowControlPlaneError(
    "preview_shadow_control_plane_invariant"
  );
}
