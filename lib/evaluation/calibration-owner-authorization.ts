import { createPublicKey, verify as verifySignature } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";

import ownerKeyRegistry from "../../config/evaluation-calibration-owner-keys.json";

export const CALIBRATION_OWNER_AUTHORIZATION_CONTRACT =
  "meelni.evaluation-calibration-owner-authorization.v1";
export const CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT =
  "meelni.evaluation-calibration-owner-key-registry.v1";
export const CALIBRATION_OWNER_ID = "saviii";
export const CALIBRATION_OWNER_ROLE = "human_product_owner";
export const CALIBRATION_OWNER_APPROVAL_DECISION =
  "APPROVE_BOUNDED_PAID_CALIBRATION";
export const CALIBRATION_OWNER_AUTHORIZATION_MAX_TTL_MS = 30 * 60 * 1_000;
export const CALIBRATION_OWNER_AUTHORIZATION_MAX_BYTES = 64 * 1_024;
export const SAV_248_V14_APPROVED_RUN_ID =
  "sav-248-authorized-paid-calibration.v14";
export const SAV_248_V14_PREDECESSOR_AUTHORITIES = Object.freeze([
  Object.freeze({
    runId: "sav-198-authorized-paid-calibration.v1",
    ref: "refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1",
    activationCommit: "4acdf549eecad5fe88d685c28fbc98d7475b8f05",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v2",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v2",
    activationCommit: "d0c4fc4c028b10d8616fdde337be150315a7798c",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v3",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v3",
    activationCommit: "1baee0b82c61cb6d89dbe9dc23cee1beccf72b31",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v4",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v4",
    activationCommit: "feb7591898145bcb6bec9526c650f705f2530270",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v5",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v5",
    activationCommit: "78295d40c19ba366a64956010af9535b283aaf44",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v6",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v6",
    activationCommit: "b23e5d54fb21d72e1043a4404fea1ac691e31a89",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v7",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v7",
    activationCommit: "52f7e105db37ab0a48d3b4a2e5a692d0e1ccd840",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v8",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v8",
    activationCommit: "a8f342f39f548401d91b5c2cf9f073b3f0cfd9cd",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v9",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v9",
    activationCommit: "08864c3bfad23d6c394847ccbef5ffca87347275",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v10",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v10",
    activationCommit: "9672ea31973fa6e02b93df8e48904efa7e894840",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v11",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v11",
    activationCommit: "3b84b1029f64cb488d6a4a7cff119cb98ccad2de",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v12",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v12",
    activationCommit: "0f446eddd7dce9d4d239ea10bc78decff5ddb032",
  }),
  Object.freeze({
    runId: "sav-248-authorized-paid-calibration.v13",
    ref: "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v13",
    activationCommit: "699a8e9e878ae62cb353e9f577df844775219b02",
  }),
] as const);

const ARTIFACT_KEYS = ["contract", "payload", "signature"] as const;
const PAYLOAD_KEYS = [
  "approvalDecision",
  "authorizationId",
  "customerTranscriptsAllowed",
  "expiresAt",
  "fixturePolicy",
  "historicalAuthoritiesReusable",
  "issuedAt",
  "maximumPhysicalHttpAttempts",
  "maximumProviderCalls",
  "maximumSpendNanoUsd",
  "ownerId",
  "ownerLaunchDecision",
  "ownerRole",
  "plannedPhysicalHttpAttempts",
  "plannedProviderCalls",
  "plannedWorstCaseNanoUsd",
  "planHash",
  "predecessorAuthorities",
  "productionDataAllowed",
  "reviewedSourceCommit",
  "runId",
  "signingKeyId",
  "singleAggregateRun",
] as const;
const SIGNATURE_KEYS = ["algorithm", "keyId", "value"] as const;
const REGISTRY_KEYS = ["contract", "keys", "ownerId"] as const;
const REGISTRY_ENTRY_KEYS = [
  "algorithm",
  "keyId",
  "notAfter",
  "notBefore",
  "publicKeyPem",
  "status",
] as const;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const AUTHORIZATION_ID = /^sav248_v14_auth_[0-9a-f]{32}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const verifiedSpendAuthorizations =
  new WeakSet<ApprovedCalibrationSpendAuthorization>();
const verifiedOwnerAuthorizations =
  new WeakSet<VerifiedCalibrationOwnerAuthorization>();

