import { createHash } from "node:crypto";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
} from "@meelni/agent";

import type {
  DurablePreviewShadowControlPlaneStore,
  DurablePreviewShadowRun,
  DurablePreviewShadowSessionLease,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import {
  PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION,
  PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
  PREVIEW_SHADOW_SESSION_LEASE_VERSION,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import type {
  LiveKitInterviewProvider,
  StartInterviewRoomInput,
  StartedInterviewRoom,
} from "@/lib/internal/integrations";

export const PREVIEW_SHADOW_JOB_METADATA_VERSION =
  "adaptive-interviewer-preview-shadow-job-metadata.v1" as const;

const MAXIMUM_JOB_METADATA_BYTES = 16 * 1_024;
const MAXIMUM_LEASE_TTL_MS = 60 * 60 * 1_000;
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const PROVIDER_ERROR_CODE = /^livekit_[a-z0-9_]{1,88}$/;
const MAXIMUM_PROVIDER_STRING_BYTES = 16 * 1_024;

const LEASE_KEYS = [
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

const LEASE_PAYLOAD_KEYS = LEASE_KEYS.filter(
  (key) => key !== "lease_id" && key !== "integrity_sha256"
);

const RUN_KEYS = [
  "contract_version",
  "run_id",
  "authorization_id",
  "candidate_git_sha",
  "preview_shadow_configuration_sha256",
  "selected_candidate_configuration_sha256",
  "target_stage",
  "target_environment",
  "target_cohort",
  "exposure",
  "maximum_sessions",
  "maximum_spend_nano_usd",
  "maximum_cumulative_spend_nano_usd",
  "allocated_session_count",
  "reconciled_spend_nano_usd",
  "outstanding_session_reservations_nano_usd",
  "stop_incomplete_excess_spend_nano_usd",
  "stopped",
  "revision",
  "activated_at",
  "authorization_expires_at",
] as const;

export interface PreviewShadowJobMetadata {
  contract_version: typeof PREVIEW_SHADOW_JOB_METADATA_VERSION;
  lease: DurablePreviewShadowSessionLease;
  worker_evidence_capability: string;
  reconciliation_expected_revision: number;
}

export type PreviewShadowRehearsalStartResult =
  | {
      outcome: "started";
      allocation_outcome: "allocated" | "replayed";
      run: DurablePreviewShadowRun;
      lease_id: string;
      room: StartedInterviewRoom;
    }
  | {
      outcome: "closed";
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
  | {
      outcome: "provider_failed";
      allocation_outcome: "allocated" | "replayed";
      run: DurablePreviewShadowRun;
      lease_id: string;
      provider_error_code: string;
      retryable: boolean;
    };

export class PreviewShadowRehearsalError extends Error {
  constructor(
    readonly code:
      | "preview_shadow_rehearsal_invalid"
      | "preview_shadow_rehearsal_job_metadata_invalid"
  ) {
    super(code);
    this.name = "PreviewShadowRehearsalError";
  }
}

export interface PreviewShadowRehearsalWorkflow {
  start(input: {
    allocation: {
      runId: string;
      expectedRevision: number;
      sessionBindingSha256: string;
      expiresAt: string;
      workerEvidenceCapability: string;
      terminationCapability: string;
    };
    room: Omit<StartInterviewRoomInput, "agentMetadata">;
  }): Promise<PreviewShadowRehearsalStartResult>;
  reconcile(input: {
    kind: "receipt" | "stop_incomplete";
    runId: string;
    expectedRevision: number;
    workerEvidenceCapability: string;
    evidence: unknown;
  }): Promise<unknown>;
}

/**
 * Dedicated construction only. No route, environment lookup, or provider
 * factory imports this workflow.
 */
export function createPreviewShadowRehearsalWorkflow(input: {
  store: DurablePreviewShadowControlPlaneStore;
  livekitProvider: LiveKitInterviewProvider;
}): PreviewShadowRehearsalWorkflow {
  const dependencies = exactRecord(input, ["store", "livekitProvider"]);
  const store = dependencies.store as DurablePreviewShadowControlPlaneStore;
  const provider = dependencies.livekitProvider as LiveKitInterviewProvider;
  const allocate = dataMethod(
    store,
    "allocateSessionLease"
  ) as DurablePreviewShadowControlPlaneStore["allocateSessionLease"];
  const reconcileReceipt = dataMethod(
    store,
    "reconcileSessionReceipt"
  ) as DurablePreviewShadowControlPlaneStore["reconcileSessionReceipt"];
  const recordIncident = dataMethod(
    store,
    "recordStopIncompleteIncident"
  ) as DurablePreviewShadowControlPlaneStore["recordStopIncompleteIncident"];
  const startRoom = dataMethod(
    provider,
    "startInterviewRoom"
  ) as LiveKitInterviewProvider["startInterviewRoom"];

  return Object.freeze({
    async start(candidate: {
      allocation: {
        runId: string;
        expectedRevision: number;
        sessionBindingSha256: string;
        expiresAt: string;
        workerEvidenceCapability: string;
        terminationCapability: string;
      };
      room: Omit<StartInterviewRoomInput, "agentMetadata">;
    }) {
      const request = exactRecord(candidate, ["allocation", "room"]);
      const allocationInput = exactRecord(request.allocation, [
        "runId",
        "expectedRevision",
        "sessionBindingSha256",
        "expiresAt",
        "workerEvidenceCapability",
        "terminationCapability",
      ]) as {
        runId: string;
        expectedRevision: number;
        sessionBindingSha256: string;
        expiresAt: string;
        workerEvidenceCapability: string;
        terminationCapability: string;
      };
      const room = snapshotRoomInput(request.room);
      const result = await allocate.call(store, allocationInput);
      if (result.outcome === "replayed_closed") {
        const run = parseRun(result.run);
        if (
          run.run_id !== allocationInput.runId ||
          !isSha256(result.lease_id)
        ) {
          jobMetadataInvalid();
        }
        return Object.freeze({
          outcome: "closed" as const,
          run,
          lease_id: result.lease_id,
          lease_state: result.lease_state,
        });
      }
      const run = parseRun(result.run);
      const lease = parseLease(result.lease);
      assertAllocationBindings(lease, run, allocationInput);
      const agentMetadata = buildPreviewShadowJobMetadata({
        lease,
        workerEvidenceCapability: allocationInput.workerEvidenceCapability,
        reconciliationExpectedRevision: run.revision,
      });
      let providerResult: unknown;
      try {
        providerResult = await startRoom.call(provider, {
          ...room,
          agentMetadata,
        });
      } catch {
        return Object.freeze({
          outcome: "provider_failed" as const,
          allocation_outcome: result.outcome,
          run,
          lease_id: lease.lease_id,
          provider_error_code: "livekit_preview_shadow_start_unavailable",
          retryable: true,
        });
      }
      const normalizedProviderResult = normalizeProviderResult(providerResult);
      if (!normalizedProviderResult.ok) {
        return Object.freeze({
          outcome: "provider_failed" as const,
          allocation_outcome: result.outcome,
          run,
          lease_id: lease.lease_id,
          provider_error_code: normalizedProviderResult.code,
          retryable: normalizedProviderResult.retryable,
        });
      }
      return Object.freeze({
        outcome: "started" as const,
        allocation_outcome: result.outcome,
        run,
        lease_id: lease.lease_id,
        room: normalizedProviderResult.room,
      });
    },
    async reconcile(candidate: {
      kind: "receipt" | "stop_incomplete";
      runId: string;
      expectedRevision: number;
      workerEvidenceCapability: string;
      evidence: unknown;
    }) {
      const request = exactRecord(candidate, [
        "kind",
        "runId",
        "expectedRevision",
        "workerEvidenceCapability",
        "evidence",
      ]);
      if (request.kind === "receipt") {
        return reconcileReceipt.call(store, {
          runId: request.runId as string,
          expectedRevision: request.expectedRevision as number,
          workerEvidenceCapability: request.workerEvidenceCapability as string,
          receipt: request.evidence,
        });
      }
      if (request.kind === "stop_incomplete") {
        return recordIncident.call(store, {
          runId: request.runId as string,
          expectedRevision: request.expectedRevision as number,
          workerEvidenceCapability: request.workerEvidenceCapability as string,
          incident: request.evidence,
        });
      }
      invalid();
    },
  });
}

function normalizeProviderResult(
  value: unknown
):
  | { ok: true; room: StartedInterviewRoom }
  | { ok: false; code: string; retryable: boolean } {
  try {
    const success = providerResultIsSuccess(value);
    const result = exactRecordWithOptional(
      value,
      ["ok", "provider", success ? "data" : "error"],
      ["meta"]
    );
    if (result.provider !== "livekit") return providerResultInvalid();
    if (!success) {
      if (result.ok !== false) return providerResultInvalid();
      const error = exactRecordWithOptional(
        result.error,
        ["code", "message", "retryable"],
        ["cause"]
      );
      if (
        typeof error.code !== "string" ||
        !PROVIDER_ERROR_CODE.test(error.code) ||
        !boundedProviderString(error.message) ||
        typeof error.retryable !== "boolean"
      ) {
        return providerResultInvalid();
      }
      return {
        ok: false,
        code: error.code,
        retryable: error.retryable,
      };
    }
    const data = exactRecord(result.data, ["roomName", "token", "url"]);
    if (
      !boundedProviderString(data.roomName) ||
      !boundedProviderString(data.token) ||
      !boundedProviderString(data.url)
    ) {
      return providerResultInvalid();
    }
    return {
      ok: true,
      room: Object.freeze({
        roomName: data.roomName,
        token: data.token,
        url: data.url,
      }),
    };
  } catch {
    return providerResultInvalid();
  }
}

function providerResultIsSuccess(value: unknown): boolean {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "ok");
    return Boolean(
      descriptor && "value" in descriptor && descriptor.value === true
    );
  } catch {
    return false;
  }
}

function boundedProviderString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= MAXIMUM_PROVIDER_STRING_BYTES
  );
}

