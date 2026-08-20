/**
 * REFERENCE MODEL ONLY. This module ships no durable CAS, authenticated
 * admission, global cap authority, provider factory, or live runtime wiring.
 */
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

export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_ACTIVATION_COMMAND_VERSION =
  "adaptive-interviewer-preview-shadow-activation-command.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-ledger.v2" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-lease-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-session-receipt-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-stop-incomplete-incident-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-stop-event.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_DIGEST_VERSION =
  "adaptive-interviewer-preview-shadow-cohort-stop-event-digest.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION =
  "adaptive-interviewer-preview-shadow-durable-control-plane.v1" as const;
export const ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION =
  "adaptive-interviewer-preview-shadow-owner-decision-verifier.v1" as const;

const MAX_SESSION_LEASE_TTL_MS = 60 * 60 * 1_000;

export interface AdaptiveInterviewerPreviewShadowReferenceModelActivationCommand {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_ACTIVATION_COMMAND_VERSION;
  authorization_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION;
  authorization_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  one_time_activation: true;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelActivationContext {
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  current_time: string;
}

interface ValidatedAdaptiveInterviewerPreviewShadowReferenceModelActivationContext
  extends Omit<
    AdaptiveInterviewerPreviewShadowReferenceModelActivationContext,
    "current_time"
  > {
  current_time: Date;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerificationInput {
  authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  authorization_id: string;
  owner_direction_reference: string;
  owner_decision: "approved";
  owner_decision_reference: string;
  owner_decided_at: string;
  authorization_expires_at: string;
  authorization_nonce: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
}

declare const OWNER_DECISION_VERIFICATION_BRAND: unique symbol;

export interface AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification {
  readonly [OWNER_DECISION_VERIFICATION_BRAND]: true;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier {
  readonly contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION;
  /** The injected trusted verifier returns this invocation's module-owned token. */
  verifyOwnerDecision(
    input: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerificationInput,
    moduleOwnedVerification: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification
  ): AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelActivationReceipt {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION;
  authorization_id: string;
  run_id: string;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  activated_at: string;
  cohort_ledger_contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION;
  durable_control_plane_authority: true;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore {
  readonly contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION;
  /** Must be one durable atomic compare-and-set in the control plane. */
  activateOnce(
    command: AdaptiveInterviewerPreviewShadowReferenceModelActivationCommand,
    ownerDecisionVerification: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification
  ):
    | { outcome: "activated"; run_id: string }
    | { outcome: "replayed" }
    | { outcome: "unavailable" };
}

export function createAdaptiveInterviewerPreviewShadowReferenceModelActivationCommand(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  context: AdaptiveInterviewerPreviewShadowReferenceModelActivationContext
): AdaptiveInterviewerPreviewShadowReferenceModelActivationCommand {
  const currentContext = validateActivationContext(context);
  const current = requireCurrentAuthorization(authorization, currentContext);
  return activationCommand(current, currentContext);
}

function activationCommand(
  current: AdaptiveInterviewerPreviewShadowAuthorization,
  currentContext: ValidatedAdaptiveInterviewerPreviewShadowReferenceModelActivationContext
): AdaptiveInterviewerPreviewShadowReferenceModelActivationCommand {
  return deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_ACTIVATION_COMMAND_VERSION,
    authorization_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
    authorization_id: adaptiveInterviewerPreviewShadowAuthorizationId(current),
    candidate_git_sha: currentContext.candidate_git_sha,
    preview_shadow_configuration_sha256:
      currentContext.preview_shadow_configuration_sha256,
    target_stage: currentContext.target_stage,
    target_environment: currentContext.target_environment,
    target_cohort: currentContext.target_cohort,
    one_time_activation: true,
  } as const);
}

/** Control-plane only. Workers must receive a session lease, never call this. */
export function referenceModelActivateAdaptiveInterviewerPreviewShadow(input: {
  authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  context: AdaptiveInterviewerPreviewShadowReferenceModelActivationContext;
  ownerDecisionVerifier: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier;
  store: AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore;
}): AdaptiveInterviewerPreviewShadowReferenceModelActivationReceipt {
  const request = exactRecord(
    input,
    ["authorization", "context", "ownerDecisionVerifier", "store"],
    invalidControlPlane
  );
  const context = validateActivationContext(
    request.context as AdaptiveInterviewerPreviewShadowReferenceModelActivationContext
  );
  const current = requireCurrentAuthorization(
    request.authorization as AdaptiveInterviewerPreviewShadowAuthorization,
    context
  );
  const verifier = exactRecord(
    request.ownerDecisionVerifier,
    ["contract_version", "verifyOwnerDecision"],
    invalidControlPlane
  );
  const store = exactRecord(
    request.store,
    ["contract_version", "activateOnce"],
    invalidControlPlane
  );
  if (
    verifier.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_OWNER_DECISION_VERIFIER_VERSION ||
    typeof verifier.verifyOwnerDecision !== "function" ||
    store.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_CONTROL_PLANE_STORE_VERSION ||
    typeof store.activateOnce !== "function"
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_required"
    );
  }
  const command = activationCommand(current, context);
  const verificationInput = ownerDecisionVerificationInput(current);
  const invocationBinding = Symbol(
    "preview-shadow-reference-model-owner-decision-verification"
  );
  const moduleOwnedVerification = Object.freeze({
    [invocationBinding]: verificationInput,
  }) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification;
  let ownerDecisionVerification: AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerification;
  try {
    ownerDecisionVerification = (
      verifier.verifyOwnerDecision as AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerifier["verifyOwnerDecision"]
    )(verificationInput, moduleOwnedVerification);
  } catch {
    throw new Error(
      "adaptive_interviewer_preview_shadow_owner_decision_unverified"
    );
  }
  if (ownerDecisionVerification !== moduleOwnedVerification) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_owner_decision_unverified"
    );
  }
  const rechecked = requireCurrentAuthorization(current, context);
  if (
    adaptiveInterviewerPreviewShadowAuthorizationId(rechecked) !==
      command.authorization_id ||
    ownerDecisionVerificationInput(rechecked).authorization_id !==
      verificationInput.authorization_id
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_owner_decision_unverified"
    );
  }
  let result: ReturnType<
    AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore["activateOnce"]
  >;
  try {
    result = (
      store.activateOnce as AdaptiveInterviewerPreviewShadowReferenceModelDurableActivationStore["activateOnce"]
    )(command, ownerDecisionVerification);
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
    activated_at: context.current_time.toISOString(),
    cohort_ledger_contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION,
    durable_control_plane_authority: true,
  } as const);
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelOpenLease {
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  reserved_nano_usd: number;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelReconciledSession {
  receipt_id: string;
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  reconciliation_ledger_revision: number;
  attempt_count: number;
  reconciled_spend_nano_usd: number;
  outcome: "settled" | "stopped";
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelRecordedStopIncompleteIncident {
  incident_id: string;
  lease_id: string;
  session_ordinal: number;
  allocation_ledger_revision: number;
  recorded_ledger_revision: number;
  attempt_count: number;
  reconciled_spend_nano_usd: number;
}

export type AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason =
  | "evidence_digest_drift"
  | "version_pin_mismatch"
  | "unauthorized_stage_or_cohort"
  | "deterministic_invariant_regression"
  | "session_or_transcript_loss"
  | "kill_switch_failure"
  | "maximum_sessions_reached"
  | "maximum_spend_reached"
  | "maximum_cumulative_spend_reached";

export interface AdaptiveInterviewerPreviewShadowReferenceModelRecordedCohortStopEvent {
  stop_event_id: string;
  reason: AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason;
  evidence_sha256: string;
  observed_at: string;
  recorded_ledger_revision: number;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION;
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
  stop_incomplete_excess_spend_nano_usd: number;
  open_leases: readonly AdaptiveInterviewerPreviewShadowReferenceModelOpenLease[];
  reconciled_sessions: readonly AdaptiveInterviewerPreviewShadowReferenceModelReconciledSession[];
  stop_incomplete_incidents: readonly AdaptiveInterviewerPreviewShadowReferenceModelRecordedStopIncompleteIncident[];
  cohort_stop_events: readonly AdaptiveInterviewerPreviewShadowReferenceModelRecordedCohortStopEvent[];
  stopped: boolean;
  revision: number;
}

export function referenceModelCreateAdaptiveInterviewerPreviewShadowCohortLedger(
  activation: AdaptiveInterviewerPreviewShadowReferenceModelActivationReceipt
): AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
  const current = validateActivationReceipt(activation);
  return validateLedger({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION,
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
    stop_incomplete_excess_spend_nano_usd: 0,
    open_leases: [],
    reconciled_sessions: [],
    stop_incomplete_incidents: [],
    cohort_stop_events: [],
    stopped: false,
    revision: 0,
  } as const);
}

interface AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_VERSION;
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

export interface AdaptiveInterviewerPreviewShadowReferenceModelSessionLease
  extends AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload {
  lease_id: string;
  integrity_sha256: string;
}

export function referenceModelAllocateAdaptiveInterviewerPreviewShadowSessionLease(input: {
  ledger: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger;
  expectedRevision: number;
  sessionBindingSha256: string;
  issuedAt: Date;
  expiresAt: Date;
}): {
  ledger: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger;
  lease: AdaptiveInterviewerPreviewShadowReferenceModelSessionLease;
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
    request.ledger as AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger
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
    !isSha256(request.sessionBindingSha256) ||
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > MAX_SESSION_LEASE_TTL_MS ||
    ledger.allocated_session_count >= ledger.maximum_sessions
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_allocation_denied"
    );
  }
  const alreadyAccounted =
    ledger.reconciled_spend_nano_usd +
    ledger.outstanding_session_reservations_nano_usd +
    ledger.stop_incomplete_excess_spend_nano_usd;
  if (ledger.stopped) {
    if (
      alreadyAccounted >= ledger.maximum_spend_nano_usd ||
      alreadyAccounted >= ledger.maximum_cumulative_spend_nano_usd
    ) {
      throw new Error("adaptive_interviewer_preview_shadow_cohort_cap_reached");
    }
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
    ledger.stop_incomplete_excess_spend_nano_usd +
    reservation;
  if (
    projected > ledger.maximum_spend_nano_usd ||
    projected > ledger.maximum_cumulative_spend_nano_usd
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_cohort_cap_reached");
  }
  const sessionOrdinal = ledger.allocated_session_count + 1;
  const payload: AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload = {
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_VERSION,
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
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_DIGEST_VERSION,
    payload
  );
  const lease = deepFreeze({
    ...payload,
    lease_id: leaseId,
    integrity_sha256: leaseId,
  });
  const automaticStopReason:
    | AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason
    | undefined =
    sessionOrdinal >= ledger.maximum_sessions
      ? "maximum_sessions_reached"
      : projected >= ledger.maximum_cumulative_spend_nano_usd
        ? "maximum_cumulative_spend_reached"
        : projected >= ledger.maximum_spend_nano_usd
          ? "maximum_spend_reached"
          : undefined;
  const automaticStopEvent =
    automaticStopReason === undefined
      ? undefined
      : createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent({
          contract_version:
            ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION,
          run_id: ledger.run_id,
          reason: automaticStopReason,
          evidence_sha256: leaseId,
          observed_at: issuedAt.toISOString(),
        });
  const next = validateLedger({
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
    cohort_stop_events:
      automaticStopEvent === undefined
        ? ledger.cohort_stop_events
        : [
            ...ledger.cohort_stop_events,
            {
              stop_event_id: automaticStopEvent.stop_event_id,
              reason: automaticStopEvent.reason,
              evidence_sha256: automaticStopEvent.evidence_sha256,
              observed_at: automaticStopEvent.observed_at,
              recorded_ledger_revision: ledger.revision + 2,
            },
          ],
    stopped: automaticStopEvent !== undefined,
    revision: ledger.revision + (automaticStopEvent === undefined ? 1 : 2),
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

export function parseAdaptiveInterviewerPreviewShadowReferenceModelSessionLease(
  value: unknown,
  expected: {
    runId: string;
    candidateGitSha: string;
    sessionBindingSha256: string;
  },
  now: Date
): AdaptiveInterviewerPreviewShadowReferenceModelSessionLease {
  const currentTime = snapshotWholeSecondDate(now, invalidLease);
  const bindings = exactRecord(
    expected,
    ["runId", "candidateGitSha", "sessionBindingSha256"],
    invalidLease
  );
  const record = exactRecord(value, SESSION_LEASE_KEYS);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_VERSION ||
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
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_LEASE_DIGEST_VERSION,
    payload
  );
  if (record.lease_id !== expectedDigest) invalidLease();
  return deepFreeze({
    ...payload,
    lease_id: expectedDigest,
    integrity_sha256: expectedDigest,
  });
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelSessionReceiptPayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION;
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

export interface AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt
  extends AdaptiveInterviewerPreviewShadowReferenceModelSessionReceiptPayload {
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
  "receipt_id",
  "integrity_sha256",
] as const;

export function createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(
  payload: AdaptiveInterviewerPreviewShadowReferenceModelSessionReceiptPayload
): AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt {
  const record = exactRecord(
    payload,
    SESSION_RECEIPT_PAYLOAD_KEYS,
    invalidReceipt
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    !["settled", "stopped"].includes(record.outcome as string) ||
    !nonNegativeInteger(record.attempt_count) ||
    record.attempt_count > 10 ||
    !integerBetween(
      record.reconciled_spend_nano_usd,
      0,
      250_000_000_000
    ) ||
    (record.reconciled_spend_nano_usd as number) <
      (record.attempt_count as number) * 100_000_000 ||
    record.outstanding_attempt_reservations_nano_usd !== 0 ||
    !isSha256(record.attempt_receipts_sha256) ||
    parseWholeSecond(record.settled_at, invalidReceipt).toISOString() !==
      record.settled_at
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  const canonical = Object.fromEntries(
    SESSION_RECEIPT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelSessionReceiptPayload;
  const receiptId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_SESSION_RECEIPT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    receipt_id: receiptId,
    integrity_sha256: receiptId,
  });
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncidentPayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION;
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

export interface AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident
  extends AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncidentPayload {
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
  "incident_id",
  "integrity_sha256",
] as const;

export function createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(
  payload: AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncidentPayload
): AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident {
  const record = exactRecord(
    payload,
    STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS,
    invalidIncident
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.reason !== "cleanup_unconfirmed" ||
    !integerBetween(record.attempt_count, 0, 10) ||
    !integerBetween(
      record.reconciled_spend_nano_usd,
      0,
      250_000_000_000
    ) ||
    (record.reconciled_spend_nano_usd as number) <
      (record.attempt_count as number) * 100_000_000 ||
    record.retained_session_reservation_nano_usd !== 1_000_000_000 ||
    !isSha256(record.attempt_receipts_sha256) ||
    parseWholeSecond(record.observed_at, invalidIncident).toISOString() !==
      record.observed_at ||
    record.requires_allocation_stop !== true ||
    record.termination_acknowledgement_required !== true
  ) {
    invalidIncident();
  }
  const canonical = Object.fromEntries(
    STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncidentPayload;
  const incidentId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    incident_id: incidentId,
    integrity_sha256: incidentId,
  });
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEventPayload {
  contract_version: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION;
  run_id: string;
  reason: AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason;
  evidence_sha256: string;
  observed_at: string;
}

export interface AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent
  extends AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEventPayload {
  stop_event_id: string;
  integrity_sha256: string;
}

const COHORT_STOP_REASONS = [
  "evidence_digest_drift",
  "version_pin_mismatch",
  "unauthorized_stage_or_cohort",
  "deterministic_invariant_regression",
  "session_or_transcript_loss",
  "kill_switch_failure",
  "maximum_sessions_reached",
  "maximum_spend_reached",
  "maximum_cumulative_spend_reached",
] as const;

const COHORT_STOP_EVENT_PAYLOAD_KEYS = [
  "contract_version",
  "run_id",
  "reason",
  "evidence_sha256",
  "observed_at",
] as const;

const COHORT_STOP_EVENT_KEYS = [
  "contract_version",
  "run_id",
  "reason",
  "evidence_sha256",
  "observed_at",
  "stop_event_id",
  "integrity_sha256",
] as const;

export function createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent(
  payload: AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEventPayload
): AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent {
  const record = exactRecord(
    payload,
    COHORT_STOP_EVENT_PAYLOAD_KEYS,
    invalidStopEvent
  );
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_VERSION ||
    !isSha256(record.run_id) ||
    !COHORT_STOP_REASONS.includes(
      record.reason as AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason
    ) ||
    !isSha256(record.evidence_sha256) ||
    parseWholeSecond(record.observed_at, invalidStopEvent).toISOString() !==
      record.observed_at
  ) {
    invalidStopEvent();
  }
  const canonical = Object.fromEntries(
    COHORT_STOP_EVENT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEventPayload;
  const stopEventId = digest(
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_STOP_EVENT_DIGEST_VERSION,
    canonical
  );
  return deepFreeze({
    ...canonical,
    stop_event_id: stopEventId,
    integrity_sha256: stopEventId,
  });
}

export function referenceModelRecordAdaptiveInterviewerPreviewShadowStopIncomplete(
  input: {
    ledger: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger;
    expectedRevision: number;
    incident: AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident;
  }
): AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
  const request = exactRecord(
    input,
    ["ledger", "expectedRevision", "incident"],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger
  );
  const incident = validateStopIncompleteIncident(
    request.incident as AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident
  );
  if (ledger.revision !== request.expectedRevision) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_ledger_revision_mismatch"
    );
  }
  if (incident.run_id !== ledger.run_id) invalidIncident();
  const recordedForLease = ledger.stop_incomplete_incidents.find(
    (recorded) => recorded.lease_id === incident.lease_id
  );
  if (recordedForLease !== undefined) {
    if (recordedForLease.incident_id === incident.incident_id) return ledger;
    invalidIncident();
  }
  if (
    ledger.stop_incomplete_incidents.some(
      (recorded) => recorded.incident_id === incident.incident_id
    )
  ) {
    invalidIncident();
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
  const excess = Math.max(
    0,
    incident.reconciled_spend_nano_usd - open.reserved_nano_usd
  );
  return validateLedger({
    ...ledger,
    stop_incomplete_excess_spend_nano_usd:
      ledger.stop_incomplete_excess_spend_nano_usd + excess,
    stop_incomplete_incidents: [
      ...ledger.stop_incomplete_incidents,
      {
        incident_id: incident.incident_id,
        lease_id: incident.lease_id,
        session_ordinal: incident.session_ordinal,
        allocation_ledger_revision: incident.allocation_ledger_revision,
        recorded_ledger_revision: ledger.revision + 1,
        attempt_count: incident.attempt_count,
        reconciled_spend_nano_usd: incident.reconciled_spend_nano_usd,
      },
    ],
    stopped: true,
    revision: ledger.revision + 1,
  });
}

export function referenceModelRecordAdaptiveInterviewerPreviewShadowCohortStop(
  input: {
    ledger: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger;
    expectedRevision: number;
    event: AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent;
  }
): AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
  const request = exactRecord(
    input,
    ["ledger", "expectedRevision", "event"],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger
  );
  const event = validateCohortStopEvent(
    request.event as AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent
  );
  if (ledger.revision !== request.expectedRevision) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_ledger_revision_mismatch"
    );
  }
  if (event.run_id !== ledger.run_id) invalidStopEvent();
  const recordedForReason = ledger.cohort_stop_events.find(
    (recorded) => recorded.reason === event.reason
  );
  if (recordedForReason !== undefined) {
    if (recordedForReason.stop_event_id === event.stop_event_id) return ledger;
    invalidStopEvent();
  }
  if (
    ledger.cohort_stop_events.some(
      (recorded) => recorded.stop_event_id === event.stop_event_id
    )
  ) {
    invalidStopEvent();
  }
  return validateLedger({
    ...ledger,
    cohort_stop_events: [
      ...ledger.cohort_stop_events,
      {
        stop_event_id: event.stop_event_id,
        reason: event.reason,
        evidence_sha256: event.evidence_sha256,
        observed_at: event.observed_at,
        recorded_ledger_revision: ledger.revision + 1,
      },
    ],
    stopped: true,
    revision: ledger.revision + 1,
  });
}

