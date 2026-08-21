import { createHmac } from "node:crypto";

import type { AdaptiveInterviewerProductionAdmission } from "@meelni/agent";

export const ADAPTIVE_INTERVIEWER_PRODUCTION_ADMISSION_VERSION =
  "adaptive-interviewer-production-admission.v1" as const;
export const ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_VERSION =
  "adaptive-interviewer-production-runtime-config.v1" as const;
export const ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256 =
  "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423" as const;
export const ADAPTIVE_INTERVIEWER_SELECTED_CONFIG_SHA256 =
  "b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac" as const;
export const ADAPTIVE_INTERVIEWER_ROLLOUT_CONFIG_SHA256 =
  "ff50893d0bc9e3dea640e61323c79f4fe51381264ba98c6cec18f17b341cd042" as const;

const ADMISSION_DOMAIN =
  "meelni.adaptive-interviewer.production-admission.v1\0";
const ADMISSION_KEY_CONTEXT =
  "meelni/adaptive-interviewer-production-admission-key/v1";
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA64 = /^[a-f0-9]{64}$/u;
const SESSION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FLAGS = [
  "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
  "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
  "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
  "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
  "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
] as const;

export interface ProductionAdaptiveAdmissionConfig {
  candidateGitSha: string;
  configurationSha256: typeof ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256;
}

export type ProductionAdaptiveAdmissionResolution =
  | { status: "disabled" }
  | { status: "invalid"; reason: "partial_or_invalid_configuration" }
  | { status: "enabled"; config: ProductionAdaptiveAdmissionConfig };

export function resolveProductionAdaptiveAdmissionConfig(
  env: Record<string, string | undefined>
): ProductionAdaptiveAdmissionResolution {
  const launchValues = [
    env.MEELNI_ADAPTIVE_INTERVIEWER_STAGE,
    env.MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT,
    env.MEELNI_ADAPTIVE_INTERVIEWER_COHORT,
    env.MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE,
    env.MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256,
    env.MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA,
    ...FLAGS.map((name) => env[name]),
  ];
  if (launchValues.every((value) => value === undefined || value === "")) {
    return { status: "disabled" };
  }
  const candidateGitSha = env.MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA;
  if (
    env.MEELNI_ADAPTIVE_INTERVIEWER_STAGE !== "candidate_default" ||
    env.MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT !== "production" ||
    env.MEELNI_ADAPTIVE_INTERVIEWER_COHORT !== "canary" ||
    env.MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE !== "default" ||
    env.MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256 !==
      ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256 ||
    !candidateGitSha ||
    !SHA40.test(candidateGitSha) ||
    FLAGS.some((name) => env[name] !== "true")
  ) {
    return { status: "invalid", reason: "partial_or_invalid_configuration" };
  }
  return {
    status: "enabled",
    config: {
      candidateGitSha,
      configurationSha256: ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256,
    },
  };
}

export function createProductionAdaptiveAdmission(input: {
  config: ProductionAdaptiveAdmissionConfig;
  crossServiceSecret: string;
  sessionId: string;
  roomName: string;
  requestFingerprint: string;
  deadlineAt: string;
}): AdaptiveInterviewerProductionAdmission {
  if (
    !input.crossServiceSecret ||
    !SESSION_TOKEN.test(input.sessionId) ||
    !SESSION_TOKEN.test(input.roomName) ||
    !SHA64.test(input.requestFingerprint) ||
    !isCanonicalTimestamp(input.deadlineAt) ||
    !SHA40.test(input.config.candidateGitSha) ||
    input.config.configurationSha256 !==
      ADAPTIVE_INTERVIEWER_PRODUCTION_CONFIG_SHA256
  ) {
    throw new Error("adaptive_interviewer_production_admission_invalid");
  }
  const payload = {
    adapter_id: "meelni_director_openai_responses" as const,
    adapter_version: "interview-director-adapter.openai-responses.v1" as const,
    attempt_reservation_nano_usd: 100_000_000 as const,
    candidate_git_sha: input.config.candidateGitSha,
    cohort: "canary" as const,
    configuration_sha256: input.config.configurationSha256,
    contract_version: ADAPTIVE_INTERVIEWER_PRODUCTION_ADMISSION_VERSION,
    deadline_at: input.deadlineAt,
    director_deadline_ms: 750 as const,
    environment: "production" as const,
    exposure: "default" as const,
    maximum_attempts: 10 as const,
    model: "gpt-5.4-mini-2026-03-17" as const,
    provider: "openai-api" as const,
    recommendation_ttl_ms: 5_000 as const,
    repository_rollout_configuration_sha256:
      ADAPTIVE_INTERVIEWER_ROLLOUT_CONFIG_SHA256,
    request_fingerprint: input.requestFingerprint,
    room_name: input.roomName,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_SELECTED_CONFIG_SHA256,
    session_budget_nano_usd: 1_000_000_000 as const,
    session_id: input.sessionId,
    stage: "candidate_default" as const,
  };
  const signingKey = createHmac("sha256", input.crossServiceSecret)
    .update(ADMISSION_KEY_CONTEXT)
    .digest();
  const value = createHmac("sha256", signingKey)
    .update(ADMISSION_DOMAIN)
    .update(canonicalJson(payload))
    .digest("hex");
  return { ...payload, signature: { algorithm: "hmac-sha256", value } };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("canonical_json_invalid");
  return encoded;
}

function isCanonicalTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    new Date(value).toISOString() === value
  );
}