function providerResultInvalid(): {
  ok: false;
  code: string;
  retryable: boolean;
} {
  return {
    ok: false,
    code: "livekit_preview_shadow_start_unavailable",
    retryable: true,
  };
}

export function buildPreviewShadowJobMetadata(input: {
  lease: DurablePreviewShadowSessionLease;
  workerEvidenceCapability: string;
  reconciliationExpectedRevision: number;
}): string {
  const request = exactRecord(input, [
    "lease",
    "workerEvidenceCapability",
    "reconciliationExpectedRevision",
  ]);
  const lease = parseLease(request.lease);
  const capability = request.workerEvidenceCapability;
  if (!canonicalCapability(capability)) jobMetadataInvalid();
  if (
    !Number.isSafeInteger(request.reconciliationExpectedRevision) ||
    (request.reconciliationExpectedRevision as number) <
      lease.allocation_ledger_revision
  ) {
    jobMetadataInvalid();
  }
  const metadata: PreviewShadowJobMetadata = {
    contract_version: PREVIEW_SHADOW_JOB_METADATA_VERSION,
    lease,
    worker_evidence_capability: capability,
    reconciliation_expected_revision:
      request.reconciliationExpectedRevision as number,
  };
  const encoded = JSON.stringify(metadata);
  if (Buffer.byteLength(encoded, "utf8") > MAXIMUM_JOB_METADATA_BYTES) {
    jobMetadataInvalid();
  }
  return encoded;
}