export function referenceModelReconcileAdaptiveInterviewerPreviewShadowSession(input: {
  ledger: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger;
  expectedRevision: number;
  receipt: AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt;
}): AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
  const request = exactRecord(
    input,
    ["ledger", "expectedRevision", "receipt"],
    invalidControlPlane
  );
  const ledger = validateLedger(
    request.ledger as AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger
  );
  const receipt = validateSessionReceipt(
    request.receipt as AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt
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
  if (
    ledger.reconciled_sessions.some(
      (session) => session.receipt_id === receipt.receipt_id
    )
  ) {
    return ledger;
  }
  const open = ledger.open_leases.find(
    (lease) => lease.lease_id === receipt.lease_id
  );
  if (
    open === undefined ||
    ledger.stop_incomplete_incidents.some(
      (incident) => incident.lease_id === receipt.lease_id
    ) ||
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
    !integerBetween(reconciled, 0, 25 * 250_000_000_000) ||
    !integerBetween(
      outstanding,
      0,
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_spend_nano_usd
    )
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
  }
  const accounted =
    reconciled +
    outstanding +
    ledger.stop_incomplete_excess_spend_nano_usd;
  if (!Number.isSafeInteger(accounted)) {
    throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
  }
  return validateLedger({
    ...ledger,
    reconciled_spend_nano_usd: reconciled,
    outstanding_session_reservations_nano_usd: outstanding,
    open_leases: ledger.open_leases.filter(
      (lease) => lease.lease_id !== receipt.lease_id
    ),
    reconciled_sessions: [
      ...ledger.reconciled_sessions,
      {
        receipt_id: receipt.receipt_id,
        lease_id: receipt.lease_id,
        session_ordinal: receipt.session_ordinal,
        allocation_ledger_revision: receipt.allocation_ledger_revision,
        reconciliation_ledger_revision: ledger.revision + 1,
        attempt_count: receipt.attempt_count,
        reconciled_spend_nano_usd: receipt.reconciled_spend_nano_usd,
        outcome: receipt.outcome,
      },
    ],
    stopped:
      ledger.stopped ||
      receipt.outcome !== "settled" ||
      accounted >= ledger.maximum_cumulative_spend_nano_usd ||
      accounted >= ledger.maximum_spend_nano_usd,
    revision: ledger.revision + 1,
  });
}

