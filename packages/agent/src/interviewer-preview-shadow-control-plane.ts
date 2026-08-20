import { createHash } from "node:crypto";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  parseAdaptiveInterviewerPreviewShadowAuthorization,
  type AdaptiveInterviewerPreviewShadowAuthorization,
} from "./interviewer-preview-shadow";

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_COMMAND_VERSION =
  "adaptive-interviewer-preview-shadow-activation-command.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-ledger.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION =
  "adaptive-interviewer-preview-shadow-durable-control-plane.v1" as const;

const MAX_SESSION_LEASE_TTL_MS = 60 * 60 * 1_000;
const MAX_SAFE_SPEND = 250_000_000_000;

export interface AdaptiveInterviewerPreviewShadowActivationCommand {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_COMMAND_VERSION;
  authorization_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION;
  authorization_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  one_time_activation: true;
}

export interface AdaptiveInterviewerPreviewShadowActivationReceipt {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION;
  authorization_id: string;
  run_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  activated_at: string;
  cohort_ledger_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION;
  durable_control_plane_authority: true;
}

export interface AdaptiveInterviewerPreviewShadowDurableActivationStore {
  readonly contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION;
  /** Must be one durable atomic compare-and-set in the control plane. */
  activateOnce(
    command: AdaptiveInterviewerPreviewShadowActivationCommand
  ):
    | { outcome: "activated"; run_id: string }
    | { outcome: "replayed" }
    | { outcome: "unavailable" };
}

export function createAdaptiveInterviewerPreviewShadowActivationCommand(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  now: Date
): AdaptiveInterviewerPreviewShadowActivationCommand {
  const current = requireCurrentAuthorization(authorization, now);
  return deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_COMMAND_VERSION,
    authorization_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    authorization_id: adaptiveInterviewerPreviewShadowAuthorizationId(current),
    candidate_git_sha: current.candidate_git_sha,
    preview_shadow_configuration_sha256:
      current.preview_shadow_configuration_sha256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    one_time_activation: true,
  } as const);
}

/** Control-plane only. Workers must receive a session lease, never call this. */
export function controlPlaneActivateAdaptiveInterviewerPreviewShadow(input: {
  authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  store: AdaptiveInterviewerPreviewShadowDurableActivationStore;
  now: Date;
}): AdaptiveInterviewerPreviewShadowActivationReceipt {
  const request = exactRecord(
    input,
    ["authorization", "store", "now"],
    invalidControlPlane
  );
  const store = exactRecord(
    request.store,
    ["contract_version", "activateOnce"],
    invalidControlPlane
  );
  const currentTime = snapshotWholeSecondDate(request.now, invalidControlPlane);
  if (
    store.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION ||
    typeof store.activateOnce !== "function"
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_required"
    );
  }
  const command = createAdaptiveInterviewerPreviewShadowActivationCommand(
    request.authorization as AdaptiveInterviewerPreviewShadowAuthorization,
    currentTime
  );
  let result: ReturnType<
    AdaptiveInterviewerPreviewShadowDurableActivationStore["activateOnce"]
  >;
  try {
    result = (
      store.activateOnce as AdaptiveInterviewerPreviewShadowDurableActivationStore["activateOnce"]
    )(command);
  } catch {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_unavailable"
    );
  }
  const resultRecord = snapshotDataRecord(result, invalidControlPlane);
  if (resultRecord.outcome === "replayed") {
    assertExactKeys(resultRecord, ["outcome"], invalidControlPlane);
    throw new Error(
      "adaptive_interviewer_preview_shadow_authorization_replayed"
    );
  }
  if (resultRecord.outcome === "unavailable") {
    assertExactKeys(resultRecord, ["outcome"], invalidControlPlane);
  } else {
    assertExactKeys(resultRecord, ["outcome", "run_id"], invalidControlPlane);
  }
  if (
    resultRecord.outcome !== "activated" ||
    !isSha256(resultRecord.run_id)
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_unavailable"
    );
  }
  return deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
    authorization_id: command.authorization_id,
    run_id: resultRecord.run_id,
    candidate_git_sha: command.candidate_git_sha,
    preview_shadow_configuration_sha256:
      command.preview_shadow_configuration_sha256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    activated_at: currentTime.toISOString(),
    cohort_ledger_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION,
    durable_control_plane_authority: true,
  } as const);
}

