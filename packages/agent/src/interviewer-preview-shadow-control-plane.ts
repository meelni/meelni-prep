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
  if (
    input.store.contract_version !==
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONTROL_PLANE_STORE_VERSION
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_required"
    );
  }
  const command = createAdaptiveInterviewerPreviewShadowActivationCommand(
    input.authorization,
    input.now
  );
  let result: ReturnType<
    AdaptiveInterviewerPreviewShadowDurableActivationStore["activateOnce"]
  >;
  try {
    result = input.store.activateOnce(command);
  } catch {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_unavailable"
    );
  }
  if (result.outcome === "replayed") {
    throw new Error(
      "adaptive_interviewer_preview_shadow_authorization_replayed"
    );
  }
  if (result.outcome !== "activated" || !isSha256(result.run_id)) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_control_plane_unavailable"
    );
  }
  return deepFreeze({
    contract_version:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION,
    authorization_id: command.authorization_id,
    run_id: result.run_id,
    candidate_git_sha: command.candidate_git_sha,
    preview_shadow_configuration_sha256:
      command.preview_shadow_configuration_sha256,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    activated_at: input.now.toISOString(),
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
  stopped: boolean;
  revision: number;
}

export function controlPlaneCreateAdaptiveInterviewerPreviewShadowCohortLedger(
  activation: AdaptiveInterviewerPreviewShadowActivationReceipt
): AdaptiveInterviewerPreviewShadowCohortLedger {
  validateActivationReceipt(activation);
  return deepFreeze({
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION,
    run_id: activation.run_id,
    authorization_id: activation.authorization_id,
    candidate_git_sha: activation.candidate_git_sha,
    preview_shadow_configuration_sha256:
      activation.preview_shadow_configuration_sha256,
    maximum_sessions: 25,
    maximum_spend_nano_usd: 25_000_000_000,
    maximum_cumulative_spend_nano_usd: 10_000_000_000,
    allocated_session_count: 0,
    reconciled_spend_nano_usd: 0,
    outstanding_session_reservations_nano_usd: 0,
    open_leases: [],
    reconciled_receipt_ids: [],
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
  validateLedger(input.ledger);
  if (
    input.ledger.revision !== input.expectedRevision ||
    input.ledger.stopped ||
    !isSha256(input.sessionBindingSha256) ||
    !wholeSecondDate(input.issuedAt) ||
    !wholeSecondDate(input.expiresAt) ||
    input.expiresAt.getTime() <= input.issuedAt.getTime() ||
    input.expiresAt.getTime() - input.issuedAt.getTime() >
      MAX_SESSION_LEASE_TTL_MS ||
    input.ledger.allocated_session_count >= input.ledger.maximum_sessions
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_allocation_denied"
    );
  }
  const reservation =
    ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
      .maximum_session_lease_nano_usd;
  const projected =
    input.ledger.reconciled_spend_nano_usd +
    input.ledger.outstanding_session_reservations_nano_usd +
    reservation;
  if (
    projected > input.ledger.maximum_spend_nano_usd ||
    projected > input.ledger.maximum_cumulative_spend_nano_usd
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_cohort_cap_reached");
  }
  const sessionOrdinal = input.ledger.allocated_session_count + 1;
  const payload: AdaptiveInterviewerPreviewShadowSessionLeasePayload = {
    contract_version: ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    run_id: input.ledger.run_id,
    authorization_id: input.ledger.authorization_id,
    candidate_git_sha: input.ledger.candidate_git_sha,
    preview_shadow_configuration_sha256:
      input.ledger.preview_shadow_configuration_sha256,
    adapter_id: "meelni_director_openai_responses",
    adapter_version: "interview-director-adapter.openai-responses.v1",
    provider: "openai-api",
    model: "gpt-5.4-mini-2026-03-17",
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    session_ordinal: sessionOrdinal,
    session_binding_sha256: input.sessionBindingSha256,
    session_budget_nano_usd: 1_000_000_000,
    maximum_attempts: 10,
    attempt_reservation_nano_usd: 100_000_000,
    issued_at: input.issuedAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
    allocation_ledger_revision: input.ledger.revision + 1,
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
    ...input.ledger,
    allocated_session_count: sessionOrdinal,
    outstanding_session_reservations_nano_usd:
      input.ledger.outstanding_session_reservations_nano_usd + reservation,
    open_leases: [
      ...input.ledger.open_leases,
      {
        lease_id: leaseId,
        session_ordinal: sessionOrdinal,
        allocation_ledger_revision: input.ledger.revision + 1,
        reserved_nano_usd: reservation,
      },
    ],
    revision: input.ledger.revision + 1,
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
  const record = exactRecord(value, SESSION_LEASE_KEYS);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_LEASE_VERSION ||
    record.run_id !== expected.runId ||
    record.candidate_git_sha !== expected.candidateGitSha ||
    record.session_binding_sha256 !== expected.sessionBindingSha256 ||
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
    !wholeSecondDate(now) ||
    issuedAt.getTime() > now.getTime() ||
    expiresAt.getTime() <= now.getTime() ||
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
  outcome: "settled" | "stopped" | "ambiguous";
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

export function createAdaptiveInterviewerPreviewShadowSessionReceipt(
  payload: AdaptiveInterviewerPreviewShadowSessionReceiptPayload
): AdaptiveInterviewerPreviewShadowSessionReceipt {
  const record = exactReceiptRecord(payload, [
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
  ]);
  if (
    record.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SESSION_RECEIPT_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.lease_id) ||
    !positiveInteger(record.session_ordinal) ||
    !positiveInteger(record.allocation_ledger_revision) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    !["settled", "stopped", "ambiguous"].includes(record.outcome as string) ||
    !nonNegativeInteger(record.attempt_count) ||
    record.attempt_count > 10 ||
    !integerBetween(record.reconciled_spend_nano_usd, 0, MAX_SAFE_SPEND) ||
    record.outstanding_attempt_reservations_nano_usd !== 0 ||
    !isSha256(record.attempt_receipts_sha256) ||
    parseWholeSecond(record.settled_at).toISOString() !== record.settled_at
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

export function controlPlaneReconcileAdaptiveInterviewerPreviewShadowSession(input: {
  ledger: AdaptiveInterviewerPreviewShadowCohortLedger;
  expectedRevision: number;
  receipt: AdaptiveInterviewerPreviewShadowSessionReceipt;
}): AdaptiveInterviewerPreviewShadowCohortLedger {
  validateLedger(input.ledger);
  if (input.ledger.revision !== input.expectedRevision) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_ledger_revision_mismatch"
    );
  }
  const recreated = createAdaptiveInterviewerPreviewShadowSessionReceipt(
    Object.fromEntries(
      Object.entries(input.receipt).filter(
        ([key]) => key !== "receipt_id" && key !== "integrity_sha256"
      )
    ) as unknown as AdaptiveInterviewerPreviewShadowSessionReceiptPayload
  );
  if (
    recreated.receipt_id !== input.receipt.receipt_id ||
    recreated.integrity_sha256 !== input.receipt.integrity_sha256 ||
    input.receipt.run_id !== input.ledger.run_id
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  if (input.ledger.reconciled_receipt_ids.includes(input.receipt.receipt_id)) {
    return input.ledger;
  }
  const open = input.ledger.open_leases.find(
    (lease) => lease.lease_id === input.receipt.lease_id
  );
  if (
    open === undefined ||
    open.session_ordinal !== input.receipt.session_ordinal ||
    open.allocation_ledger_revision !== input.receipt.allocation_ledger_revision
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  const reconciled =
    input.ledger.reconciled_spend_nano_usd +
    input.receipt.reconciled_spend_nano_usd;
  const outstanding =
    input.ledger.outstanding_session_reservations_nano_usd -
    open.reserved_nano_usd;
  if (
    !integerBetween(reconciled, 0, MAX_SAFE_SPEND) ||
    !integerBetween(outstanding, 0, MAX_SAFE_SPEND)
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
  }
  return deepFreeze({
    ...input.ledger,
    reconciled_spend_nano_usd: reconciled,
    outstanding_session_reservations_nano_usd: outstanding,
    open_leases: input.ledger.open_leases.filter(
      (lease) => lease.lease_id !== input.receipt.lease_id
    ),
    reconciled_receipt_ids: [
      ...input.ledger.reconciled_receipt_ids,
      input.receipt.receipt_id,
    ],
    stopped:
      input.ledger.stopped ||
      input.receipt.outcome !== "settled" ||
      reconciled + outstanding >=
        input.ledger.maximum_cumulative_spend_nano_usd ||
      reconciled + outstanding >= input.ledger.maximum_spend_nano_usd,
    revision: input.ledger.revision + 1,
  });
}

function requireCurrentAuthorization(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  now: Date
): AdaptiveInterviewerPreviewShadowAuthorization {
  if (!wholeSecondDate(now)) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_authorization_invalid"
    );
  }
  try {
    return parseAdaptiveInterviewerPreviewShadowAuthorization(
      authorization,
      {
        candidateGitSha: authorization.candidate_git_sha,
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
): void {
  if (
    value.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_ACTIVATION_RECEIPT_VERSION ||
    !isSha256(value.authorization_id) ||
    !isSha256(value.run_id) ||
    !isGitSha(value.candidate_git_sha) ||
    value.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    value.target_stage !== "preview_shadow" ||
    value.target_environment !== "preview_staging" ||
    value.target_cohort !== "shadow" ||
    value.cohort_ledger_contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION ||
    value.durable_control_plane_authority !== true
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_activation_invalid");
  }
  parseWholeSecond(value.activated_at);
}

function validateLedger(
  value: AdaptiveInterviewerPreviewShadowCohortLedger
): void {
  const openTotal = value.open_leases.reduce(
    (total, lease) => total + lease.reserved_nano_usd,
    0
  );
  if (
    value.contract_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_COHORT_LEDGER_VERSION ||
    !isSha256(value.run_id) ||
    !isSha256(value.authorization_id) ||
    !isGitSha(value.candidate_git_sha) ||
    value.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    value.maximum_sessions !== 25 ||
    value.maximum_spend_nano_usd !== 25_000_000_000 ||
    value.maximum_cumulative_spend_nano_usd !== 10_000_000_000 ||
    !integerBetween(value.allocated_session_count, 0, 25) ||
    !integerBetween(value.reconciled_spend_nano_usd, 0, MAX_SAFE_SPEND) ||
    !integerBetween(
      value.outstanding_session_reservations_nano_usd,
      0,
      MAX_SAFE_SPEND
    ) ||
    value.outstanding_session_reservations_nano_usd !== openTotal ||
    !Array.isArray(value.open_leases) ||
    value.open_leases.some(
      (lease) =>
        !isSha256(lease.lease_id) ||
        !positiveInteger(lease.session_ordinal) ||
        !positiveInteger(lease.allocation_ledger_revision) ||
        lease.reserved_nano_usd !== 1_000_000_000
    ) ||
    new Set(value.open_leases.map((lease) => lease.lease_id)).size !==
      value.open_leases.length ||
    !Array.isArray(value.reconciled_receipt_ids) ||
    value.reconciled_receipt_ids.some((id) => !isSha256(id)) ||
    new Set(value.reconciled_receipt_ids).size !==
      value.reconciled_receipt_ids.length ||
    typeof value.stopped !== "boolean" ||
    !nonNegativeInteger(value.revision)
  ) {
    throw new Error("adaptive_interviewer_preview_shadow_ledger_invalid");
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalidLease();
  }
  const record = value as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== keys.length ||
    !(actual as string[]).every((key) => keys.includes(key))
  ) {
    invalidLease();
  }
  return record;
}

function exactReceiptRecord(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  const record = value as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== keys.length ||
    !(actual as string[]).every((key) => keys.includes(key))
  ) {
    throw new Error(
      "adaptive_interviewer_preview_shadow_session_receipt_invalid"
    );
  }
  return record;
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

function parseWholeSecond(value: unknown): Date {
  if (typeof value !== "string") invalidLease();
  const parsed = new Date(value);
  if (!wholeSecondDate(parsed) || parsed.toISOString() !== value)
    invalidLease();
  return parsed;
}

function wholeSecondDate(value: Date): boolean {
  return Number.isFinite(value.getTime()) && value.getUTCMilliseconds() === 0;
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
