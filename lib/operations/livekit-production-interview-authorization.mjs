import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

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

const LIVEKIT_PRODUCTION_INTERVIEW_SUBDOMAIN =
  LIVEKIT_PRODUCTION_INTERVIEW_PROJECT_HOST.replace(/\.livekit\.cloud$/, "");
const TRANSCRIPT_SECRET_PATTERN =
  /^MEELNI_TRANSCRIPT_INGEST_SECRET=([A-Za-z0-9_-]{32,})\n?$/;

export async function resolveLiveKitProductionInterviewAuthorizationInput({
  configFile,
  secretsFile,
  repoRoot = process.cwd(),
} = {}) {
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
  if (!TRANSCRIPT_SECRET_PATTERN.test(secrets.toString("utf8"))) {
    throw new Error("livekit_transcript_secrets_invalid");
  }

  const transcriptSecretSha256 = sha256(secrets);
  const targetMaterial = [
    "livekit",
    "production",
    "interview",
    LIVEKIT_PRODUCTION_INTERVIEW_URL,
    LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID,
    "transcript-secret-sha256",
    transcriptSecretSha256,
  ].join(":");

  return {
    action: LIVEKIT_PRODUCTION_INTERVIEW_ACTION,
    configurationSha256: sha256(configuration),
    targetFingerprint: sha256(targetMaterial),
  };
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