function validateActivationContext(
  value: AdaptiveInterviewerPreviewShadowReferenceModelActivationContext
): ValidatedAdaptiveInterviewerPreviewShadowReferenceModelActivationContext {
  const record = exactRecord(
    value,
    [
      "candidate_git_sha",
      "preview_shadow_configuration_sha256",
      "selected_candidate_configuration_sha256",
      "target_stage",
      "target_environment",
      "target_cohort",
      "current_time",
    ],
    invalidActivation
  );
  const currentTime = parseWholeSecond(record.current_time, invalidActivation);
  if (
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.selected_candidate_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256 ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow"
  ) {
    invalidActivation();
  }
  return deepFreeze({
    candidate_git_sha: record.candidate_git_sha,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256,
    selected_candidate_configuration_sha256:
      record.selected_candidate_configuration_sha256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    current_time: currentTime,
  } as const);
}

function ownerDecisionVerificationInput(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization
): AdaptiveInterviewerPreviewShadowReferenceModelOwnerDecisionVerificationInput {
  return deepFreeze({
    authorization,
    authorization_id:
      adaptiveInterviewerPreviewShadowAuthorizationId(authorization),
    owner_direction_reference: authorization.owner_direction_reference,
    owner_decision: authorization.owner_decision,
    owner_decision_reference: authorization.owner_decision_reference,
    owner_decided_at: authorization.owner_decided_at,
    authorization_expires_at: authorization.authorization_expires_at,
    authorization_nonce: authorization.authorization_nonce,
    candidate_git_sha: authorization.candidate_git_sha,
    preview_shadow_configuration_sha256:
      authorization.preview_shadow_configuration_sha256,
    selected_candidate_configuration_sha256:
      authorization.selected_candidate_configuration_sha256,
    target_stage: authorization.target_stage,
    target_environment: authorization.target_environment,
    target_cohort: authorization.target_cohort,
  });
}