export interface AdaptiveInterviewerPreviewShadowOpenLease {
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  reserved_nano_usd: number;
}

export interface AdaptiveInterviewerPreviewShadowCohortLedger {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION;
  run_id: string;
  authorization_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  maximum_sessions: 25;
  maximum_spend_nano_usd: 25000000000;
  maximum_cumulative_spend_nano_usd: 10000000000;
  allocated_session_count: number;
  reconciled_spend_nano_usd: number;
  outstanding_session_reservations_nano_usd: number;
  open_leases: readonly AdaptiveInterviewerPreviewShadowOpenLease[];
  reconciled_receipt_ids: readonly string[];
  stop_incomplete_incident_ids: readonly string[];
  stop_incomplete_lease_ids: readonly string[];
  stopped: boolean;
  revision: number;
}

export function controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
  activation: AdaptiveInterviewerPreviewShadowActivationReceipt
): AdaptiveInterviewerPreviewShadowCohortLedger {
  const current = validateActivationReceipt(activation);
  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION,
    run_id: current.run_id,
    authorization_id: current.authorization_id,
    candidate_git_sha: current.candidate_git_sha,
    preview_shadow_configuration_sha256:
      current.preview_shadow_configuration_sha256,
    maximum_sessions: 25,
    maximum_spend_nano_usd: 25_000_000_000,
    maximum_cumulative_spend_nano_usd: 10_000_000_000,
    allocated_session_count: 0,
    reconciled_spend_nano_usd: 0,
    outstanding_session_reservations_nano_usd: 0,
    open_leases: [],
    reconciled_receipt_ids: [],
    stop_incomplete_incident_ids: [],
    stop_incomplete_lease_ids: [],
    stopped: false,
    revision: 0,
  } as const);
}

interface AdaptiveInterviewerPreviewShadowSessionLeasePayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION;
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
}

export interface AdaptiveInterviewerPreviewShadowSessionLease
  extends AdaptiveInterviewerPreviewShadowSessionLeasePayload {
  lease_id: string;
  integrity_sha256: string;
}