function parseLease(value: unknown): DurablePreviewShadowSessionLease {
  const record = exactRecord(value, LEASE_KEYS);
  const issuedAt = wholeSecond(record.issued_at);
  const expiresAt = wholeSecond(record.expires_at);
  if (
    record.contract_version !== PREVIEW_SHADOW_SESSION_LEASE_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.authorization_id) ||
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    record.adapter_id !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.director.adapter_id ||
    record.adapter_version !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.director
        .adapter_version ||
    record.provider !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.director.provider ||
    record.model !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.director.model ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow" ||
    record.exposure !== "none" ||
    !positiveInteger(record.session_ordinal) ||
    !isSha256(record.session_binding_sha256) ||
    record.session_budget_nano_usd !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_session_lease_nano_usd ||
    record.maximum_attempts !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_attempts_per_session ||
    record.attempt_reservation_nano_usd !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_attempt_reservation_nano_usd ||
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > MAXIMUM_LEASE_TTL_MS ||
    !positiveInteger(record.allocation_ledger_revision) ||
    !isSha256(record.lease_id) ||
    record.integrity_sha256 !== record.lease_id
  ) {
    jobMetadataInvalid();
  }
  const payload: Record<string, unknown> = {};
  for (const key of LEASE_PAYLOAD_KEYS) payload[key] = record[key];
  const expected = createHash("sha256")
    .update(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
  if (record.lease_id !== expected) jobMetadataInvalid();
  return deepFreeze({
    ...record,
  }) as unknown as DurablePreviewShadowSessionLease;
}

function parseRun(value: unknown): DurablePreviewShadowRun {
  const record = exactRecord(value, RUN_KEYS);
  const activatedAt = wholeSecond(record.activated_at);
  const authorizationExpiresAt = wholeSecond(record.authorization_expires_at);
  if (
    record.contract_version !== PREVIEW_SHADOW_DURABLE_CONTROL_PLANE_VERSION ||
    !isSha256(record.run_id) ||
    !isSha256(record.authorization_id) ||
    !isGitSha(record.candidate_git_sha) ||
    record.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    !isSha256(record.selected_candidate_configuration_sha256) ||
    record.target_stage !== "preview_shadow" ||
    record.target_environment !== "preview_staging" ||
    record.target_cohort !== "shadow" ||
    record.exposure !== "none" ||
    record.maximum_sessions !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_sessions ||
    record.maximum_spend_nano_usd !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_spend_nano_usd ||
    record.maximum_cumulative_spend_nano_usd !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.limits
        .maximum_cumulative_spend_nano_usd ||
    !nonNegativeInteger(record.allocated_session_count) ||
    !nonNegativeInteger(record.reconciled_spend_nano_usd) ||
    !nonNegativeInteger(record.outstanding_session_reservations_nano_usd) ||
    !nonNegativeInteger(record.stop_incomplete_excess_spend_nano_usd) ||
    typeof record.stopped !== "boolean" ||
    !positiveInteger(record.revision) ||
    authorizationExpiresAt.getTime() <= activatedAt.getTime()
  ) {
    jobMetadataInvalid();
  }
  return deepFreeze({ ...record }) as unknown as DurablePreviewShadowRun;
}

