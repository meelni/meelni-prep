const OPIK_RUNTIME_VALUES = Object.freeze({
  OPIK_TRACING_ENABLED: "true",
  OPIK_WORKSPACE: "savi-singh",
  OPIK_PROJECT_NAME: "meelni",
  OPIK_CAPTURE_CONTENT: "true",
});

const OPIK_KEYS = Object.freeze([
  "OPIK_TRACING_ENABLED",
  "OPIK_API_KEY",
  "OPIK_WORKSPACE",
  "OPIK_PROJECT_NAME",
  "OPIK_CAPTURE_CONTENT",
]);

/**
 * @param {string} text
 * @param {{
 *   includeTranscriptSecret: boolean;
 *   includeProviderSecret?: boolean;
 *   includeShadowBootstrap?: boolean;
 *   includeAdaptiveProduction?: boolean;
 *   dispatchVariableName?: "LIVEKIT_INTERVIEW_AGENT_NAME" | "LIVEKIT_DEMO_AGENT_NAME";
 *   expectedDispatchName?: string;
 *   expectedCandidateSha?: string;
 *   expectedControlPlaneUrl?: string;
 *   shadowEphemeralOnly?: boolean;
 *   expectedProtectionBypassSecret?: string;
 * }} options
 */
export function assertLiveKitProductionRuntimeSecrets(text, options) {
  const {
    includeTranscriptSecret,
    includeProviderSecret = false,
    includeShadowBootstrap = false,
    dispatchVariableName = undefined,
    expectedDispatchName = undefined,
    expectedCandidateSha = undefined,
    expectedControlPlaneUrl = undefined,
    shadowEphemeralOnly = false,
    expectedProtectionBypassSecret = undefined,
    includeAdaptiveProduction = false,
  } = options;
  const ordinaryKeys = includeTranscriptSecret
    ? ["MEELNI_TRANSCRIPT_INGEST_SECRET", ...OPIK_KEYS]
    : [...OPIK_KEYS];
  if (includeProviderSecret) ordinaryKeys.push("OPENAI_API_KEY");
  if (dispatchVariableName) ordinaryKeys.push(dispatchVariableName);
  if (includeShadowBootstrap && includeAdaptiveProduction) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  const expectedKeys = includeShadowBootstrap
    ? [
        ...ordinaryKeys,
        "MEELNI_PREVIEW_SHADOW_EXECUTION",
        "MEELNI_PREVIEW_SHADOW_KILL_SWITCH",
        "MEELNI_PREVIEW_SHADOW_RUN_ID",
        "MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA",
        "MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL",
        "MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET",
      ]
    : includeAdaptiveProduction
      ? [
          ...ordinaryKeys,
          "MEELNI_ADAPTIVE_INTERVIEWER_STAGE",
          "MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT",
          "MEELNI_ADAPTIVE_INTERVIEWER_COHORT",
          "MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE",
          "MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256",
          "MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA",
          "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
          "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
          "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
          "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
          "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
        ]
      : ordinaryKeys;
  const values = parseExactEnvironment(text, expectedKeys);

  if (
    includeTranscriptSecret &&
    !/^[A-Za-z0-9_-]{32,}$/.test(values.MEELNI_TRANSCRIPT_INGEST_SECRET)
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  if (!/^[A-Za-z0-9._-]{20,4096}$/.test(values.OPIK_API_KEY)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  if (
    includeProviderSecret &&
    (!/^[A-Za-z0-9._-]{20,4096}$/.test(values.OPENAI_API_KEY) ||
      values.OPENAI_API_KEY.startsWith("sk-placeholder"))
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  const opikRuntimeValues = shadowEphemeralOnly
    ? {
        ...OPIK_RUNTIME_VALUES,
        OPIK_TRACING_ENABLED: "false",
        OPIK_CAPTURE_CONTENT: "false",
      }
    : OPIK_RUNTIME_VALUES;
  for (const [name, expected] of Object.entries(opikRuntimeValues)) {
    if (values[name] !== expected) {
      throw new Error("livekit_runtime_secrets_invalid");
    }
  }
  if (
    (dispatchVariableName === undefined) !==
      (expectedDispatchName === undefined) ||
    (dispatchVariableName !== undefined &&
      (values[dispatchVariableName] !== expectedDispatchName ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(expectedDispatchName)))
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  if (
    includeShadowBootstrap &&
    (values.MEELNI_PREVIEW_SHADOW_EXECUTION !== "enabled" ||
      values.MEELNI_PREVIEW_SHADOW_KILL_SWITCH !== "open" ||
      !/^[a-f0-9]{64}$/.test(values.MEELNI_PREVIEW_SHADOW_RUN_ID) ||
      !/^[a-f0-9]{40}$/.test(values.MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA) ||
      values.MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA !== expectedCandidateSha ||
      values.MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL !==
        expectedControlPlaneUrl ||
      !shadowEphemeralOnly ||
      !/^[A-Za-z0-9_-]{16,512}$/.test(
        values.MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET
      ) ||
      values.MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET !==
        expectedProtectionBypassSecret)
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  if (
    includeAdaptiveProduction &&
    (values.MEELNI_ADAPTIVE_INTERVIEWER_STAGE !== "candidate_default" ||
      values.MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT !== "production" ||
      values.MEELNI_ADAPTIVE_INTERVIEWER_COHORT !== "canary" ||
      values.MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE !== "default" ||
      values.MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256 !==
        "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423" ||
      !/^[a-f0-9]{40}$/.test(
        values.MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA
      ) ||
      values.MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA !==
        expectedCandidateSha ||
      [
        "MEELNI_INTERVIEW_BRIEF_V2_ENABLED",
        "MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED",
        "MEELNI_INTERVIEW_TOOLS_V1_ENABLED",
        "MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED",
        "MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED",
      ].some((name) => values[name] !== "true"))
  ) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
}

function parseExactEnvironment(text, expectedKeys) {
  if (typeof text !== "string" || /\r/.test(text)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  const lines = text.endsWith("\n")
    ? text.slice(0, -1).split("\n")
    : text.split("\n");
  if (lines.length !== expectedKeys.length || lines.some((line) => !line)) {
    throw new Error("livekit_runtime_secrets_invalid");
  }

  const values = {};
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("livekit_runtime_secrets_invalid");
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!expectedKeys.includes(name) || Object.hasOwn(values, name) || !value) {
      throw new Error("livekit_runtime_secrets_invalid");
    }
    values[name] = value;
  }
  if (expectedKeys.some((name) => !Object.hasOwn(values, name))) {
    throw new Error("livekit_runtime_secrets_invalid");
  }
  return values;
}