export interface ApprovedCalibrationSpendAuthorization {
  readonly contractVersion: "evaluation-calibration-spend-authorization.v14";
  readonly authorizationId: string;
  readonly runId: typeof SAV_248_V14_APPROVED_RUN_ID;
  readonly authorizationStatus: "approved_by_human_product_owner";
  readonly authorizedOn: string;
  readonly authorizationSource: "external_product_owner_ed25519";
  readonly ownerId: typeof CALIBRATION_OWNER_ID;
  readonly ownerRole: typeof CALIBRATION_OWNER_ROLE;
  readonly ownerSigningKeyId: string;
  readonly reviewedSourceCommit: string;
  readonly singleAggregateRun: true;
  readonly maximumProviderCalls: 96;
  readonly maximumPhysicalHttpAttempts: 96;
  readonly maximumSpendUsd: 3;
  readonly fixturePolicy: "synthetic_or_separately_approved_only";
  readonly customerTranscriptsAllowed: false;
  readonly productionDataAllowed: false;
  readonly historicalAuthoritiesReusable: false;
  readonly predecessorAuthorities: typeof SAV_248_V14_PREDECESSOR_AUTHORITIES;
}

export interface CalibrationOwnerAuthorizationPayload {
  authorizationId: string;
  runId: typeof SAV_248_V14_APPROVED_RUN_ID;
  ownerId: typeof CALIBRATION_OWNER_ID;
  ownerRole: typeof CALIBRATION_OWNER_ROLE;
  approvalDecision: typeof CALIBRATION_OWNER_APPROVAL_DECISION;
  ownerLaunchDecision: null;
  signingKeyId: string;
  reviewedSourceCommit: string;
  planHash: string;
  plannedProviderCalls: number;
  plannedPhysicalHttpAttempts: number;
  plannedWorstCaseNanoUsd: number;
  maximumProviderCalls: 96;
  maximumPhysicalHttpAttempts: 96;
  maximumSpendNanoUsd: 3_000_000_000;
  singleAggregateRun: true;
  fixturePolicy: "synthetic_or_separately_approved_only";
  customerTranscriptsAllowed: false;
  productionDataAllowed: false;
  historicalAuthoritiesReusable: false;
  predecessorAuthorities: typeof SAV_248_V14_PREDECESSOR_AUTHORITIES;
  issuedAt: string;
  expiresAt: string;
}

export interface CalibrationOwnerAuthorizationArtifact {
  contract: typeof CALIBRATION_OWNER_AUTHORIZATION_CONTRACT;
  payload: CalibrationOwnerAuthorizationPayload;
  signature: {
    algorithm: "ed25519";
    keyId: string;
    value: string;
  };
}

export interface CalibrationOwnerKeyRegistry {
  contract: typeof CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT;
  ownerId: typeof CALIBRATION_OWNER_ID;
  keys: Array<{
    algorithm: "ed25519";
    keyId: string;
    status: "active" | "revoked";
    notBefore: string;
    notAfter: string;
    publicKeyPem: string;
  }>;
}

export interface VerifiedCalibrationOwnerAuthorization {
  readonly authorization: ApprovedCalibrationSpendAuthorization;
  readonly approvedPlan: {
    readonly planHash: string;
    readonly plannedProviderCalls: number;
    readonly plannedPhysicalHttpAttempts: number;
    readonly plannedWorstCaseNanoUsd: number;
  };
  readonly approvalExpiresAt: string;
}