export function controlPlaneAllocateAdaptiveInterviewerPreviewShadowSessionLease(input: {
  ledger: AdaptiveInterviewerPreviewShadowCohortLedger;
  expectedRevision: number;
  sessionBindingSha256: string;
  issuedAt: Date;
  expiresAt: Date;
}): {
  ledger: AdaptiveInterviewerPreviewShadowCohortLedger;
  lease: AdaptiveInterviewerPreviewShadowSessionLease;
} {
  const request = exactRecord(
    input,
    [
      "ledger",
      "expectedRevision",
      "sessionBindingSha256",
      "issuedAt",
      "expiresAt",
    ],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowCohortLedger
  );
  const issuedAt = snapshotWholeSecondDate(
    request.issuedAt,
    invalidControlPlane
  );
  const expiresAt = snapshotWholeSecondDate(
    request.expiresAt,
    invalidControlPlane
  );
  if (
    ledger.revision !== request.expectedRevision ||
    ledger.stopped ||
    !isSha256(request.sessionBindingSha256) ||
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > MAX_SESSION_LEASE_TTL_MS ||
    ledger.allocated_session_count >= ledger.maximum_sessions
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_allocation_denied"
    );
  }
  const reservation =
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
      .maximum_session_lease_nano_usd;
  const projected =
    ledger.reconciled_spend_nano_usd +
    ledger.outstanding_session_reservations_nano_usd +
    reservation;
  if (
    projected > ledger.maximum_spend_nano_usd ||
    projected > ledger.maximum_cumulative_spend_nano_usd
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_cohort_cap_reached");
  }
  const sessionOrdinal = ledger.allocated_session_count + 1;
  const payload: AdaptiveInterviewerPreviewShadowSessionLeasePayload = {
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    run_id: ledger.run_id,
    authorization_id: ledger.authorization_id,
    candidate_git_sha: ledger.candidate_git_sha,
    preview_shadow_configuration_sha256:
      ledger.preview_shadow_configuration_sha256,
    adapter_id: "meelni_director_openai_responses",
    adapter_version: "interview-director-adapter.openai-responses.v1",
    provider: "openai-api",
    model: "gpt-5.4-mini-2026-03-17",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    session_ordinal: sessionOrdinal,
    session_binding_sha256: request.sessionBindingSha256,
    session_budget_nano_usd: 1_000_000_000,
    maximum_attempts: 10,
    attempt_reservation_nano_usd: 100_000_000,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    allocation_ledger_revision: ledger.revision + 1,
  };
  const leaseId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
    payload
  );
  const lease = deepFreeze({
    ...payload,
    lease_id: leaseId,
    integrity_sha256: leaseId,
  });
  const next = deepFreeze({
    ...ledger,
    allocated_session_count: sessionOrdinal,
    outstanding_session_reservations_nano_usd:
      ledger.outstanding_session_reservations_nano_usd + reservation,
    open_leases: [
      ...ledger.open_leases,
      {
        lease_id: leaseId,
        session_ordinal: sessionOrdinal,
        allocation_ledger_revision: ledger.revision + 1,
        reserved_nano_usd: reservation,
      },
    ],
    revision: ledger.revision + 1,
  });
  return { ledger: next, lease };
}

const SESSION_LEASE_KEYS = [
  "contract_version",
  "run_id",
  "authorization_id",
  "candidate_git_sha",
  "preview_shadow_configuration_sha256",
  "adapter_id",
  "adapter_version",
  "provider",
  "model",
  "target_stage",
  "target_environment",
  "target_cohort",
  "exposure",
  "session_ordinal",
  "session_binding_sha256",
  "session_budget_nano_usd",
  "maximum_attempts",
  "attempt_reservation_nano_usd",
  "issued_at",
  "expires_at",
  "allocation_ledger_revision",
  "lease_id",
  "integrity_sha256",
] as const;

export function parseAdaptiveInterviewerPreviewShadowSessionLease(
  value: unknown,
  expected: {
    runId: string;
    candidateGitSha: string;
    sessionBindingSha256: string;
  },
  now: Date
): AdaptiveInterviewerPreviewShadowSessionLease {
  const currentTime = snapshotWholeSecondDate(now, invalidLease);
  const bindings = exactRecord(
    expected,
    ["runId", "candidateGitSha", "sessionBindingSha256"],
    invalidLease
  );
  const record = exactRecord(value, SESSION_LEASE_KEYS);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION ||
    record.run_id !== bindings.runId ||
    record.candidate_git_sha !== bindings.candidateGitSha ||
    record.session_binding_sha256 !== bindings.sessionBindingSha256 ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.adapter_id !== "meelni_director_openai_responses" ||
    record.adapter_version !==
      "interview-director-adapter.openai-responses.v1" ||
    record.provider !== "openai-api" ||
    record.model !== "gpt-5.4-mini-2026-03-17" ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow" ||
    record.exposure !== "none" ||
    record.session_budget_nano_usd !== 1_000_000_000 ||
    record.maximum_attempts !== 10 ||
    record.attempt_reservation_nano_usd !== 100_000_000 ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    !isSha256(record.authorization_id) ||
    !isSha256(record.lease_id) ||
    record.integrity_sha256 !== record.lease_id ||
    !isSha256(record.run_id) ||
    !isGitSha(record.candidate_git_sha) ||
    !isSha256(record.session_binding_sha256)
  ) {
    invalidLease();
  }
  const issuedAt = parseWholeSecond(record.issued_at);
  const expiresAt = parseWholeSecond(record.expires_at);
  if (
    issuedAt.getTime() > currentTime.getTime() ||
    expiresAt.getTime() <= currentTime.getTime() ||
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > MAX_SESSION_LEASE_TTL_MS
  ) {
    invalidLease();
  }
  const payload = canonicalLeasePayload(record);
  const expectedDigest = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
    payload
  );
  if (record.lease_id !== expectedDigest) invalidLease();
  return deepFreeze({
    ...payload,
    lease_id: expectedDigest,
    integrity_sha256: expectedDigest,
  });
}

