import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";

import {
  PRODUCTION_ACTIONS,
  canonicalJson,
} from "./production-action-authorization.mjs";
import { assertLiveKitProductionRuntimeSecrets } from "./livekit-production-runtime-secrets.mjs";

export const PRODUCTION_PROJECT_SHADOW_CELL_CONTRACT_VERSION =
  "meelni.adaptive-interviewer-production-project-shadow-cell.v1" as const;
export const PRODUCTION_PROJECT_SHADOW_TOPOLOGY =
  "production_project_shadow" as const;
export const PRODUCTION_PROJECT_SHADOW_LIVEKIT_HOST =
  "meelni-ek4vaisp.livekit.cloud" as const;
export const PRODUCTION_PROJECT_SHADOW_LIVEKIT_URL =
  `wss://${PRODUCTION_PROJECT_SHADOW_LIVEKIT_HOST}` as const;
export const PRODUCTION_PROJECT_SHADOW_AGENT_ID = "CA_yawKG67rCMG4" as const;
export const PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL =
  "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow" as const;
export const PRODUCTION_PROJECT_SHADOW_ACTION =
  PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_SHADOW_ROOM;
export const PRODUCTION_PROJECT_SHADOW_SYNTHETIC_ROOM_VERSION =
  "adaptive-interviewer-preview-shadow-synthetic-room.v1" as const;

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const ROUND = new Set(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.rounds
);
const VOICE_CONDITION = new Set(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.voice_conditions
);

export interface ProductionProjectShadowCellIntent {
  runId: string;
  candidateGitSha: string;
  expectedRevision: number;
  sessionBindingSha256: string;
  expiresAt: string;
  round: string;
  voiceCondition: string;
  controlPlaneUrl: string;
  deploymentVersion: string;
}

export interface ProductionProjectShadowCellAuthorizationInput {
  action: typeof PRODUCTION_PROJECT_SHADOW_ACTION;
  provider: "livekit";
  configurationSha256: string;
  targetFingerprint: string;
}

export interface ProductionProjectShadowAuthorizationReceipt {
  contract: "meelni.production-action-consumption-receipt.v1";
  authorizationId: string;
  action: typeof PRODUCTION_PROJECT_SHADOW_ACTION;
  candidateSha: string;
  artifactSha256: string;
}

