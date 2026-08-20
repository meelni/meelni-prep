import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const adaptiveInterviewerPreviewShadowRun = pgTable(
  "adaptive_interviewer_preview_shadow_run",
  {
    runId: text("run_id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    authorizationContractVersion: text(
      "authorization_contract_version"
    ).notNull(),
    authorizationId: text("authorization_id").notNull(),
    authorizationNonce: text("authorization_nonce").notNull(),
    ownerDecisionArtifactSha256: text(
      "owner_decision_artifact_sha256"
    ).notNull(),
    ownerDecisionReference: text("owner_decision_reference").notNull(),
    ownerDecidedAt: timestamp("owner_decided_at", {
      withTimezone: true,
    }).notNull(),
    authorizationExpiresAt: timestamp("authorization_expires_at", {
      withTimezone: true,
    }).notNull(),
    ownerSigningKeyId: text("owner_signing_key_id").notNull(),
    candidateGitSha: text("candidate_git_sha").notNull(),
    previewShadowConfigurationSha256: text(
      "preview_shadow_configuration_sha256"
    ).notNull(),
    selectedCandidateConfigurationSha256: text(
      "selected_candidate_configuration_sha256"
    ).notNull(),
    targetStage: text("target_stage").notNull(),
    targetEnvironment: text("target_environment").notNull(),
    targetCohort: text("target_cohort").notNull(),
    exposure: text("exposure").notNull(),
    maximumSessions: integer("maximum_sessions").notNull(),
    maximumSpendNanoUsd: bigint("maximum_spend_nano_usd", {
      mode: "number",
    }).notNull(),
    maximumCumulativeSpendNanoUsd: bigint("maximum_cumulative_spend_nano_usd", {
      mode: "number",
    }).notNull(),
    allocatedSessionCount: integer("allocated_session_count")
      .default(0)
      .notNull(),
    reconciledSpendNanoUsd: bigint("reconciled_spend_nano_usd", {
      mode: "number",
    })
      .default(0)
      .notNull(),
    outstandingSessionReservationsNanoUsd: bigint(
      "outstanding_session_reservations_nano_usd",
      { mode: "number" }
    )
      .default(0)
      .notNull(),
    stopIncompleteExcessSpendNanoUsd: bigint(
      "stop_incomplete_excess_spend_nano_usd",
      { mode: "number" }
    )
      .default(0)
      .notNull(),
    stopped: boolean("stopped").default(false).notNull(),
    revision: integer("revision").default(0).notNull(),
    runControlCapabilitySha256: text("run_control_capability_sha256").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    exactContractCheck: check(
      "adaptive_interviewer_preview_shadow_run_contract_check",
      sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-durable-control-plane.v1' AND
          ${table.authorizationContractVersion} = 'adaptive-interviewer-preview-shadow-authorization.v1'`
    ),
    digestShapeCheck: check(
      "adaptive_interviewer_preview_shadow_run_digest_shape_check",
      sql`${table.runId} ~ '^[0-9a-f]{64}$' AND
          ${table.authorizationId} ~ '^[0-9a-f]{64}$' AND
          ${table.authorizationNonce} ~ '^[0-9a-f]{64}$' AND
          ${table.ownerDecisionArtifactSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.previewShadowConfigurationSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.selectedCandidateConfigurationSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.runControlCapabilitySha256} ~ '^[0-9a-f]{64}$' AND
          ${table.candidateGitSha} ~ '^[0-9a-f]{40}$'`
    ),
    targetCheck: check(
      "adaptive_interviewer_preview_shadow_run_target_check",
      sql`${table.targetStage} = 'preview_shadow' AND
          ${table.targetEnvironment} = 'preview_staging' AND
          ${table.targetCohort} = 'shadow' AND
          ${table.exposure} = 'none'`
    ),
    ownerCheck: check(
      "adaptive_interviewer_preview_shadow_run_owner_check",
      sql`${table.ownerDecisionReference} ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$' AND
          ${table.ownerSigningKeyId} ~ '^[A-Za-z0-9._-]{1,80}$' AND
          ${table.authorizationExpiresAt} > ${table.ownerDecidedAt} AND
          ${table.activatedAt} >= ${table.ownerDecidedAt} AND
          ${table.activatedAt} < ${table.authorizationExpiresAt}`
    ),
    capsCheck: check(
      "adaptive_interviewer_preview_shadow_run_caps_check",
      sql`${table.maximumSessions} = 25 AND
          ${table.maximumSpendNanoUsd} = 25000000000 AND
          ${table.maximumCumulativeSpendNanoUsd} = 10000000000 AND
          ${table.allocatedSessionCount} BETWEEN 0 AND 25 AND
          ${table.reconciledSpendNanoUsd} BETWEEN 0 AND 6250000000000 AND
          ${table.outstandingSessionReservationsNanoUsd} BETWEEN 0 AND 25000000000 AND
          ${table.stopIncompleteExcessSpendNanoUsd} BETWEEN 0 AND 6250000000000 AND
          ${table.revision} >= 0`
    ),
    stateIndex: index("adaptive_interviewer_preview_shadow_run_state_idx").on(
      table.stopped,
      table.authorizationExpiresAt
    ),
    authorizationIdUnique: unique(
      "preview_shadow_run_authorization_id_uniq"
    ).on(table.authorizationId),
    authorizationNonceUnique: unique(
      "preview_shadow_run_authorization_nonce_uniq"
    ).on(table.authorizationNonce),
    artifactUnique: unique("preview_shadow_run_artifact_uniq").on(
      table.ownerDecisionArtifactSha256
    ),
    decisionReferenceUnique: unique("preview_shadow_run_decision_ref_uniq").on(
      table.ownerDecisionReference
    ),
  })
);

export const adaptiveInterviewerPreviewShadowSessionLease = pgTable(
  "adaptive_interviewer_preview_shadow_session_lease",
  {
    leaseId: text("lease_id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    integritySha256: text("integrity_sha256").notNull(),
    runId: text("run_id").notNull(),
    authorizationId: text("authorization_id").notNull(),
    candidateGitSha: text("candidate_git_sha").notNull(),
    previewShadowConfigurationSha256: text(
      "preview_shadow_configuration_sha256"
    ).notNull(),
    adapterId: text("adapter_id").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    targetStage: text("target_stage").notNull(),
    targetEnvironment: text("target_environment").notNull(),
    targetCohort: text("target_cohort").notNull(),
    exposure: text("exposure").notNull(),
    sessionOrdinal: integer("session_ordinal").notNull(),
    sessionBindingSha256: text("session_binding_sha256").notNull(),
    sessionBudgetNanoUsd: bigint("session_budget_nano_usd", {
      mode: "number",
    }).notNull(),
    maximumAttempts: integer("maximum_attempts").notNull(),
    attemptReservationNanoUsd: bigint("attempt_reservation_nano_usd", {
      mode: "number",
    }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    allocationLedgerRevision: integer("allocation_ledger_revision").notNull(),
    workerEvidenceCapabilitySha256: text(
      "worker_evidence_capability_sha256"
    ).notNull(),
    terminationCapabilitySha256: text(
      "termination_capability_sha256"
    ).notNull(),
    state: text("state").default("open").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    digestCheck: check(
      "adaptive_interviewer_preview_shadow_lease_digest_check",
      sql`${table.leaseId} ~ '^[0-9a-f]{64}$' AND
          ${table.integritySha256} = ${table.leaseId} AND
          ${table.runId} ~ '^[0-9a-f]{64}$' AND
          ${table.authorizationId} ~ '^[0-9a-f]{64}$' AND
          ${table.candidateGitSha} ~ '^[0-9a-f]{40}$' AND
          ${table.previewShadowConfigurationSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.sessionBindingSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.workerEvidenceCapabilitySha256} ~ '^[0-9a-f]{64}$' AND
          ${table.terminationCapabilitySha256} ~ '^[0-9a-f]{64}$'`
    ),
    contractCheck: check(
      "adaptive_interviewer_preview_shadow_lease_contract_check",
      sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-session-lease.v1' AND
          ${table.adapterId} = 'meelni_director_openai_responses' AND
          ${table.adapterVersion} = 'interview-director-adapter.openai-responses.v1' AND
          ${table.provider} = 'openai-api' AND
          ${table.model} = 'gpt-5.4-mini-2026-03-17' AND
          ${table.targetStage} = 'preview_shadow' AND
          ${table.targetEnvironment} = 'preview_staging' AND
          ${table.targetCohort} = 'shadow' AND
          ${table.exposure} = 'none'`
    ),
    limitsCheck: check(
      "adaptive_interviewer_preview_shadow_lease_limits_check",
      sql`${table.sessionOrdinal} BETWEEN 1 AND 25 AND
          ${table.sessionBudgetNanoUsd} = 1000000000 AND
          ${table.maximumAttempts} = 10 AND
          ${table.attemptReservationNanoUsd} = 100000000 AND
          ${table.allocationLedgerRevision} > 0 AND
          ${table.expiresAt} > ${table.issuedAt} AND
          ${table.expiresAt} <= ${table.issuedAt} + interval '1 hour'`
    ),
    stateCheck: check(
      "adaptive_interviewer_preview_shadow_lease_state_check",
      sql`${table.state} IN ('open', 'settled', 'stopped', 'stop_incomplete', 'termination_acknowledged')`
    ),
    runOrdinalUnique: unique(
      "adaptive_interviewer_preview_shadow_lease_run_ordinal_uniq"
    ).on(table.runId, table.sessionOrdinal),
    runBindingUnique: unique(
      "adaptive_interviewer_preview_shadow_lease_run_binding_uniq"
    ).on(table.runId, table.sessionBindingSha256),
    runRevisionUnique: unique(
      "adaptive_interviewer_preview_shadow_lease_run_revision_uniq"
    ).on(table.runId, table.allocationLedgerRevision),
    evidenceBindingUnique: unique(
      "preview_shadow_lease_evidence_binding_uniq"
    ).on(
      table.runId,
      table.leaseId,
      table.sessionOrdinal,
      table.allocationLedgerRevision,
      table.previewShadowConfigurationSha256
    ),
    workerCapabilityUnique: unique(
      "preview_shadow_lease_worker_capability_uniq"
    ).on(table.workerEvidenceCapabilitySha256),
    terminationCapabilityUnique: unique(
      "preview_shadow_lease_termination_capability_uniq"
    ).on(table.terminationCapabilitySha256),
    recoveryIndex: index(
      "adaptive_interviewer_preview_shadow_lease_recovery_idx"
    ).on(table.state, table.expiresAt),
    runForeignKey: foreignKey({
      columns: [table.runId],
      foreignColumns: [adaptiveInterviewerPreviewShadowRun.runId],
      name: "preview_shadow_lease_run_fk",
    }),
  })
);