export interface AdaptiveInterviewerPreviewShadowSessionReceiptPayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION;
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
}

export interface AdaptiveInterviewerPreviewShadowSessionReceipt
  extends AdaptiveInterviewerPreviewShadowSessionReceiptPayload {
  receipt_id: string;
  integrity_sha256: string;
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

export function createAdaptiveInterviewerPreviewShadowSessionReceipt(
  payload: AdaptiveInterviewerPreviewShadowSessionReceiptPayload
): AdaptiveInterviewerPreviewShadowSessionReceipt {
  const record = exactRecord(
    payload,
    SESSION_RECEIPT_PAYLOAD_KEYS,
    invalidReceipt
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    !["settled", "stopped"].includes(record.outcome as string) ||
    !nonNegativeInteger(record.attempt_count) ||
    record.attempt_count > 10 ||
    !integerBetween(record.reconciled_spend_nano_usd, 0, MAX_SAFE_SPEND) ||
    record.outstanding_attempt_reservations_nano_usd !== 0 ||
    !isSha256(record.attempt_receipts_sha256) ||
    parseWholeSecond(record.settled_at, invalidReceipt).toISOString() !==
      record.settled_at
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  const canonical =
    record as unknown as AdaptiveInterviewerPreviewShadowSessionReceiptPayload;
  const receiptId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    receipt_id: receiptId,
    integrity_sha256: receiptId,
  });
}

export interface AdaptiveInterviewerPreviewShadowStopIncompleteIncidentPayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION;
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
}

export interface AdaptiveInterviewerPreviewShadowStopIncompleteIncident
  extends AdaptiveInterviewerPreviewShadowStopIncompleteIncidentPayload {
  incident_id: string;
  integrity_sha256: string;
}

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

export function createAdaptiveInterviewerPreviewShadowStopIncompleteIncident(
  payload: AdaptiveInterviewerPreviewShadowStopIncompleteIncidentPayload
): AdaptiveInterviewerPreviewShadowStopIncompleteIncident {
  const record = exactRecord(
    payload,
    STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS,
    invalidIncident
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.reason !== "cleanup_unconfirmed" ||
    !integerBetween(record.attempt_count, 0, 10) ||
    !integerBetween(record.reconciled_spend_nano_usd, 0, MAX_SAFE_SPEND) ||
    record.retained_session_reservation_nano_usd !== 1_000_000_000 ||
    !isSha256(record.attempt_receipts_sha256) ||
    parseWholeSecond(record.observed_at, invalidIncident).toISOString() !==
      record.observed_at ||
    record.requires_allocation_stop !== true ||
    record.termination_acknowledgement_required !== true
  ) {
    invalidIncident();
  }
  const canonical =
    record as unknown as AdaptiveInterviewerPreviewShadowStopIncompleteIncidentPayload;
  const incidentId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    incident_id: incidentId,
    integrity_sha256: incidentId,
  });
}

