import {
  createPrivateKey,
  randomBytes,
  sign as signMessage,
} from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  adaptiveInterviewerPreviewShadowAuthorizationId,
  createAdaptiveInterviewerPreviewShadowOwnerRequest,
  parseAdaptiveInterviewerPreviewShadowAuthorization,
  type AdaptiveInterviewerPreviewShadowAuthorization,
} from "@meelni/agent";

import {
  assertPrivateExternalFile,
  assertOutsideProductionActionGitCustody,
  resolveCleanGitCandidate,
  resolveProductionActionGitCustodyRoots,
} from "./production-action-authorization.mjs";
import {
  DEFAULT_OWNER_PRIVATE_KEY_PATH,
  writePrivateFileCreateOnly,
} from "./production-action-owner-tooling.mjs";
import {
  authenticatePreviewShadowOwnerDecision,
  PREVIEW_SHADOW_OWNER_APPROVAL,
  PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
  PREVIEW_SHADOW_OWNER_ID,
  PREVIEW_SHADOW_OWNER_ROLE,
  previewShadowOwnerDecisionSignatureMessage,
  previewShadowRunControlCapabilitySha256,
  type PreviewShadowOwnerDecisionArtifact,
  type PreviewShadowOwnerDecisionPayload,
  type PreviewShadowOwnerKeyRegistry,
} from "../security/adaptive-interviewer-preview-shadow-owner-decision";

export const PREVIEW_SHADOW_OWNER_PACKET_CONTRACT =
  "meelni.adaptive-interviewer-preview-shadow-owner-packet.v2" as const;
export const DEFAULT_PREVIEW_SHADOW_OWNER_KEY_ID =
  "meelni-owner-2026-07" as const;

const GIT_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const MAXIMUM_TTL_MS = 24 * 60 * 60 * 1_000;
const AUTHORIZATION_FILE = "authorization.json";
const UNSIGNED_FILE = "owner-decision-unsigned.json";
export const PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE =
  "run-control-capability.txt" as const;

export interface PreviewShadowOwnerPacketSummary {
  contract: typeof PREVIEW_SHADOW_OWNER_PACKET_CONTRACT;
  candidate_git_sha: string;
  preview_shadow_configuration_sha256: string;
  selected_candidate_configuration_sha256: string;
  authorization_id: string;
  owner_decision_reference: string;
  owner_decided_at: string;
  authorization_expires_at: string;
  target_stage: "preview_shadow";
  target_environment: "preview_staging";
  target_cohort: "shadow";
  exposure: "none";
  preview_influence_authorized: false;
  production_authorized: false;
  default_on_authorized: false;
  launch_go_no_go_authorized: false;
}