export function canonicalCalibrationOwnerAuthorizationJson(
  value: unknown
): string {
  if (Array.isArray(value)) {
    return `[${value
      .map((entry) => canonicalCalibrationOwnerAuthorizationJson(entry))
      .join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalCalibrationOwnerAuthorizationJson(
            value[key]
          )}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function calibrationOwnerAuthorizationSignatureMessage(
  payload: unknown
): Buffer {
  return Buffer.from(
    `${CALIBRATION_OWNER_AUTHORIZATION_CONTRACT}\u0000${canonicalCalibrationOwnerAuthorizationJson(
      payload
    )}`
  );
}

export function verifyCalibrationOwnerAuthorization(input: {
  artifact: unknown;
  keyRegistry?: unknown;
  now?: Date;
}): VerifiedCalibrationOwnerAuthorization {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("calibration_owner_authorization_clock_invalid");
  }
  const artifact = parseArtifact(input.artifact);
  const registry = parseRegistry(input.keyRegistry ?? ownerKeyRegistry);
  const payload = artifact.payload;

  if (
    typeof payload.authorizationId !== "string" ||
    !AUTHORIZATION_ID.test(payload.authorizationId)
  ) {
    throw new Error("calibration_owner_authorization_id_invalid");
  }
  if (payload.runId !== SAV_248_V14_APPROVED_RUN_ID) {
    throw new Error("calibration_owner_authorization_run_invalid");
  }
  if (
    payload.ownerId !== CALIBRATION_OWNER_ID ||
    payload.ownerRole !== CALIBRATION_OWNER_ROLE ||
    payload.approvalDecision !== CALIBRATION_OWNER_APPROVAL_DECISION
  ) {
    throw new Error("calibration_owner_authorization_provenance_invalid");
  }
  if (payload.ownerLaunchDecision !== null) {
    throw new Error("calibration_owner_authorization_launch_out_of_scope");
  }
  if (
    typeof payload.signingKeyId !== "string" ||
    !KEY_ID.test(payload.signingKeyId) ||
    payload.signingKeyId !== artifact.signature.keyId
  ) {
    throw new Error("calibration_owner_authorization_key_id_invalid");
  }
  if (
    typeof payload.reviewedSourceCommit !== "string" ||
    !COMMIT_SHA.test(payload.reviewedSourceCommit)
  ) {
    throw new Error("calibration_owner_authorization_source_commit_invalid");
  }
  if (typeof payload.planHash !== "string" || !SHA256.test(payload.planHash)) {
    throw new Error("calibration_owner_authorization_plan_hash_invalid");
  }
  if (
    !Number.isSafeInteger(payload.plannedProviderCalls) ||
    payload.plannedProviderCalls < 1 ||
    payload.plannedProviderCalls > 96 ||
    payload.plannedPhysicalHttpAttempts !== payload.plannedProviderCalls ||
    !Number.isSafeInteger(payload.plannedWorstCaseNanoUsd) ||
    payload.plannedWorstCaseNanoUsd < 1 ||
    payload.plannedWorstCaseNanoUsd > 3_000_000_000
  ) {
    throw new Error("calibration_owner_authorization_plan_scope_invalid");
  }
  assertBoundedScope(payload);
  if (
    canonicalCalibrationOwnerAuthorizationJson(
      payload.predecessorAuthorities
    ) !==
    canonicalCalibrationOwnerAuthorizationJson(
      SAV_248_V14_PREDECESSOR_AUTHORITIES
    )
  ) {
    throw new Error(
      "calibration_owner_authorization_predecessor_authority_invalid"
    );
  }

  const issuedAt = parseTimestamp(
    payload.issuedAt,
    "calibration_owner_authorization_issued_at_invalid"
  );
  const expiresAt = parseTimestamp(
    payload.expiresAt,
    "calibration_owner_authorization_expires_at_invalid"
  );
  if (issuedAt.getTime() > nowMs) {
    throw new Error("calibration_owner_authorization_not_yet_valid");
  }
  if (expiresAt.getTime() <= nowMs) {
    throw new Error("calibration_owner_authorization_expired");
  }
  if (
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() >
      CALIBRATION_OWNER_AUTHORIZATION_MAX_TTL_MS
  ) {
    throw new Error("calibration_owner_authorization_ttl_invalid");
  }
  if (issuedAt.getUTCMilliseconds() !== 0) {
    throw new Error("calibration_owner_authorization_issued_at_invalid");
  }

  if (
    artifact.signature.algorithm !== "ed25519" ||
    typeof artifact.signature.keyId !== "string" ||
    !KEY_ID.test(artifact.signature.keyId) ||
    typeof artifact.signature.value !== "string" ||
    !BASE64.test(artifact.signature.value)
  ) {
    throw new Error("calibration_owner_authorization_signature_invalid");
  }
  const key = registry.keys.find(
    ({ keyId }) => keyId === artifact.signature.keyId
  );
  if (!key || key.status !== "active") {
    throw new Error("calibration_owner_authorization_signing_key_untrusted");
  }
  const keyNotBefore = parseTimestamp(
    key.notBefore,
    "calibration_owner_authorization_key_window_invalid"
  );
  const keyNotAfter = parseTimestamp(
    key.notAfter,
    "calibration_owner_authorization_key_window_invalid"
  );
  if (
    issuedAt.getTime() < keyNotBefore.getTime() ||
    issuedAt.getTime() >= keyNotAfter.getTime() ||
    nowMs < keyNotBefore.getTime() ||
    nowMs >= keyNotAfter.getTime() ||
    expiresAt.getTime() > keyNotAfter.getTime()
  ) {
    throw new Error(
      "calibration_owner_authorization_signing_key_outside_window"
    );
  }

  let publicKey;
  try {
    publicKey = createPublicKey(key.publicKeyPem);
  } catch {
    throw new Error("calibration_owner_authorization_signing_key_invalid");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("calibration_owner_authorization_signing_key_invalid");
  }
  const signature = Buffer.from(artifact.signature.value, "base64");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      calibrationOwnerAuthorizationSignatureMessage(payload),
      publicKey,
      signature
    )
  ) {
    throw new Error("calibration_owner_authorization_signature_mismatch");
  }

  const authorization: ApprovedCalibrationSpendAuthorization = Object.freeze({
    contractVersion: "evaluation-calibration-spend-authorization.v14",
    authorizationId: payload.authorizationId,
    runId: SAV_248_V14_APPROVED_RUN_ID,
    authorizationStatus: "approved_by_human_product_owner",
    authorizedOn: payload.issuedAt,
    authorizationSource: "external_product_owner_ed25519",
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    ownerSigningKeyId: payload.signingKeyId,
    reviewedSourceCommit: payload.reviewedSourceCommit,
    singleAggregateRun: true,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendUsd: 3,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V14_PREDECESSOR_AUTHORITIES,
  });
  verifiedSpendAuthorizations.add(authorization);
  const verified: VerifiedCalibrationOwnerAuthorization = Object.freeze({
    authorization,
    approvedPlan: Object.freeze({
      planHash: payload.planHash,
      plannedProviderCalls: payload.plannedProviderCalls,
      plannedPhysicalHttpAttempts: payload.plannedPhysicalHttpAttempts,
      plannedWorstCaseNanoUsd: payload.plannedWorstCaseNanoUsd,
    }),
    approvalExpiresAt: payload.expiresAt,
  });
  verifiedOwnerAuthorizations.add(verified);
  return verified;
}

export function assertCalibrationOwnerAuthorizationWasVerified(
  authorization: ApprovedCalibrationSpendAuthorization
): void {
  if (!verifiedSpendAuthorizations.has(authorization)) {
    throw new Error("calibration_owner_authorization_provenance_unverified");
  }
}

export function assertCalibrationOwnerAuthorizationMatchesPlan(
  verified: VerifiedCalibrationOwnerAuthorization,
  plan: {
    planHash: string;
    plannedCalls: number;
    plannedWorstCaseNanoUsd: number;
    reviewedSourceCommit: string | null;
  },
  now = new Date()
): void {
  if (!verifiedOwnerAuthorizations.has(verified)) {
    throw new Error("calibration_owner_authorization_handoff_unverified");
  }
  if (
    !Number.isFinite(now.getTime()) ||
    new Date(verified.approvalExpiresAt).getTime() <= now.getTime()
  ) {
    throw new Error("calibration_owner_authorization_expired");
  }
  if (
    verified.approvedPlan.planHash !== plan.planHash ||
    verified.approvedPlan.plannedProviderCalls !== plan.plannedCalls ||
    verified.approvedPlan.plannedPhysicalHttpAttempts !== plan.plannedCalls ||
    verified.approvedPlan.plannedWorstCaseNanoUsd !==
      plan.plannedWorstCaseNanoUsd ||
    verified.authorization.reviewedSourceCommit !== plan.reviewedSourceCommit
  ) {
    throw new Error("calibration_owner_authorization_plan_mismatch");
  }
}

export async function loadCalibrationOwnerAuthorization(input: {
  authorizationPath: string;
  repositoryRoot?: string;
  now?: Date;
  keyRegistry?: unknown;
}): Promise<VerifiedCalibrationOwnerAuthorization> {
  const repositoryRoot = await realpath(input.repositoryRoot ?? process.cwd());
  const contents = await readPrivateExternalAuthorizationFile(
    input.authorizationPath,
    repositoryRoot
  );
  let artifact: unknown;
  try {
    artifact = JSON.parse(contents);
  } catch {
    throw new Error("calibration_owner_authorization_artifact_invalid");
  }
  return verifyCalibrationOwnerAuthorization({
    artifact,
    keyRegistry: input.keyRegistry,
    now: input.now,
  });
}

function parseArtifact(value: unknown): CalibrationOwnerAuthorizationArtifact {
  assertPlainObject(value, "calibration_owner_authorization_artifact_invalid");
  assertExactKeys(
    value,
    ARTIFACT_KEYS,
    "calibration_owner_authorization_artifact_invalid"
  );
  if (value.contract !== CALIBRATION_OWNER_AUTHORIZATION_CONTRACT) {
    throw new Error("calibration_owner_authorization_contract_invalid");
  }
  assertPlainObject(
    value.payload,
    "calibration_owner_authorization_payload_invalid"
  );
  assertExactKeys(
    value.payload,
    PAYLOAD_KEYS,
    "calibration_owner_authorization_payload_invalid"
  );
  assertPlainObject(
    value.signature,
    "calibration_owner_authorization_signature_invalid"
  );
  assertExactKeys(
    value.signature,
    SIGNATURE_KEYS,
    "calibration_owner_authorization_signature_invalid"
  );
  return value as unknown as CalibrationOwnerAuthorizationArtifact;
}

function parseRegistry(value: unknown): CalibrationOwnerKeyRegistry {
  assertPlainObject(
    value,
    "calibration_owner_authorization_key_registry_invalid"
  );
  assertExactKeys(
    value,
    REGISTRY_KEYS,
    "calibration_owner_authorization_key_registry_invalid"
  );
  if (
    value.contract !== CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT ||
    value.ownerId !== CALIBRATION_OWNER_ID ||
    !Array.isArray(value.keys)
  ) {
    throw new Error("calibration_owner_authorization_key_registry_invalid");
  }
  const keyIds = new Set<string>();
  for (const entry of value.keys) {
    assertPlainObject(
      entry,
      "calibration_owner_authorization_key_registry_invalid"
    );
    assertExactKeys(
      entry,
      REGISTRY_ENTRY_KEYS,
      "calibration_owner_authorization_key_registry_invalid"
    );
    if (
      entry.algorithm !== "ed25519" ||
      typeof entry.keyId !== "string" ||
      !KEY_ID.test(entry.keyId) ||
      (entry.status !== "active" && entry.status !== "revoked") ||
      typeof entry.notBefore !== "string" ||
      typeof entry.notAfter !== "string" ||
      typeof entry.publicKeyPem !== "string" ||
      keyIds.has(entry.keyId)
    ) {
      throw new Error("calibration_owner_authorization_key_registry_invalid");
    }
    keyIds.add(entry.keyId);
  }
  return value as unknown as CalibrationOwnerKeyRegistry;
}

function assertBoundedScope(payload: CalibrationOwnerAuthorizationPayload) {
  if (
    payload.maximumProviderCalls !== 96 ||
    payload.maximumPhysicalHttpAttempts !== 96 ||
    payload.maximumSpendNanoUsd !== 3_000_000_000 ||
    payload.singleAggregateRun !== true ||
    payload.fixturePolicy !== "synthetic_or_separately_approved_only" ||
    payload.customerTranscriptsAllowed !== false ||
    payload.productionDataAllowed !== false ||
    payload.historicalAuthoritiesReusable !== false
  ) {
    throw new Error("calibration_owner_authorization_scope_invalid");
  }
}

async function readPrivateExternalAuthorizationFile(
  path: string,
  repositoryRoot: string
): Promise<string> {
  if (!path || !isAbsolute(path)) {
    throw new Error("calibration_owner_authorization_file_path_invalid");
  }
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Error("calibration_owner_authorization_file_insecure");
  }
  try {
    const stats = await handle.stat();
    if (
      !stats.isFile() ||
      stats.nlink !== 1 ||
      (stats.mode & 0o777) !== 0o600 ||
      (process.getuid !== undefined && stats.uid !== process.getuid())
    ) {
      throw new Error("calibration_owner_authorization_file_insecure");
    }
    if (stats.size > CALIBRATION_OWNER_AUTHORIZATION_MAX_BYTES) {
      throw new Error("calibration_owner_authorization_file_too_large");
    }
    const canonicalPath = await realpath(path);
    const fromRepository = relative(repositoryRoot, canonicalPath);
    if (
      fromRepository === "" ||
      (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))
    ) {
      throw new Error("calibration_owner_authorization_file_must_be_external");
    }
    const contents = await handle.readFile({ encoding: "utf8" });
    if (
      Buffer.byteLength(contents) > CALIBRATION_OWNER_AUTHORIZATION_MAX_BYTES
    ) {
      throw new Error("calibration_owner_authorization_file_too_large");
    }
    return contents;
  } finally {
    await handle.close();
  }
}

function parseTimestamp(value: unknown, code: string): Date {
  if (typeof value !== "string") throw new Error(code);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(code);
  }
  return parsed;
}

function assertPlainObject(
  value: unknown,
  code: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(code);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string
) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw new Error(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