export function controlPlaneRecordAdaptiveInterviewerPreviewShadowStopIncomplete(
  input: {
    ledger: AdaptiveInterviewerPreviewShadowCohortLedger;
    expectedRevision: number;
    incident: AdaptiveInterviewerPreviewShadowStopIncompleteIncident;
  }
): AdaptiveInterviewerPreviewShadowCohortLedger {
  const request = exactRecord(
    input,
    ["ledger", "expectedRevision", "incident"],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowCohortLedger
  );
  const incident = validateStopIncompleteIncident(
    request.incident as AdaptiveInterviewerPreviewShadowStopIncompleteIncident
  );
  if (ledger.revision !== request.expectedRevision) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_ledger_revision_mismatch"
    );
  }
  if (incident.run_id !== ledger.run_id) invalidIncident();
  if (ledger.stop_incomplete_incident_ids.includes(incident.incident_id)) {
    return ledger;
  }
  const open = ledger.open_leases.find(
    (lease) => lease.lease_id === incident.lease_id
  );
  if (
    open === undefined ||
    open.session_ordinal !== incident.session_ordinal ||
    open.allocation_ledger_revision !== incident.allocation_ledger_revision ||
    open.reserved_nano_usd !== incident.retained_session_reservation_nano_usd
  ) {
    invalidIncident();
  }
  return deepFreeze({
    ...ledger,
    stop_incomplete_incident_ids: [
      ...ledger.stop_incomplete_incident_ids,
      incident.incident_id,
    ],
    stop_incomplete_lease_ids: [
      ...ledger.stop_incomplete_lease_ids,
      incident.lease_id,
    ],
    stopped: true,
    revision: ledger.revision + 1,
  });
}

export function controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession(input: {
  ledger: AdaptiveInterviewerPreviewShadowCohortLedger;
  expectedRevision: number;
  receipt: AdaptiveInterviewerPreviewShadowSessionReceipt;
}): AdaptiveInterviewerPreviewShadowCohortLedger {
  const request = exactRecord(
    input,
    ["ledger", "expectedRevision", "receipt"],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowCohortLedger
  );
  const receipt = validateSessionReceipt(
    request.receipt as AdaptiveInterviewerPreviewShadowSessionReceipt
  );
  if (ledger.revision !== request.expectedRevision) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_ledger_revision_mismatch"
    );
  }
  if (receipt.run_id !== ledger.run_id) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  if (ledger.reconciled_receipt_ids.includes(receipt.receipt_id)) {
    return ledger;
  }
  const open = ledger.open_leases.find(
    (lease) => lease.lease_id === receipt.lease_id
  );
  if (
    open === undefined ||
    ledger.stop_incomplete_lease_ids.includes(receipt.lease_id) ||
    open.session_ordinal !== receipt.session_ordinal ||
    open.allocation_ledger_revision !== receipt.allocation_ledger_revision
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  const reconciled =
    ledger.reconciled_spend_nano_usd + receipt.reconciled_spend_nano_usd;
  const outstanding =
    ledger.outstanding_session_reservations_nano_usd - open.reserved_nano_usd;
  if (
    !integerBetween(reconciled, 0, MAX_SAFE_SPEND) ||
    !integerBetween(outstanding, 0, MAX_SAFE_SPEND)
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
  }
  return deepFreeze({
    ...ledger,
    reconciled_spend_nano_usd: reconciled,
    outstanding_session_reservations_nano_usd: outstanding,
    open_leases: ledger.open_leases.filter(
      (lease) => lease.lease_id !== receipt.lease_id
    ),
    reconciled_receipt_ids: [
      ...ledger.reconciled_receipt_ids,
      receipt.receipt_id,
    ],
    stopped:
      ledger.stopped ||
      receipt.outcome !== "settled" ||
      reconciled + outstanding >= ledger.maximum_cumulative_spend_nano_usd ||
      reconciled + outstanding >= ledger.maximum_spend_nano_usd,
    revision: ledger.revision + 1,
  });
}

function requireCurrentAuthorization(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  now: Date
): AdaptiveInterviewerPreviewShadowAuthorization {
  const record = snapshotDataRecord(authorization, invalidActivation);
  try {
    return parseAdaptiveInterviewerPreviewShadowAuthorization(
      record,
      {
        candidateGitSha: record.candidate_git_sha as string,
        previewShadowConfigurationSha256:
          ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
        selectedCandidateConfigurationSha256:
          ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
      },
      now
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.endsWith("authorization_expired")
    ) {
      throw error;
    }
    throw new Error(
      "adaptive_interviewer_preview_shadow_authorization_invalid"
    );
  }
}