export async function preparePreviewShadowOwnerPacket(input: {
  outputDirectory: string;
  ownerDecisionReference: string;
  keyId?: string;
  repoRoot?: string;
  now?: Date;
  ttlMs?: number;
  authorizationNonce?: string;
  resolveCandidate?: (repoRoot: string) => string | Promise<string>;
}): Promise<PreviewShadowOwnerPacketSummary> {
  const repoRoot = await realpath(input.repoRoot ?? process.cwd());
  const outputDirectory = await assertPreviewShadowExternalDirectory(
    input.outputDirectory,
    repoRoot
  );
  const now = wholeSecond(input.now ?? new Date());
  const ttlMs = input.ttlMs ?? 60 * 60 * 1_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAXIMUM_TTL_MS) {
    throw new Error("preview_shadow_owner_packet_ttl_invalid");
  }
  if (!REFERENCE.test(input.ownerDecisionReference)) {
    throw new Error("preview_shadow_owner_packet_reference_invalid");
  }
  const keyId = input.keyId ?? DEFAULT_PREVIEW_SHADOW_OWNER_KEY_ID;
  if (!KEY_ID.test(keyId)) {
    throw new Error("preview_shadow_owner_packet_key_invalid");
  }
  const candidateGitSha = await (
    input.resolveCandidate ?? resolveCleanGitCandidate
  )(repoRoot);
  if (!GIT_SHA.test(candidateGitSha)) {
    throw new Error("preview_shadow_owner_packet_candidate_invalid");
  }
  const authorizationNonce =
    input.authorizationNonce ?? randomBytes(32).toString("hex");
  if (!SHA256.test(authorizationNonce)) {
    throw new Error("preview_shadow_owner_packet_nonce_invalid");
  }
  const ownerDecidedAt = now.toISOString();
  const authorizationExpiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const request = createAdaptiveInterviewerPreviewShadowOwnerRequest({
    candidateGitSha,
  });
  const authorization = parseAdaptiveInterviewerPreviewShadowAuthorization(
    {
      contract_version:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_AUTHORIZATION_VERSION,
      requested_authority: request.requested_authority,
      current_stage: request.current_stage,
      target_stage: request.target_stage,
      target_environment: request.target_environment,
      target_cohort: request.target_cohort,
      exposure: request.exposure,
      candidate_git_sha: candidateGitSha,
      preview_shadow_configuration:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
      preview_shadow_configuration_sha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
      selected_candidate_configuration_sha256:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
      owner_direction_reference:
        ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
      owner_decision: "approved",
      owner_decision_reference: input.ownerDecisionReference,
      owner_decided_at: ownerDecidedAt,
      authorization_expires_at: authorizationExpiresAt,
      authorization_nonce: authorizationNonce,
      one_time_execution: true,
      maximum_consumptions: 1,
      preview_shadow_execution_authorized: true,
      preview_influence_authorized: false,
      later_stage_authorized: false,
      production_authorized: false,
      default_on_authorized: false,
      launch_go_no_go_authorized: false,
    },
    bindings(candidateGitSha),
    now
  );
  const authorizationId =
    adaptiveInterviewerPreviewShadowAuthorizationId(authorization);
  const runControlCapability = randomBytes(32).toString("base64url");
  const payload: PreviewShadowOwnerDecisionPayload = {
    authorization_expires_at: authorizationExpiresAt,
    authorization_id: authorizationId,
    authorization_nonce: authorizationNonce,
    candidate_git_sha: candidateGitSha,
    default_on_authorized: false,
    exposure: "none",
    later_stage_authorized: false,
    launch_go_no_go_authorized: false,
    owner_decided_at: ownerDecidedAt,
    owner_decision: PREVIEW_SHADOW_OWNER_APPROVAL,
    owner_decision_reference: input.ownerDecisionReference,
    owner_direction_reference:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_OWNER_DIRECTION_REFERENCE,
    owner_id: PREVIEW_SHADOW_OWNER_ID,
    owner_role: PREVIEW_SHADOW_OWNER_ROLE,
    preview_influence_authorized: false,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    production_authorized: false,
    run_control_capability_sha256:
      previewShadowRunControlCapabilitySha256(runControlCapability),
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    signing_key_id: keyId,
    target_cohort: "shadow",
    target_environment: "preview_staging",
    target_stage: "preview_shadow",
  };
  previewShadowOwnerDecisionSignatureMessage(payload);
  await Promise.all([
    writePrivateFileCreateOnly(
      join(outputDirectory, AUTHORIZATION_FILE),
      `${JSON.stringify(authorization, null, 2)}\n`
    ),
    writePrivateFileCreateOnly(
      join(outputDirectory, UNSIGNED_FILE),
      `${JSON.stringify(payload, null, 2)}\n`
    ),
    writePrivateFileCreateOnly(
      join(outputDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
      `${runControlCapability}\n`
    ),
  ]);
  return summary(authorization, authorizationId);
}

export async function signPreviewShadowOwnerPacket(input: {
  packetDirectory: string;
  artifactPath: string;
  keyRegistryPath: string;
  privateKeyPath?: string;
  repoRoot?: string;
  now?: Date;
}): Promise<PreviewShadowOwnerPacketSummary> {
  const repoRoot = await realpath(input.repoRoot ?? process.cwd());
  const packetDirectory = await assertPreviewShadowExternalDirectory(
    input.packetDirectory,
    repoRoot
  );
  const [
    authorizationText,
    payloadText,
    runControlCapabilityText,
    registryText,
    privateKeyText,
  ] = await Promise.all([
    readPreviewShadowPrivateFile(
      join(packetDirectory, AUTHORIZATION_FILE),
      repoRoot
    ),
    readPreviewShadowPrivateFile(
      join(packetDirectory, UNSIGNED_FILE),
      repoRoot
    ),
    readPreviewShadowPrivateFile(
      join(packetDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
      repoRoot
    ),
    readFile(input.keyRegistryPath, "utf8"),
    readPreviewShadowPrivateFile(
      input.privateKeyPath ?? DEFAULT_OWNER_PRIVATE_KEY_PATH,
      repoRoot
    ),
  ]);
  const now = wholeSecond(input.now ?? new Date());
  const authorization = parseAdaptiveInterviewerPreviewShadowAuthorization(
    parseJson(authorizationText),
    bindingsFromAuthorizationText(authorizationText),
    now
  );
  const payload = parseJson(payloadText) as PreviewShadowOwnerDecisionPayload;
  previewShadowOwnerDecisionSignatureMessage(payload);
  const privateKey = createPrivateKey(privateKeyText);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("preview_shadow_owner_packet_key_invalid");
  }
  const artifact: PreviewShadowOwnerDecisionArtifact = {
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: payload.signing_key_id,
      value: signMessage(
        null,
        previewShadowOwnerDecisionSignatureMessage(payload),
        privateKey
      ).toString("base64"),
    },
  };
  const registry = parseJson(registryText) as PreviewShadowOwnerKeyRegistry;
  const authenticated = authenticatePreviewShadowOwnerDecision({
    artifact,
    authorization,
    context: context(authorization.candidate_git_sha),
    keyRegistry: registry,
    now,
    runControlCapability: runControlCapabilityText.trim(),
  });
  const artifactTarget = await assertPreviewShadowExternalCreateTarget(
    input.artifactPath,
    repoRoot
  );
  await writePrivateFileCreateOnly(
    artifactTarget,
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  return summary(authorization, authenticated.authorizationId);
}