function assertAllocationBindings(
  lease: DurablePreviewShadowSessionLease,
  run: DurablePreviewShadowRun,
  input: {
    runId: string;
    sessionBindingSha256: string;
    expiresAt: string;
  }
): void {
  if (
    lease.run_id !== input.runId ||
    lease.session_binding_sha256 !== input.sessionBindingSha256 ||
    lease.expires_at !== input.expiresAt ||
    lease.run_id !== run.run_id ||
    lease.authorization_id !== run.authorization_id ||
    lease.candidate_git_sha !== run.candidate_git_sha ||
    lease.preview_shadow_configuration_sha256 !==
      run.preview_shadow_configuration_sha256 ||
    lease.target_stage !== run.target_stage ||
    lease.target_environment !== run.target_environment ||
    lease.target_cohort !== run.target_cohort ||
    lease.exposure !== run.exposure ||
    run.revision < lease.allocation_ledger_revision
  ) {
    jobMetadataInvalid();
  }
}

function snapshotRoomInput(value: unknown): StartInterviewRoomInput {
  const required = [
    "agentName",
    "identity",
    "participantName",
    "roomName",
    "metadata",
    "env",
  ] as const;
  const record = exactRecordWithOptional(value, required, ["onStage"]);
  const env = exactRecordWithOptional(
    record.env,
    ["apiKey", "apiSecret", "url"],
    ["interviewAgentName"]
  );
  for (const key of [
    "agentName",
    "identity",
    "participantName",
    "roomName",
  ] as const) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim()) {
      invalid();
    }
  }
  for (const key of ["apiKey", "apiSecret", "url"] as const) {
    if (typeof env[key] !== "string" || !(env[key] as string).trim()) invalid();
  }
  if (
    env.interviewAgentName !== undefined &&
    (typeof env.interviewAgentName !== "string" ||
      !env.interviewAgentName.trim())
  ) {
    invalid();
  }
  if (record.onStage !== undefined && typeof record.onStage !== "function") {
    invalid();
  }
  return {
    agentName: record.agentName as string,
    identity: record.identity as string,
    participantName: record.participantName as string,
    roomName: record.roomName as string,
    metadata: record.metadata,
    env: env as unknown as StartInterviewRoomInput["env"],
    ...(record.onStage === undefined
      ? {}
      : { onStage: record.onStage as StartInterviewRoomInput["onStage"] }),
  };
}

function exactRecord(
  value: unknown,
  expected: readonly string[]
): Record<string, unknown> {
  return exactRecordWithOptional(value, expected, []);
}

function exactRecordWithOptional(
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): Record<string, unknown> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      invalid();
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (!required.includes(key) && !optional.includes(key))
      ) ||
      required.some((key) => !keys.includes(key))
    ) {
      invalid();
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        invalid();
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    invalid();
  }
}

function dataMethod(
  value: unknown,
  key: string
): (...args: never[]) => unknown {
  try {
    if (value === null || typeof value !== "object") invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    ) {
      invalid();
    }
    return descriptor.value as (...args: never[]) => unknown;
  } catch {
    invalid();
  }
}

function wholeSecond(value: unknown): Date {
  if (typeof value !== "string" || value.length !== 24) jobMetadataInvalid();
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCMilliseconds() !== 0 ||
    parsed.toISOString() !== value
  ) {
    jobMetadataInvalid();
  }
  return parsed;
}

function canonicalCapability(value: unknown): value is string {
  if (typeof value !== "string" || !CAPABILITY.test(value)) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isGitSha(value: unknown): value is string {
  return typeof value === "string" && GIT_SHA.test(value);
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

function invalid(): never {
  throw new PreviewShadowRehearsalError("preview_shadow_rehearsal_invalid");
}

function jobMetadataInvalid(): never {
  throw new PreviewShadowRehearsalError(
    "preview_shadow_rehearsal_job_metadata_invalid"
  );
}