function validateActivationReceipt(
  value: AdaptiveInterviewerPreviewShadowActivationReceipt
): AdaptiveInterviewerPreviewShadowActivationReceipt {
  const record = exactRecord(
    value,
    [
      "contract_version",
      "authorization_id",
      "run_id",
      "candidate_git_sha",
      "preview_shadow_configuration_sha256",
      "target_stage",
      "target_environment",
      "target_cohort",
      "activated_at",
      "cohort_ledger_contract_version",
      "durable_control_plane_authority",
    ],
    invalidActivation
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION ||
    !isSha256(record.authorization_id) ||
    !isSha256(record.run_id) ||
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow" ||
    record.cohort_ledger_contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION ||
    record.durable_control_plane_authority !== true
  ) {
    invalidActivation();
  }
  parseWholeSecond(record.activated_at, invalidActivation);
  return deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
    authorization_id: record.authorization_id,
    run_id: record.run_id,
    candidate_git_sha: record.candidate_git_sha,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    activated_at: record.activated_at as string,
    cohort_ledger_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION,
    durable_control_plane_authority: true,
  });
}

function validateLedger(
  value: AdaptiveInterviewerPreviewShadowCohortLedger
): AdaptiveInterviewerPreviewShadowCohortLedger {
  const record = exactRecord(
    value,
    [
      "contract_version",
      "run_id",
      "authorization_id",
      "candidate_git_sha",
      "preview_shadow_configuration_sha256",
      "maximum_sessions",
      "maximum_spend_nano_usd",
      "maximum_cumulative_spend_nano_usd",
      "allocated_session_count",
      "reconciled_spend_nano_usd",
      "outstanding_session_reservations_nano_usd",
      "open_leases",
      "reconciled_receipt_ids",
      "stop_incomplete_incident_ids",
      "stop_incomplete_lease_ids",
      "stopped",
      "revision",
    ],
    invalidLedger
  );
  const openLeaseValues = exactArray(record.open_leases, invalidLedger);
  const openLeases = openLeaseValues.map((lease) => {
    const open = exactRecord(
      lease,
      [
        "lease_id",
        "session_ordinal",
        "allocation_ledger_revision",
        "reserved_nano_usd",
      ],
      invalidLedger
    );
    if (
      !isSha256(open.lease_id) ||
      !positiveInteger(open.session_ordinal) ||
      !positiveInteger(open.allocation_ledger_revision) ||
      open.reserved_nano_usd !== 1_000_000_000
    ) {
      invalidLedger();
    }
    return {
      lease_id: open.lease_id,
      session_ordinal: open.session_ordinal,
      allocation_ledger_revision: open.allocation_ledger_revision,
      reserved_nano_usd: 1_000_000_000,
    };
  });
  const reconciledReceiptIds = exactArray(
    record.reconciled_receipt_ids,
    invalidLedger
  );
  const stopIncompleteIncidentIds = exactArray(
    record.stop_incomplete_incident_ids,
    invalidLedger
  );
  const stopIncompleteLeaseIds = exactArray(
    record.stop_incomplete_lease_ids,
    invalidLedger
  );
  const openTotal = openLeases.reduce(
    (total, lease) => total + lease.reserved_nano_usd,
    0
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.authorization_id) ||
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.maximum_sessions !== 25 ||
    record.maximum_spend_nano_usd !== 25_000_000_000 ||
    record.maximum_cumulative_spend_nano_usd !== 10_000_000_000 ||
    !integerBetween(record.allocated_session_count, 0, 25) ||
    !integerBetween(record.reconciled_spend_nano_usd, 0, MAX_SAFE_SPEND) ||
    !integerBetween(
      record.outstanding_session_reservations_nano_usd,
      0,
      MAX_SAFE_SPEND
    ) ||
    record.outstanding_session_reservations_nano_usd !== openTotal ||
    new Set(openLeases.map((lease) => lease.lease_id)).size !==
      openLeases.length ||
    reconciledReceiptIds.some((id) => !isSha256(id)) ||
    new Set(reconciledReceiptIds).size !== reconciledReceiptIds.length ||
    stopIncompleteIncidentIds.some((id) => !isSha256(id)) ||
    new Set(stopIncompleteIncidentIds).size !==
      stopIncompleteIncidentIds.length ||
    stopIncompleteLeaseIds.some((id) => !isSha256(id)) ||
    new Set(stopIncompleteLeaseIds).size !== stopIncompleteLeaseIds.length ||
    stopIncompleteLeaseIds.some(
      (leaseId) => !openLeases.some((lease) => lease.lease_id === leaseId)
    ) ||
    stopIncompleteIncidentIds.length !== stopIncompleteLeaseIds.length ||
    typeof record.stopped !== "boolean" ||
    !nonNegativeInteger(record.revision)
  ) {
    invalidLedger();
  }
  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION,
    run_id: record.run_id,
    authorization_id: record.authorization_id,
    candidate_git_sha: record.candidate_git_sha,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    maximum_sessions: 25,
    maximum_spend_nano_usd: 25_000_000_000,
    maximum_cumulative_spend_nano_usd: 10_000_000_000,
    allocated_session_count: record.allocated_session_count,
    reconciled_spend_nano_usd: record.reconciled_spend_nano_usd,
    outstanding_session_reservations_nano_usd:
      record.outstanding_session_reservations_nano_usd,
    open_leases: openLeases,
    reconciled_receipt_ids: reconciledReceiptIds as string[],
    stop_incomplete_incident_ids: stopIncompleteIncidentIds as string[],
    stop_incomplete_lease_ids: stopIncompleteLeaseIds as string[],
    stopped: record.stopped,
    revision: record.revision,
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  invalid: () => never = invalidLease
): Record<string, unknown> {
  const record = snapshotDataRecord(value, invalid);
  assertExactKeys(record, keys, invalid);
  return record;
}