export async function verifyPreviewShadowOwnerPacket(input: {
  packetDirectory: string;
  artifactPath: string;
  keyRegistryPath: string;
  repoRoot?: string;
  now?: Date;
  resolveCandidate?: (repoRoot: string) => string | Promise<string>;
}): Promise<PreviewShadowOwnerPacketSummary> {
  const repoRoot = await realpath(input.repoRoot ?? process.cwd());
  const packetDirectory = await assertPreviewShadowExternalDirectory(
    input.packetDirectory,
    repoRoot
  );
  const candidateGitSha = await (
    input.resolveCandidate ?? resolveCleanGitCandidate
  )(repoRoot);
  const [
    authorizationText,
    artifactText,
    runControlCapabilityText,
    registryText,
  ] = await Promise.all([
    readPreviewShadowPrivateFile(
      join(packetDirectory, AUTHORIZATION_FILE),
      repoRoot
    ),
    readPreviewShadowPrivateFile(input.artifactPath, repoRoot),
    readPreviewShadowPrivateFile(
      join(packetDirectory, PREVIEW_SHADOW_RUN_CONTROL_CAPABILITY_FILE),
      repoRoot
    ),
    readFile(input.keyRegistryPath, "utf8"),
  ]);
  const now = wholeSecond(input.now ?? new Date());
  const authorization = parseAdaptiveInterviewerPreviewShadowAuthorization(
    parseJson(authorizationText),
    bindings(candidateGitSha),
    now
  );
  const authenticated = authenticatePreviewShadowOwnerDecision({
    artifact: parseJson(artifactText),
    authorization,
    context: context(candidateGitSha),
    keyRegistry: parseJson(registryText),
    now,
    runControlCapability: runControlCapabilityText.trim(),
  });
  return summary(authorization, authenticated.authorizationId);
}

function bindings(candidateGitSha: string) {
  return {
    candidateGitSha,
    previewShadowConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selectedCandidateConfigurationSha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
  };
}

function context(candidateGitSha: string) {
  return {
    ...bindings(candidateGitSha),
    targetStage: "preview_shadow" as const,
    targetEnvironment: "preview_staging" as const,
    targetCohort: "shadow" as const,
    exposure: "none" as const,
  };
}

function bindingsFromAuthorizationText(contents: string) {
  const value = parseJson(contents) as Record<string, unknown>;
  if (typeof value.candidate_git_sha !== "string") {
    throw new Error("preview_shadow_owner_packet_authorization_invalid");
  }
  return bindings(value.candidate_git_sha);
}

function summary(
  authorization: AdaptiveInterviewerPreviewShadowAuthorization,
  authorizationId: string
): PreviewShadowOwnerPacketSummary {
  return Object.freeze({
    contract: PREVIEW_SHADOW_OWNER_PACKET_CONTRACT,
    candidate_git_sha: authorization.candidate_git_sha,
    preview_shadow_configuration_sha256:
      authorization.preview_shadow_configuration_sha256,
    selected_candidate_configuration_sha256:
      authorization.selected_candidate_configuration_sha256,
    authorization_id: authorizationId,
    owner_decision_reference: authorization.owner_decision_reference,
    owner_decided_at: authorization.owner_decided_at,
    authorization_expires_at: authorization.authorization_expires_at,
    target_stage: "preview_shadow",
    target_environment: "preview_staging",
    target_cohort: "shadow",
    exposure: "none",
    preview_influence_authorized: false,
    production_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
  });
}

export async function assertPreviewShadowExternalDirectory(
  path: string,
  repoRoot: string
): Promise<string> {
  if (!path || !isAbsolute(path)) {
    throw new Error("preview_shadow_owner_packet_directory_invalid");
  }
  const stats = await lstat(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o077) !== 0
  ) {
    throw new Error("preview_shadow_owner_packet_directory_insecure");
  }
  const canonical = await realpath(path);
  assertOutsideProductionActionGitCustody(
    canonical,
    await resolveProductionActionGitCustodyRoots(repoRoot),
    "preview_shadow_owner_packet_directory"
  );
  return canonical;
}

export async function assertPreviewShadowExternalCreateTarget(
  path: string,
  repoRoot: string
): Promise<string> {
  if (!path || !isAbsolute(path)) {
    throw new Error("preview_shadow_owner_packet_artifact_path_invalid");
  }
  const directory = await assertPreviewShadowExternalDirectory(
    dirname(path),
    repoRoot
  );
  return join(directory, path.slice(path.lastIndexOf("/") + 1));
}

export async function readPreviewShadowPrivateFile(
  path: string,
  repoRoot: string
): Promise<string> {
  const canonical = await assertPrivateExternalFile(
    path,
    repoRoot,
    "preview_shadow_owner_packet_file"
  );
  return readFile(canonical, "utf8");
}

function parseJson(contents: string): unknown {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("preview_shadow_owner_packet_json_invalid");
  }
}

function wholeSecond(value: Date): Date {
  if (
    Object.getPrototypeOf(value) !== Date.prototype ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error("preview_shadow_owner_packet_clock_invalid");
  }
  return new Date(Math.floor(value.getTime() / 1_000) * 1_000);
}