interface ProductionProjectShadowLiveKitCredentials {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function productionProjectShadowCellAuthorizationInput(
  value: ProductionProjectShadowCellIntent
): ProductionProjectShadowCellAuthorizationInput {
  const input = exactIntent(value);
  const topology = {
    contract_version: PRODUCTION_PROJECT_SHADOW_CELL_CONTRACT_VERSION,
    topology: PRODUCTION_PROJECT_SHADOW_TOPOLOGY,
    logical_stage: "preview_shadow",
    logical_environment: "preview_staging",
    cohort: "shadow",
    exposure: "none",
    livekit_project_host: PRODUCTION_PROJECT_SHADOW_LIVEKIT_HOST,
    livekit_agent_id: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    control_plane_url: input.controlPlaneUrl,
    preview_influence_authorized: false,
    production_rollout_authorized: false,
    default_on_authorized: false,
    launch_go_no_go_authorized: false,
  } as const;
  const target = {
    contract_version: PRODUCTION_PROJECT_SHADOW_CELL_CONTRACT_VERSION,
    topology: PRODUCTION_PROJECT_SHADOW_TOPOLOGY,
    run_id: input.runId,
    candidate_git_sha: input.candidateGitSha,
    expected_revision: input.expectedRevision,
    session_binding_sha256: input.sessionBindingSha256,
    expires_at: input.expiresAt,
    round: input.round,
    voice_condition: input.voiceCondition,
    livekit_url: PRODUCTION_PROJECT_SHADOW_LIVEKIT_URL,
    livekit_agent_id: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
    livekit_deployment_version: input.deploymentVersion,
  } as const;
  return Object.freeze({
    action: PRODUCTION_PROJECT_SHADOW_ACTION,
    provider: "livekit" as const,
    configurationSha256: domainHash("configuration", topology),
    targetFingerprint: domainHash("target", target),
  });
}

export function buildProductionProjectShadowRuntimeSecrets({
  ordinarySecrets,
  runId,
  candidateGitSha,
  controlPlaneUrl,
  vercelBypassSecret,
}: {
  ordinarySecrets: string;
  runId: string;
  candidateGitSha: string;
  controlPlaneUrl: string;
  vercelBypassSecret: string;
}): string {
  if (
    !SHA256.test(runId) ||
    !GIT_SHA.test(candidateGitSha) ||
    controlPlaneUrl !== PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL ||
    !/^[A-Za-z0-9_-]{16,512}$/.test(vercelBypassSecret)
  ) {
    invalid();
  }
  assertLiveKitProductionRuntimeSecrets(ordinarySecrets, {
    includeTranscriptSecret: true,
    includeProviderSecret: true,
    dispatchVariableName: "LIVEKIT_INTERVIEW_AGENT_NAME",
    expectedDispatchName: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
    expectedCandidateSha: undefined,
    expectedControlPlaneUrl: undefined,
  });
  const shadowSafeOrdinarySecrets = ordinarySecrets
    .trimEnd()
    .split("\n")
    .map((line) =>
      line === "OPIK_TRACING_ENABLED=true"
        ? "OPIK_TRACING_ENABLED=false"
        : line === "OPIK_CAPTURE_CONTENT=true"
          ? "OPIK_CAPTURE_CONTENT=false"
          : line
    )
    .join("\n");
  const combined = [
    shadowSafeOrdinarySecrets,
    "MEELNI_PREVIEW_SHADOW_EXECUTION=enabled",
    "MEELNI_PREVIEW_SHADOW_KILL_SWITCH=open",
    `MEELNI_PREVIEW_SHADOW_RUN_ID=${runId}`,
    `MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA=${candidateGitSha}`,
    `MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL=${controlPlaneUrl}`,
    `MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET=${vercelBypassSecret}`,
    "",
  ].join("\n");
  assertLiveKitProductionRuntimeSecrets(combined, {
    includeTranscriptSecret: true,
    includeProviderSecret: true,
    dispatchVariableName: "LIVEKIT_INTERVIEW_AGENT_NAME",
    expectedDispatchName: PRODUCTION_PROJECT_SHADOW_AGENT_ID,
    includeShadowBootstrap: true,
    expectedCandidateSha: candidateGitSha,
    expectedControlPlaneUrl: controlPlaneUrl,
    shadowEphemeralOnly: true,
    expectedProtectionBypassSecret: vercelBypassSecret,
  });
  return combined;
}

export function buildProductionProjectShadowSyntheticRoomMetadata({
  sessionBindingSha256,
  round,
  voiceCondition,
  expiresAt,
}: {
  sessionBindingSha256: string;
  round: string;
  voiceCondition: string;
  expiresAt: string;
}) {
  const parsedExpiry = new Date(expiresAt);
  if (
    !SHA256.test(sessionBindingSha256) ||
    !ROUND.has(round as never) ||
    !VOICE_CONDITION.has(voiceCondition as never) ||
    expiresAt.length !== 24 ||
    !Number.isFinite(parsedExpiry.getTime()) ||
    parsedExpiry.toISOString() !== expiresAt
  ) {
    invalid();
  }
  return Object.freeze({
    contract_version: PRODUCTION_PROJECT_SHADOW_SYNTHETIC_ROOM_VERSION,
    topology: PRODUCTION_PROJECT_SHADOW_TOPOLOGY,
    session_binding_sha256: sessionBindingSha256,
    round,
    voice_condition: voiceCondition,
    expires_at: expiresAt,
  });
}

export async function consumeProductionProjectShadowCellAuthorization({
  authorizationPath,
  expected,
  repoRoot,
  nodePath = "/usr/local/bin/node",
  execute = execFileSync,
}: {
  authorizationPath: string;
  expected: ProductionProjectShadowCellAuthorizationInput;
  repoRoot: string;
  nodePath?: string;
  execute?: typeof execFileSync;
}): Promise<ProductionProjectShadowAuthorizationReceipt> {
  const [nodeMetadata, canonicalNode, canonicalRoot] = await Promise.all([
    lstat(nodePath).catch(() => null),
    realpath(nodePath).catch(() => null),
    realpath(repoRoot).catch(() => null),
  ]);
  if (
    !nodeMetadata?.isFile() ||
    nodeMetadata.isSymbolicLink() ||
    nodeMetadata.uid !== 0 ||
    (nodeMetadata.mode & 0o022) !== 0 ||
    (nodeMetadata.mode & 0o111) === 0 ||
    canonicalNode !== nodePath ||
    canonicalRoot === null
  ) {
    authorizationDenied();
  }
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  environment.MEELNI_PRODUCTION_ACTION_AUTHORIZATION = authorizationPath;
  let stdout: string;
  try {
    stdout = execute(
      nodePath,
      [
        join(
          canonicalRoot,
          "scripts",
          "consume-production-action-authorization.mjs"
        ),
        "--action",
        expected.action,
        "--provider",
        expected.provider,
        "--configuration-sha256",
        expected.configurationSha256,
        "--target-fingerprint",
        expected.targetFingerprint,
      ],
      {
        cwd: canonicalRoot,
        encoding: "utf8",
        env: environment,
        maxBuffer: 64 * 1_024,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch {
    authorizationDenied();
  }
  if (Buffer.byteLength(stdout, "utf8") > 4_096) {
    authorizationDenied();
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    authorizationDenied();
  }
  return exactConsumptionReceipt(value);
}

export function assertCurrentProductionProjectShadowDeployment({
  credentials,
  expectedCandidateSha,
  expectedVersion,
  execute = execFileSync,
}: {
  credentials: ProductionProjectShadowLiveKitCredentials;
  expectedCandidateSha: string;
  expectedVersion: string;
  execute?: typeof execFileSync;
}): void {
  if (
    credentials.url !== PRODUCTION_PROJECT_SHADOW_LIVEKIT_URL ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(credentials.apiKey) ||
    !/^[A-Za-z0-9_-]{1,512}$/.test(credentials.apiSecret) ||
    !GIT_SHA.test(expectedCandidateSha) ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(expectedVersion)
  ) {
    deploymentMismatch();
  }
  let stdout: string;
  try {
    stdout = execute(
      "/opt/homebrew/bin/lk",
      [
        "--quiet",
        "agent",
        "versions",
        "--id",
        PRODUCTION_PROJECT_SHADOW_AGENT_ID,
        "--json",
      ],
      {
        encoding: "utf8",
        env: {
          HOME: "/var/empty",
          NODE_ENV: "production",
          LIVEKIT_URL: credentials.url,
          LIVEKIT_API_KEY: credentials.apiKey,
          LIVEKIT_API_SECRET: credentials.apiSecret,
        },
        maxBuffer: 64 * 1_024,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch {
    deploymentMismatch();
  }
  if (Buffer.byteLength(stdout, "utf8") > 64 * 1_024) {
    deploymentMismatch();
  }
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    deploymentMismatch();
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as { versions?: unknown }).versions) ||
    (value as { versions: unknown[] }).versions.length > 100
  ) {
    deploymentMismatch();
  }
  const current = (value as { versions: unknown[] }).versions.filter(
    (candidate) =>
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      (candidate as { current?: unknown }).current === true
  );
  if (current.length !== 1) {
    deploymentMismatch();
  }
  const selected = current[0] as {
    active?: unknown;
    attributes?: unknown;
    status?: unknown;
    version?: unknown;
  };
  if (
    selected.version !== expectedVersion ||
    selected.status !== "Available" ||
    selected.active !== true ||
    selected.attributes === null ||
    typeof selected.attributes !== "object" ||
    Array.isArray(selected.attributes) ||
    (selected.attributes as { "meelni.source_sha"?: unknown })[
      "meelni.source_sha"
    ] !== expectedCandidateSha
  ) {
    deploymentMismatch();
  }
}

function exactIntent(
  value: ProductionProjectShadowCellIntent
): ProductionProjectShadowCellIntent {
  const keys = [
    "runId",
    "candidateGitSha",
    "expectedRevision",
    "sessionBindingSha256",
    "expiresAt",
    "round",
    "voiceCondition",
    "controlPlaneUrl",
    "deploymentVersion",
  ] as const;
  const snapshot: Record<string, unknown> = {};
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== keys.length
    ) {
      invalid();
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        invalid();
      }
      snapshot[key] = descriptor.value;
    }
  } catch {
    invalid();
  }
  const candidate = snapshot as unknown as ProductionProjectShadowCellIntent;
  if (
    typeof candidate.runId !== "string" ||
    !SHA256.test(candidate.runId) ||
    typeof candidate.candidateGitSha !== "string" ||
    !GIT_SHA.test(candidate.candidateGitSha) ||
    !Number.isSafeInteger(candidate.expectedRevision) ||
    candidate.expectedRevision < 0 ||
    typeof candidate.sessionBindingSha256 !== "string" ||
    !SHA256.test(candidate.sessionBindingSha256) ||
    typeof candidate.expiresAt !== "string" ||
    candidate.expiresAt.length !== 24 ||
    typeof candidate.round !== "string" ||
    !ROUND.has(candidate.round as never) ||
    typeof candidate.voiceCondition !== "string" ||
    !VOICE_CONDITION.has(candidate.voiceCondition as never) ||
    typeof candidate.controlPlaneUrl !== "string" ||
    candidate.controlPlaneUrl !== PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL ||
    typeof candidate.deploymentVersion !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(candidate.deploymentVersion)
  ) {
    invalid();
  }
  const parsedExpiry = new Date(candidate.expiresAt);
  if (
    !Number.isFinite(parsedExpiry.getTime()) ||
    parsedExpiry.toISOString() !== candidate.expiresAt
  ) {
    invalid();
  }
  return { ...candidate };
}

function exactConsumptionReceipt(
  value: unknown
): ProductionProjectShadowAuthorizationReceipt {
  const keys = [
    "contract",
    "authorizationId",
    "action",
    "candidateSha",
    "artifactSha256",
  ] as const;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    authorizationDenied();
  }
  const candidate = value as Record<(typeof keys)[number], unknown>;
  if (
    candidate.contract !== "meelni.production-action-consumption-receipt.v1" ||
    typeof candidate.authorizationId !== "string" ||
    !/^ora_[a-f0-9]{32}$/.test(candidate.authorizationId) ||
    candidate.action !== PRODUCTION_PROJECT_SHADOW_ACTION ||
    typeof candidate.candidateSha !== "string" ||
    !GIT_SHA.test(candidate.candidateSha) ||
    typeof candidate.artifactSha256 !== "string" ||
    !SHA256.test(candidate.artifactSha256)
  ) {
    authorizationDenied();
  }
  return Object.freeze({
    contract: candidate.contract,
    authorizationId: candidate.authorizationId,
    action: candidate.action,
    candidateSha: candidate.candidateSha,
    artifactSha256: candidate.artifactSha256,
  });
}

function domainHash(domain: "configuration" | "target", value: unknown) {
  return createHash("sha256")
    .update(PRODUCTION_PROJECT_SHADOW_CELL_CONTRACT_VERSION)
    .update("\0")
    .update(domain)
    .update("\0")
    .update(canonicalJson(value))
    .digest("hex");
}

function invalid(): never {
  throw new Error("production_project_shadow_cell_invalid");
}

function authorizationDenied(): never {
  throw new Error("production_project_shadow_authorization_denied");
}

function deploymentMismatch(): never {
  throw new Error("production_project_shadow_deployment_mismatch");
}
