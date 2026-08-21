import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { assertLiveKitProductionRuntimeSecrets } from "./livekit-production-runtime-secrets.mjs";
import {
  assertPrivateExternalFile,
  PRODUCTION_ACTIONS,
  sha256,
} from "./production-action-authorization.mjs";

export const LIVEKIT_PRODUCTION_INTERVIEW_ACTION =
  PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_INTERVIEW_DEPLOY;
export const LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID = "CA_yawKG67rCMG4";
export const LIVEKIT_PRODUCTION_INTERVIEW_PROJECT_HOST =
  "meelni-ek4vaisp.livekit.cloud";
export const LIVEKIT_PRODUCTION_INTERVIEW_URL = `wss://${LIVEKIT_PRODUCTION_INTERVIEW_PROJECT_HOST}`;
export const LIVEKIT_PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL =
  "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow";

const LIVEKIT_PRODUCTION_INTERVIEW_SUBDOMAIN =
  LIVEKIT_PRODUCTION_INTERVIEW_PROJECT_HOST.replace(/\.livekit\.cloud$/, "");
export async function resolveLiveKitProductionInterviewAuthorizationInput({
  configFile,
  secretsFile,
  mode = "production",
  expectedCandidateSha,
  repoRoot = process.cwd(),
} = {}) {
  if (mode !== "production" && mode !== "production-project-shadow") {
    throw new Error("livekit_production_mode_invalid");
  }
  if (
    mode === "production-project-shadow" &&
    !/^[a-f0-9]{40}$/.test(expectedCandidateSha)
  ) {
    throw new Error("livekit_production_candidate_invalid");
  }
  const canonicalRepoRoot = await realpath(repoRoot);
  const canonicalConfigPath = await assertRegularNonSymlinkFile(
    configFile,
    "livekit_production_config"
  );
  const canonicalSecretsPath = await assertPrivateExternalFile(
    secretsFile,
    canonicalRepoRoot,
    "livekit_transcript_secrets_file"
  );
  const [configuration, secrets] = await Promise.all([
    readFile(canonicalConfigPath),
    readFile(canonicalSecretsPath),
  ]);

  assertCanonicalProductionInterviewConfig(configuration.toString("utf8"));
  assertLiveKitProductionRuntimeSecrets(secrets.toString("utf8"), {
    includeTranscriptSecret: true,
    includeProviderSecret: true,
    dispatchVariableName: "LIVEKIT_INTERVIEW_AGENT_NAME",
    expectedDispatchName: LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID,
    includeShadowBootstrap: mode === "production-project-shadow",
    expectedCandidateSha,
    expectedControlPlaneUrl:
      LIVEKIT_PRODUCTION_PROJECT_SHADOW_CONTROL_PLANE_URL,
    shadowEphemeralOnly: mode === "production-project-shadow",
    expectedProtectionBypassSecret:
      mode === "production-project-shadow"
        ? readEnvironmentValue(
            secrets.toString("utf8"),
            "MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET"
          )
        : undefined,
  });

  const runtimeSecretsSha256 = sha256(secrets);
  const targetMaterial = [
    "livekit",
    "production",
    "interview",
    LIVEKIT_PRODUCTION_INTERVIEW_URL,
    LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID,
    "runtime-secrets-sha256",
    runtimeSecretsSha256,
    "secrets-mode",
    "overwrite",
  ].join(":");

  return {
    action: LIVEKIT_PRODUCTION_INTERVIEW_ACTION,
    configurationSha256: sha256(configuration),
    targetFingerprint: sha256(targetMaterial),
  };
}

function readEnvironmentValue(text, name) {
  const prefix = `${name}=`;
  const matches = text.split("\n").filter((line) => line.startsWith(prefix));
  return matches.length === 1 ? matches[0].slice(prefix.length) : undefined;
}

function assertCanonicalProductionInterviewConfig(configuration) {
  let section = "";
  let projectCount = 0;
  let agentCount = 0;
  let projectValue = "";
  let agentValue = "";
  let invalid = false;

  for (const line of configuration.split(/\r?\n/)) {
    const sectionMatch = line.match(/^[ \t]*\[([^\]]+)\][ \t]*$/);
    if (sectionMatch) {
      section = sectionMatch[1].replace(/[ \t]/g, "");
      continue;
    }
    if (section === "project" && /^[ \t]*subdomain[ \t]*=/.test(line)) {
      projectCount += 1;
      const match = line.match(/^[ \t]*subdomain[ \t]*=[ \t]*"([^"]+)"[ \t]*$/);
      if (!match) invalid = true;
      else projectValue = match[1];
    }
    if (section === "agent" && /^[ \t]*id[ \t]*=/.test(line)) {
      agentCount += 1;
      const match = line.match(/^[ \t]*id[ \t]*=[ \t]*"([^"]+)"[ \t]*$/);
      if (!match) invalid = true;
      else agentValue = match[1];
    }
  }

  if (
    invalid ||
    projectCount !== 1 ||
    agentCount !== 1 ||
    projectValue !== LIVEKIT_PRODUCTION_INTERVIEW_SUBDOMAIN ||
    agentValue !== LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID
  ) {
    throw new Error("livekit_production_config_identity_invalid");
  }
}

async function assertRegularNonSymlinkFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error(`${label}_path_invalid`);
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error(`${label}_path_invalid`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label}_path_invalid`);
  }
  try {
    return await realpath(resolve(path));
  } catch {
    throw new Error(`${label}_path_invalid`);
  }
}