export const adaptiveInterviewerPreviewShadowSessionReceipt = pgTable(
  "adaptive_interviewer_preview_shadow_session_receipt",
  {
    receiptId: text("receipt_id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    integritySha256: text("integrity_sha256").notNull(),
    runId: text("run_id").notNull(),
    leaseId: text("lease_id").notNull(),
    sessionOrdinal: integer("session_ordinal").notNull(),
    allocationLedgerRevision: integer("allocation_ledger_revision").notNull(),
    previewShadowConfigurationSha256: text(
      "preview_shadow_configuration_sha256"
    ).notNull(),
    outcome: text("outcome").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    reconciledSpendNanoUsd: bigint("reconciled_spend_nano_usd", {
      mode: "number",
    }).notNull(),
    outstandingAttemptReservationsNanoUsd: bigint(
      "outstanding_attempt_reservations_nano_usd",
      { mode: "number" }
    ).notNull(),
    attemptReceiptsSha256: text("attempt_receipts_sha256").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull(),
    recordedLedgerRevision: integer("recorded_ledger_revision").notNull(),
  },
  (table) => ({
    digestCheck: check(
      "adaptive_interviewer_preview_shadow_receipt_digest_check",
      sql`${table.receiptId} ~ '^[0-9a-f]{64}$' AND
          ${table.integritySha256} = ${table.receiptId} AND
          ${table.runId} ~ '^[0-9a-f]{64}$' AND
          ${table.leaseId} ~ '^[0-9a-f]{64}$' AND
          ${table.previewShadowConfigurationSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.attemptReceiptsSha256} ~ '^[0-9a-f]{64}$'`
    ),
    shapeCheck: check(
      "adaptive_interviewer_preview_shadow_receipt_shape_check",
      sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-session-receipt.v1' AND
          ${table.outcome} IN ('settled', 'stopped') AND
          ${table.sessionOrdinal} BETWEEN 1 AND 25 AND
          ${table.allocationLedgerRevision} > 0 AND
          ${table.recordedLedgerRevision} > ${table.allocationLedgerRevision} AND
          ${table.attemptCount} BETWEEN 0 AND 10 AND
          ${table.reconciledSpendNanoUsd} BETWEEN ${table.attemptCount} * 100000000::bigint AND 250000000000 AND
          ${table.outstandingAttemptReservationsNanoUsd} = 0`
    ),
    runRevisionUnique: unique(
      "adaptive_interviewer_preview_shadow_receipt_run_revision_uniq"
    ).on(table.runId, table.recordedLedgerRevision),
    leaseUnique: unique("preview_shadow_receipt_lease_uniq").on(table.leaseId),
    exactLeaseForeignKey: foreignKey({
      columns: [
        table.runId,
        table.leaseId,
        table.sessionOrdinal,
        table.allocationLedgerRevision,
        table.previewShadowConfigurationSha256,
      ],
      foreignColumns: [
        adaptiveInterviewerPreviewShadowSessionLease.runId,
        adaptiveInterviewerPreviewShadowSessionLease.leaseId,
        adaptiveInterviewerPreviewShadowSessionLease.sessionOrdinal,
        adaptiveInterviewerPreviewShadowSessionLease.allocationLedgerRevision,
        adaptiveInterviewerPreviewShadowSessionLease.previewShadowConfigurationSha256,
      ],
      name: "preview_shadow_receipt_exact_lease_fk",
    }),
  })
);

export const adaptiveInterviewerPreviewShadowStopIncompleteIncident = pgTable(
  "adaptive_interviewer_preview_shadow_stop_incomplete_incident",
  {
    incidentId: text("incident_id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    integritySha256: text("integrity_sha256").notNull(),
    runId: text("run_id").notNull(),
    leaseId: text("lease_id").notNull(),
    sessionOrdinal: integer("session_ordinal").notNull(),
    allocationLedgerRevision: integer("allocation_ledger_revision").notNull(),
    previewShadowConfigurationSha256: text(
      "preview_shadow_configuration_sha256"
    ).notNull(),
    reason: text("reason").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    reconciledSpendNanoUsd: bigint("reconciled_spend_nano_usd", {
      mode: "number",
    }).notNull(),
    retainedSessionReservationNanoUsd: bigint(
      "retained_session_reservation_nano_usd",
      { mode: "number" }
    ).notNull(),
    attemptReceiptsSha256: text("attempt_receipts_sha256").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    requiresAllocationStop: boolean("requires_allocation_stop").notNull(),
    terminationAcknowledgementRequired: boolean(
      "termination_acknowledgement_required"
    ).notNull(),
    recordedLedgerRevision: integer("recorded_ledger_revision").notNull(),
  },
  (table) => ({
    digestCheck: check(
      "adaptive_interviewer_preview_shadow_incident_digest_check",
      sql`${table.incidentId} ~ '^[0-9a-f]{64}$' AND
          ${table.integritySha256} = ${table.incidentId} AND
          ${table.runId} ~ '^[0-9a-f]{64}$' AND
          ${table.leaseId} ~ '^[0-9a-f]{64}$' AND
          ${table.previewShadowConfigurationSha256} ~ '^[0-9a-f]{64}$' AND
          ${table.attemptReceiptsSha256} ~ '^[0-9a-f]{64}$'`
    ),
    shapeCheck: check(
      "adaptive_interviewer_preview_shadow_incident_shape_check",
      sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1' AND
          ${table.reason} = 'cleanup_unconfirmed' AND
          ${table.sessionOrdinal} BETWEEN 1 AND 25 AND
          ${table.allocationLedgerRevision} > 0 AND
          ${table.recordedLedgerRevision} > ${table.allocationLedgerRevision} AND
          ${table.attemptCount} BETWEEN 0 AND 10 AND
          ${table.reconciledSpendNanoUsd} BETWEEN ${table.attemptCount} * 100000000::bigint AND 250000000000 AND
          ${table.retainedSessionReservationNanoUsd} = 1000000000 AND
          ${table.requiresAllocationStop} AND
          ${table.terminationAcknowledgementRequired}`
    ),
    runRevisionUnique: unique(
      "adaptive_interviewer_preview_shadow_incident_run_revision_uniq"
    ).on(table.runId, table.recordedLedgerRevision),
    leaseUnique: unique("preview_shadow_incident_lease_uniq").on(table.leaseId),
    acknowledgementBindingUnique: unique(
      "preview_shadow_incident_ack_binding_uniq"
    ).on(table.runId, table.leaseId, table.incidentId),
    exactLeaseForeignKey: foreignKey({
      columns: [
        table.runId,
        table.leaseId,
        table.sessionOrdinal,
        table.allocationLedgerRevision,
        table.previewShadowConfigurationSha256,
      ],
      foreignColumns: [
        adaptiveInterviewerPreviewShadowSessionLease.runId,
        adaptiveInterviewerPreviewShadowSessionLease.leaseId,
        adaptiveInterviewerPreviewShadowSessionLease.sessionOrdinal,
        adaptiveInterviewerPreviewShadowSessionLease.allocationLedgerRevision,
        adaptiveInterviewerPreviewShadowSessionLease.previewShadowConfigurationSha256,
      ],
      name: "preview_shadow_incident_exact_lease_fk",
    }),
  })
);

export const adaptiveInterviewerPreviewShadowCohortStopEvent = pgTable(
  "adaptive_interviewer_preview_shadow_cohort_stop_event",
  {
    stopEventId: text("stop_event_id").primaryKey(),
    contractVersion: text("contract_version").notNull(),
    integritySha256: text("integrity_sha256").notNull(),
    runId: text("run_id").notNull(),
    reason: text("reason").notNull(),
    evidenceSha256: text("evidence_sha256").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    recordedLedgerRevision: integer("recorded_ledger_revision").notNull(),
  },
  (table) => ({
    digestCheck: check(
      "adaptive_interviewer_preview_shadow_stop_event_digest_check",
      sql`${table.stopEventId} ~ '^[0-9a-f]{64}$' AND
          ${table.integritySha256} = ${table.stopEventId} AND
          ${table.runId} ~ '^[0-9a-f]{64}$' AND
          ${table.evidenceSha256} ~ '^[0-9a-f]{64}$'`
    ),
    shapeCheck: check(
      "adaptive_interviewer_preview_shadow_stop_event_shape_check",
      sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-cohort-stop-event.v1' AND
          ${table.reason} IN (
            'evidence_digest_drift',
            'version_pin_mismatch',
            'unauthorized_stage_or_cohort',
            'deterministic_invariant_regression',
            'session_or_transcript_loss',
            'kill_switch_failure',
            'maximum_sessions_reached',
            'maximum_spend_reached',
            'maximum_cumulative_spend_reached'
          ) AND
          ${table.recordedLedgerRevision} > 0`
    ),
    runReasonUnique: unique(
      "adaptive_interviewer_preview_shadow_stop_event_run_reason_uniq"
    ).on(table.runId, table.reason),
    runRevisionUnique: unique("preview_shadow_stop_event_run_revision_uniq").on(
      table.runId,
      table.recordedLedgerRevision
    ),
    runForeignKey: foreignKey({
      columns: [table.runId],
      foreignColumns: [adaptiveInterviewerPreviewShadowRun.runId],
      name: "preview_shadow_stop_event_run_fk",
    }),
  })
);

export const adaptiveInterviewerPreviewShadowTerminationAcknowledgement =
  pgTable(
    "adaptive_interviewer_preview_shadow_termination_acknowledgement",
    {
      acknowledgementId: text("acknowledgement_id").primaryKey(),
      contractVersion: text("contract_version").notNull(),
      integritySha256: text("integrity_sha256").notNull(),
      runId: text("run_id").notNull(),
      leaseId: text("lease_id").notNull(),
      incidentId: text("incident_id").notNull(),
      disposition: text("disposition").notNull(),
      terminationEvidenceSha256: text("termination_evidence_sha256").notNull(),
      finalReconciledSpendNanoUsd: bigint("final_reconciled_spend_nano_usd", {
        mode: "number",
      }).notNull(),
      acknowledgedAt: timestamp("acknowledged_at", {
        withTimezone: true,
      }).notNull(),
      recordedLedgerRevision: integer("recorded_ledger_revision").notNull(),
    },
    (table) => ({
      digestCheck: check(
        "preview_shadow_termination_ack_digest_check",
        sql`${table.acknowledgementId} ~ '^[0-9a-f]{64}$' AND
            ${table.integritySha256} = ${table.acknowledgementId} AND
            ${table.runId} ~ '^[0-9a-f]{64}$' AND
            ${table.leaseId} ~ '^[0-9a-f]{64}$' AND
            ${table.incidentId} ~ '^[0-9a-f]{64}$' AND
            ${table.terminationEvidenceSha256} ~ '^[0-9a-f]{64}$'`
      ),
      shapeCheck: check(
        "adaptive_interviewer_preview_shadow_termination_ack_shape_check",
        sql`${table.contractVersion} = 'adaptive-interviewer-preview-shadow-termination-acknowledgement.v1' AND
            ${table.disposition} IN ('worker_terminated', 'process_terminated') AND
            ${table.finalReconciledSpendNanoUsd} BETWEEN 0 AND 250000000000 AND
            ${table.recordedLedgerRevision} > 0`
      ),
      runRevisionUnique: unique(
        "preview_shadow_termination_ack_run_revision_uniq"
      ).on(table.runId, table.recordedLedgerRevision),
      leaseUnique: unique("preview_shadow_ack_lease_uniq").on(table.leaseId),
      incidentUnique: unique("preview_shadow_ack_incident_uniq").on(
        table.incidentId
      ),
      exactIncidentForeignKey: foreignKey({
        columns: [table.runId, table.leaseId, table.incidentId],
        foreignColumns: [
          adaptiveInterviewerPreviewShadowStopIncompleteIncident.runId,
          adaptiveInterviewerPreviewShadowStopIncompleteIncident.leaseId,
          adaptiveInterviewerPreviewShadowStopIncompleteIncident.incidentId,
        ],
        name: "preview_shadow_ack_exact_incident_fk",
      }),
      runIndex: index(
        "adaptive_interviewer_preview_shadow_termination_ack_run_idx"
      ).on(table.runId, table.acknowledgedAt),
    })
  );