function snapshotDataRecord(
  value: unknown,
  invalid: () => never
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  const record = value as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (actual.some((key) => typeof key !== "string")) invalid();
  const snapshot: Record<string, unknown> = {};
  for (const key of actual as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      invalid();
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  invalid: () => never
): void {
  const actual = Object.keys(record);
  if (
    actual.length !== keys.length ||
    !actual.every((key) => keys.includes(key))
  ) {
    invalid();
  }
}

function exactArray(value: unknown, invalid: () => never): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    invalid();
  }
  const keys = Reflect.ownKeys(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable !== false ||
    !("value" in lengthDescriptor) ||
    !nonNegativeInteger(lengthDescriptor.value)
  ) {
    invalid();
  }
  const length = lengthDescriptor.value;
  const expectedKeys = [
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ];
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    !(keys as string[]).every((key) => expectedKeys.includes(key))
  ) {
    invalid();
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      invalid();
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function validateSessionReceipt(
  value: AdaptiveInterviewerPreviewShadowSessionReceipt
): AdaptiveInterviewerPreviewShadowSessionReceipt {
  const record = exactRecord(value, SESSION_RECEIPT_KEYS, invalidReceipt);
  const payload = Object.fromEntries(
    SESSION_RECEIPT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowSessionReceiptPayload;
  const recreated = createAdaptiveInterviewerPreviewShadowSessionReceipt(payload);
  if (
    recreated.receipt_id !== record.receipt_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalidReceipt();
  }
  return recreated;
}

function validateStopIncompleteIncident(
  value: AdaptiveInterviewerPreviewShadowStopIncompleteIncident
): AdaptiveInterviewerPreviewShadowStopIncompleteIncident {
  const record = exactRecord(
    value,
    STOP_INCOMPLETE_INCIDENT_KEYS,
    invalidIncident
  );
  const payload = Object.fromEntries(
    STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowStopIncompleteIncidentPayload;
  const recreated =
    createAdaptiveInterviewerPreviewShadowStopIncompleteIncident(payload);
  if (
    recreated.incident_id !== record.incident_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalidIncident();
  }
  return recreated;
}

function canonicalLeasePayload(
  record: Record<string, unknown>
): AdaptiveInterviewerPreviewShadowSessionLeasePayload {
  return {
    contract_version:
      record.contract_version as AdaptiveInterviewerPreviewShadowSessionLeasePayload["contract_version"],
    run_id: record.run_id as string,
    authorization_id: record.authorization_id as string,
    candidate_git_sha: record.candidate_git_sha as string,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    adapter_id:
      record.adapter_id as AdaptiveInterviewerPreviewShadowSessionLeasePayload["adapter_id"],
    adapter_version:
      record.adapter_version as AdaptiveInterviewerPreviewShadowSessionLeasePayload["adapter_version"],
    provider:
      record.provider as AdaptiveInterviewerPreviewShadowSessionLeasePayload["provider"],
    model:
      record.model as AdaptiveInterviewerPreviewShadowSessionLeasePayload["model"],
    target_stage:
      record.target_stage as AdaptiveInterviewerPreviewShadowSessionLeasePayload["target_stage"],
    target_environment:
      record.target_environment as AdaptiveInterviewerPreviewShadowSessionLeasePayload["target_environment"],
    target_cohort:
      record.target_cohort as AdaptiveInterviewerPreviewShadowSessionLeasePayload["target_cohort"],
    exposure:
      record.exposure as AdaptiveInterviewerPreviewShadowSessionLeasePayload["exposure"],
    session_ordinal: record.session_ordinal as number,
    session_binding_sha256: record.session_binding_sha256 as string,
    session_budget_nano_usd:
      record.session_budget_nano_usd as AdaptiveInterviewerPreviewShadowSessionLeasePayload["session_budget_nano_usd"],
    maximum_attempts:
      record.maximum_attempts as AdaptiveInterviewerPreviewShadowSessionLeasePayload["maximum_attempts"],
    attempt_reservation_nano_usd:
      record.attempt_reservation_nano_usd as AdaptiveInterviewerPreviewShadowSessionLeasePayload["attempt_reservation_nano_usd"],
    issued_at: record.issued_at as string,
    expires_at: record.expires_at as string,
    allocation_ledger_revision: record.allocation_ledger_revision as number,
  };
}

function digest(version: string, payload: unknown): string {
  return createHash("sha256")
    .update(`${version}\0${JSON.stringify(payload)}`)
    .digest("hex");
}

function parseWholeSecond(
  value: unknown,
  invalid: () => never = invalidLease
): Date {
  if (typeof value !== "string") invalid();
  const parsed = new Date(value);
  if (!wholeSecondDate(parsed) || parsed.toISOString() !== value)
    invalid();
  return parsed;
}

function wholeSecondDate(value: Date): boolean {
  return Number.isFinite(value.getTime()) && value.getUTCMilliseconds() === 0;
}

function snapshotWholeSecondDate(
  value: unknown,
  invalid: () => never
): Date {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Date.prototype ||
    Reflect.ownKeys(value).length !== 0
  ) {
    invalid();
  }
  let timestamp: number;
  try {
    timestamp = Date.prototype.getTime.call(value);
  } catch {
    invalid();
  }
  if (!Number.isFinite(timestamp) || timestamp % 1_000 !== 0) invalid();
  return new Date(timestamp);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isGitSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function integerBetween(
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

function invalidLease(): never {
  throw new Error("adaptive_interviewer_preview_shadow_session_lease_invalid");
}

function invalidActivation(): never {
  throw new Error("adaptive_interviewer_preview_shadow_activation_invalid");
}

function invalidReceipt(): never {
  throw new Error("adaptive_interviewer_preview_shadow_session_receipt_invalid");
}

function invalidIncident(): never {
  throw new Error(
    "adaptive_interviewer_preview_shadow_stop_incomplete_incident_invalid"
  );
}

function invalidLedger(): never {
  throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
}

function invalidControlPlane(): never {
  throw new Error(
    "adaptive_interviewer_preview_shadow_control_plane_unavailable"
  );
}