function requireCurrentAuthorization(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  context: ValidatedAdaptiveInterviewerPreviewShadowReferenceModelActivationContext
): AdaptiveInterviewerPreviewShadowAuthorization {
  const record = snapshotDataRecord(authorization, invalidActivation);
  try {
    return parseAdaptiveInterviewerPreviewShadowAuthorization(
      record,
      {
        candidateGitSha: context.candidate_git_sha,
        previewShadowConfigurationSha256:
          context.preview_shadow_configuration_sha256,
        selectedCandidateConfigurationSha256:
          context.selected_candidate_configuration_sha256,
      },
      context.current_time
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
  value: AdaptiveInterviewerPreviewShadowReferenceModelActivationReceipt
): AdaptiveInterviewerPreviewShadowReferenceModelActivationReceipt {
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
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION ||
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
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION,
    durable_control_plane_authority: true,
  });
}

function validateLedger(
  value: AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger
): AdaptiveInterviewerPreviewShadowReferenceModelCohortLedger {
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
      "stop_incomplete_excess_spend_nano_usd",
      "open_leases",
      "reconciled_sessions",
      "stop_incomplete_incidents",
      "cohort_stop_events",
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
  const reconciledSessionValues = exactArray(
    record.reconciled_sessions,
    invalidLedger
  );
  const reconciledSessions = reconciledSessionValues.map((session) => {
    const reconciled = exactRecord(
      session,
      [
        "receipt_id",
        "lease_id",
        "session_ordinal",
        "allocation_ledger_revision",
        "reconciliation_ledger_revision",
        "attempt_count",
        "reconciled_spend_nano_usd",
        "outcome",
      ],
      invalidLedger
    );
    if (
      !isSha256(reconciled.receipt_id) ||
      !isSha256(reconciled.lease_id) ||
      !positiveInteger(reconciled.session_ordinal) ||
      !positiveInteger(reconciled.allocation_ledger_revision) ||
      !positiveInteger(reconciled.reconciliation_ledger_revision) ||
      !integerBetween(reconciled.attempt_count, 0, 10) ||
      !integerBetween(
        reconciled.reconciled_spend_nano_usd,
        0,
        250_000_000_000
      ) ||
      (reconciled.reconciled_spend_nano_usd as number) <
        (reconciled.attempt_count as number) * 100_000_000 ||
      !["settled", "stopped"].includes(reconciled.outcome as string)
    ) {
      invalidLedger();
    }
    return {
      receipt_id: reconciled.receipt_id,
      lease_id: reconciled.lease_id,
      session_ordinal: reconciled.session_ordinal,
      allocation_ledger_revision: reconciled.allocation_ledger_revision,
      reconciliation_ledger_revision:
        reconciled.reconciliation_ledger_revision,
      attempt_count: reconciled.attempt_count,
      reconciled_spend_nano_usd: reconciled.reconciled_spend_nano_usd,
      outcome: reconciled.outcome,
    } as AdaptiveInterviewerPreviewShadowReferenceModelReconciledSession;
  });
  const stopIncompleteValues = exactArray(
    record.stop_incomplete_incidents,
    invalidLedger
  );
  const stopIncompleteIncidents = stopIncompleteValues.map((incident) => {
    const stopped = exactRecord(
      incident,
      [
        "incident_id",
        "lease_id",
        "session_ordinal",
        "allocation_ledger_revision",
        "recorded_ledger_revision",
        "attempt_count",
        "reconciled_spend_nano_usd",
      ],
      invalidLedger
    );
    if (
      !isSha256(stopped.incident_id) ||
      !isSha256(stopped.lease_id) ||
      !positiveInteger(stopped.session_ordinal) ||
      !positiveInteger(stopped.allocation_ledger_revision) ||
      !positiveInteger(stopped.recorded_ledger_revision) ||
      !integerBetween(stopped.attempt_count, 0, 10) ||
      !integerBetween(
        stopped.reconciled_spend_nano_usd,
        0,
        250_000_000_000
      )
      ||
      (stopped.reconciled_spend_nano_usd as number) <
        (stopped.attempt_count as number) * 100_000_000
    ) {
      invalidLedger();
    }
    return {
      incident_id: stopped.incident_id,
      lease_id: stopped.lease_id,
      session_ordinal: stopped.session_ordinal,
      allocation_ledger_revision: stopped.allocation_ledger_revision,
      recorded_ledger_revision: stopped.recorded_ledger_revision,
      attempt_count: stopped.attempt_count,
      reconciled_spend_nano_usd: stopped.reconciled_spend_nano_usd,
    } as AdaptiveInterviewerPreviewShadowReferenceModelRecordedStopIncompleteIncident;
  });
  const stopEventValues = exactArray(record.cohort_stop_events, invalidLedger);
  const cohortStopEvents = stopEventValues.map((event) => {
    const stopped = exactRecord(
      event,
      [
        "stop_event_id",
        "reason",
        "evidence_sha256",
        "observed_at",
        "recorded_ledger_revision",
      ],
      invalidLedger
    );
    if (
      !isSha256(stopped.stop_event_id) ||
      !COHORT_STOP_REASONS.includes(
        stopped.reason as AdaptiveInterviewerPreviewShadowReferenceModelCohortStopReason
      ) ||
      !isSha256(stopped.evidence_sha256) ||
      parseWholeSecond(stopped.observed_at, invalidLedger).toISOString() !==
        stopped.observed_at ||
      !positiveInteger(stopped.recorded_ledger_revision)
    ) {
      invalidLedger();
    }
    return {
      stop_event_id: stopped.stop_event_id,
      reason: stopped.reason,
      evidence_sha256: stopped.evidence_sha256,
      observed_at: stopped.observed_at,
      recorded_ledger_revision: stopped.recorded_ledger_revision,
    } as AdaptiveInterviewerPreviewShadowReferenceModelRecordedCohortStopEvent;
  });
  const openTotal = openLeases.reduce(
    (total, lease) => total + lease.reserved_nano_usd,
    0
  );
  const reconciledTotal = reconciledSessions.reduce(
    (total, session) => total + session.reconciled_spend_nano_usd,
    0
  );
  const sessionStates = [
    ...openLeases,
    ...reconciledSessions.map((session) => ({
      lease_id: session.lease_id,
      session_ordinal: session.session_ordinal,
      allocation_ledger_revision: session.allocation_ledger_revision,
    })),
  ];
  const sortedSessions = [...sessionStates].sort(
    (left, right) => left.session_ordinal - right.session_ordinal
  );
  const incidentExcess = stopIncompleteIncidents.reduce((total, incident) => {
    const open = openLeases.find((lease) => lease.lease_id === incident.lease_id);
    if (
      open === undefined ||
      open.session_ordinal !== incident.session_ordinal ||
      open.allocation_ledger_revision !== incident.allocation_ledger_revision ||
      incident.recorded_ledger_revision <= incident.allocation_ledger_revision
    ) {
      invalidLedger();
    }
    return (
      total +
      Math.max(0, incident.reconciled_spend_nano_usd - open.reserved_nano_usd)
    );
  }, 0);
  const transitionRevisions = [
    ...sessionStates.map((session) => session.allocation_ledger_revision),
    ...reconciledSessions.map(
      (session) => session.reconciliation_ledger_revision
    ),
    ...stopIncompleteIncidents.map(
      (incident) => incident.recorded_ledger_revision
    ),
    ...cohortStopEvents.map((event) => event.recorded_ledger_revision),
  ].sort((left, right) => left - right);
  const accountedSpend = reconciledTotal + openTotal + incidentExcess;
  const mustStop =
    stopIncompleteIncidents.length > 0 ||
    cohortStopEvents.length > 0 ||
    reconciledSessions.some((session) => session.outcome === "stopped") ||
    record.allocated_session_count === record.maximum_sessions ||
    accountedSpend >= 25_000_000_000 ||
    accountedSpend >= 10_000_000_000;
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.authorization_id) ||
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.maximum_sessions !== 25 ||
    record.maximum_spend_nano_usd !== 25_000_000_000 ||
    record.maximum_cumulative_spend_nano_usd !== 10_000_000_000 ||
    !integerBetween(record.allocated_session_count, 0, 25) ||
    !integerBetween(
      record.reconciled_spend_nano_usd,
      0,
      25 * 250_000_000_000
    ) ||
    !integerBetween(
      record.outstanding_session_reservations_nano_usd,
      0,
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_spend_nano_usd
    ) ||
    !integerBetween(
      record.stop_incomplete_excess_spend_nano_usd,
      0,
      25 * 250_000_000_000
    ) ||
    !Number.isSafeInteger(reconciledTotal) ||
    !Number.isSafeInteger(incidentExcess) ||
    !Number.isSafeInteger(accountedSpend) ||
    accountedSpend > 25 * 250_000_000_000 ||
    record.allocated_session_count !== sessionStates.length ||
    sortedSessions.some(
      (session, index) => session.session_ordinal !== index + 1
    ) ||
    sortedSessions.some(
      (session, index) =>
        index > 0 &&
        session.allocation_ledger_revision <=
          sortedSessions[index - 1].allocation_ledger_revision
    ) ||
    record.outstanding_session_reservations_nano_usd !== openTotal ||
    record.reconciled_spend_nano_usd !== reconciledTotal ||
    record.stop_incomplete_excess_spend_nano_usd !== incidentExcess ||
    new Set(sessionStates.map((session) => session.lease_id)).size !==
      sessionStates.length ||
    new Set(reconciledSessions.map((session) => session.receipt_id)).size !==
      reconciledSessions.length ||
    new Set(stopIncompleteIncidents.map((incident) => incident.incident_id))
      .size !== stopIncompleteIncidents.length ||
    new Set(stopIncompleteIncidents.map((incident) => incident.lease_id)).size !==
      stopIncompleteIncidents.length ||
    new Set(cohortStopEvents.map((event) => event.stop_event_id)).size !==
      cohortStopEvents.length ||
    new Set(cohortStopEvents.map((event) => event.reason)).size !==
      cohortStopEvents.length ||
    reconciledSessions.some(
      (session) =>
        session.reconciliation_ledger_revision <=
        session.allocation_ledger_revision
    ) ||
    !nonNegativeInteger(record.revision) ||
    transitionRevisions.length !== record.revision ||
    transitionRevisions.some((revision, index) => revision !== index + 1) ||
    typeof record.stopped !== "boolean" ||
    record.stopped !== mustStop
  ) {
    invalidLedger();
  }
  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_REFERENCE_MODEL_COHORT_LEDGER_VERSION,
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
    stop_incomplete_excess_spend_nano_usd:
      record.stop_incomplete_excess_spend_nano_usd,
    open_leases: openLeases,
    reconciled_sessions: reconciledSessions,
    stop_incomplete_incidents: stopIncompleteIncidents,
    cohort_stop_events: cohortStopEvents,
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
    !nonNegativeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value > 25
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
  value: AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt
): AdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt {
  const record = exactRecord(value, SESSION_RECEIPT_KEYS, invalidReceipt);
  const payload = Object.fromEntries(
    SESSION_RECEIPT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelSessionReceiptPayload;
  const recreated = createAdaptiveInterviewerPreviewShadowReferenceModelSessionReceipt(payload);
  if (
    recreated.receipt_id !== record.receipt_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalidReceipt();
  }
  return recreated;
}

function validateStopIncompleteIncident(
  value: AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident
): AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident {
  const record = exactRecord(
    value,
    STOP_INCOMPLETE_INCIDENT_KEYS,
    invalidIncident
  );
  const payload = Object.fromEntries(
    STOP_INCOMPLETE_INCIDENT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncidentPayload;
  const recreated =
    createAdaptiveInterviewerPreviewShadowReferenceModelStopIncompleteIncident(payload);
  if (
    recreated.incident_id !== record.incident_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalidIncident();
  }
  return recreated;
}

function validateCohortStopEvent(
  value: AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent
): AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent {
  const record = exactRecord(value, COHORT_STOP_EVENT_KEYS, invalidStopEvent);
  const payload = Object.fromEntries(
    COHORT_STOP_EVENT_PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as AdaptiveInterviewerPreviewShadowReferenceModelCohortStopEventPayload;
  const recreated = createAdaptiveInterviewerPreviewShadowReferenceModelCohortStopEvent(
    payload
  );
  if (
    recreated.stop_event_id !== record.stop_event_id ||
    recreated.integrity_sha256 !== record.integrity_sha256
  ) {
    invalidStopEvent();
  }
  return recreated;
}

function canonicalLeasePayload(
  record: Record<string, unknown>
): AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload {
  return {
    contract_version:
      record.contract_version as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["contract_version"],
    run_id: record.run_id as string,
    authorization_id: record.authorization_id as string,
    candidate_git_sha: record.candidate_git_sha as string,
    preview_shadow_configuration_sha256:
      record.preview_shadow_configuration_sha256 as string,
    adapter_id:
      record.adapter_id as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["adapter_id"],
    adapter_version:
      record.adapter_version as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["adapter_version"],
    provider:
      record.provider as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["provider"],
    model:
      record.model as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["model"],
    target_stage:
      record.target_stage as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["target_stage"],
    target_environment:
      record.target_environment as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["target_environment"],
    target_cohort:
      record.target_cohort as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["target_cohort"],
    exposure:
      record.exposure as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["exposure"],
    session_ordinal: record.session_ordinal as number,
    session_binding_sha256: record.session_binding_sha256 as string,
    session_budget_nano_usd:
      record.session_budget_nano_usd as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["session_budget_nano_usd"],
    maximum_attempts:
      record.maximum_attempts as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["maximum_attempts"],
    attempt_reservation_nano_usd:
      record.attempt_reservation_nano_usd as AdaptiveInterviewerPreviewShadowReferenceModelSessionLeasePayload["attempt_reservation_nano_usd"],
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

function invalidStopEvent(): never {
  throw new Error(
    "adaptive_interviewer_preview_shadow_cohort_stop_event_invalid"
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
