import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  assertPrivateExternalFile,
  canonicalJson,
  consumeProductionActionAuthorization,
  PRODUCTION_ACTIONS,
  resolveCleanGitCandidate,
  sha256,
} from "./production-action-authorization.mjs";

export const VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG =
  "meelni.vercel-adaptive-interviewer-production-launch.v1";
export const VERCEL_ADAPTIVE_PRODUCTION_PROJECT = Object.freeze({
  orgId: "team_rWHulu37yqEIUBTvTHqemRHU",
  projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
  projectName: "meelni",
  scope: "meelni",
});
const CONFIG_SHA =
  "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423";
const KEYS = [
  "candidate_git_sha",
  "configuration_sha256",
  "contract",
  "expires_at",
  "operation",
  "source_deployment_id",
];
const ENVIRONMENT_VALUES = Object.freeze({
  MEELNI_ADAPTIVE_INTERVIEWER_STAGE: "candidate_default",
  MEELNI_ADAPTIVE_INTERVIEWER_ENVIRONMENT: "production",
  MEELNI_ADAPTIVE_INTERVIEWER_COHORT: "canary",
  MEELNI_ADAPTIVE_INTERVIEWER_EXPOSURE: "default",
  MEELNI_ADAPTIVE_INTERVIEWER_CONFIG_SHA256: CONFIG_SHA,
  MEELNI_INTERVIEW_BRIEF_V2_ENABLED: "true",
  MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED: "true",
  MEELNI_INTERVIEW_TOOLS_V1_ENABLED: "true",
  MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED: "true",
  MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED: "true",
});
const PARSED = new WeakSet();

export function parseVercelAdaptiveProductionLaunchConfig(
  contents,
  { now = new Date() } = {}
) {
  if (typeof contents !== "string" || Buffer.byteLength(contents) > 16 * 1024)
    invalid();
  let value;
  try {
    value = parseJsonRejectingDuplicateKeys(contents);
  } catch {
    invalid();
  }
  if (
    !plain(value) ||
    Reflect.ownKeys(value).length !== KEYS.length ||
    !KEYS.every((key) => Object.hasOwn(value, key))
  )
    invalid();
  if (
    value.contract !== VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG ||
    !["enable", "disable"].includes(value.operation) ||
    !/^[a-f0-9]{40}$/.test(value.candidate_git_sha) ||
    value.configuration_sha256 !== CONFIG_SHA ||
    !/^dpl_[A-Za-z0-9]{20,64}$/.test(value.source_deployment_id) ||
    typeof value.expires_at !== "string" ||
    value.expires_at.length !== 24
  )
    invalid();
  const expiresAt = new Date(value.expires_at);
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.toISOString() !== value.expires_at ||
    expiresAt <= now ||
    expiresAt.getTime() > now.getTime() + 60 * 60_000
  )
    invalid();
  const parsed = Object.freeze({
    candidate_git_sha: value.candidate_git_sha,
    configuration_sha256: value.configuration_sha256,
    contract: value.contract,
    expires_at: value.expires_at,
    operation: value.operation,
    source_deployment_id: value.source_deployment_id,
  });
  PARSED.add(parsed);
  return parsed;
}

export async function loadVercelAdaptiveProductionLaunchConfig({
  configPath,
  repoRoot,
  now,
}) {
  const path = await assertPrivateExternalFile(
    configPath,
    repoRoot,
    "adaptive_production_config_file"
  );
  return parseVercelAdaptiveProductionLaunchConfig(
    await readFile(path, "utf8"),
    { now }
  );
}

export function vercelAdaptiveProductionLaunchAuthorizationInput(config) {
  if (!PARSED.has(config)) invalid();
  return Object.freeze({
    action: PRODUCTION_ACTIONS.VERCEL_ADAPTIVE_INTERVIEWER_PRODUCTION_LAUNCH,
    provider: "vercel",
    configurationSha256: sha256(canonicalJson(config)),
    targetFingerprint: sha256(
      `meelni.vercel-adaptive-production-target.v1\0${canonicalJson({
        environment: "production",
        org_id: VERCEL_ADAPTIVE_PRODUCTION_PROJECT.orgId,
        project_id: VERCEL_ADAPTIVE_PRODUCTION_PROJECT.projectId,
        source_deployment_id: config.source_deployment_id,
      })}`
    ),
  });
}

export async function applyVercelAdaptiveProductionLaunch({
  config,
  authorizationPath,
  repoRoot,
  now = new Date(),
  consumeAuthorization = consumeProductionActionAuthorization,
  resolveCandidate = resolveCleanGitCandidate,
  runVercel = defaultRunVercel,
}) {
  if (resolveCandidate(repoRoot) !== config.candidate_git_sha)
    throw new Error("adaptive_production_candidate_mismatch");
  const consumed = await consumeAuthorization({
    authorizationPath,
    repoRoot,
    expected: vercelAdaptiveProductionLaunchAuthorizationInput(config),
    now,
  });
  if (consumed.candidateSha !== config.candidate_git_sha)
    throw new Error("adaptive_production_candidate_mismatch");
  const source = inspect(
    runVercel(["inspect", config.source_deployment_id, "--json"], { repoRoot })
      .stdout,
    config.source_deployment_id
  );
  assertProductionDeployment(source);
  const values = {
    ...ENVIRONMENT_VALUES,
    MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA: config.candidate_git_sha,
  };
  if (config.operation === "enable") {
    for (const [name, value] of Object.entries(values)) {
      runVercel(
        ["env", "add", name, "production", "--force", "--sensitive", "--yes"],
        { input: `${value}\n`, repoRoot }
      );
    }
  } else {
    for (const name of Object.keys(values))
      runVercel(["env", "rm", name, "production", "--yes"], { repoRoot });
  }
  const redeploy = runVercel(
    ["redeploy", config.source_deployment_id, "--target", "production"],
    { repoRoot }
  );
  const url = redeploy.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(line));
  if (!url) throw new Error("adaptive_production_redeployment_invalid");
  const result = inspect(
    runVercel(["inspect", url, "--json"], { repoRoot }).stdout
  );
  assertProductionDeployment(result);
  return Object.freeze({
    authorizationId: consumed.authorizationId,
    candidateSha: consumed.candidateSha,
    deploymentId: result.id,
    operation: config.operation,
  });
}

function assertProductionDeployment(value) {
  if (
    value.name !== VERCEL_ADAPTIVE_PRODUCTION_PROJECT.projectName ||
    value.contextName !== VERCEL_ADAPTIVE_PRODUCTION_PROJECT.scope ||
    value.target !== "production" ||
    value.readyState !== "READY"
  )
    throw new Error("adaptive_production_deployment_invalid");
}
function inspect(contents, expectedId) {
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("adaptive_production_deployment_invalid");
  }
  if (
    !plain(value) ||
    !/^dpl_[A-Za-z0-9]{20,64}$/.test(value.id) ||
    (expectedId && value.id !== expectedId)
  )
    throw new Error("adaptive_production_deployment_invalid");
  return value;
}
function plain(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function invalid() {
  throw new Error("adaptive_production_config_invalid");
}
function parseJsonRejectingDuplicateKeys(contents) {
  let offset = 0;
  let valuesSeen = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/u.test(contents[offset] ?? "")) offset += 1;
  };
  const value = (depth = 0) => {
    valuesSeen += 1;
    if (valuesSeen > 64 || depth > 8) throw new Error("json_limit_invalid");
    whitespace();
    const character = contents[offset];
    if (character === "{") return object(depth);
    if (character === "[") return array(depth);
    if (character === '"') return string();
    for (const [literal, parsed] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ]) {
      if (contents.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const match = contents
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (!match) throw new Error("json_invalid");
    offset += match[0].length;
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) throw new Error("json_invalid");
    return parsed;
  };
  const object = (depth) => {
    offset += 1;
    whitespace();
    const entries = [];
    const keys = new Set();
    if (contents[offset] === "}") {
      offset += 1;
      return {};
    }
    while (true) {
      whitespace();
      if (contents[offset] !== '"') throw new Error("json_invalid");
      const key = string();
      if (keys.has(key)) throw new Error("json_duplicate_key");
      keys.add(key);
      whitespace();
      if (contents[offset] !== ":") throw new Error("json_invalid");
      offset += 1;
      if (entries.length >= 16) throw new Error("json_limit_invalid");
      entries.push([key, value(depth + 1)]);
      whitespace();
      if (contents[offset] === "}") {
        offset += 1;
        return Object.fromEntries(entries);
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const array = (depth) => {
    offset += 1;
    whitespace();
    const entries = [];
    if (contents[offset] === "]") {
      offset += 1;
      return entries;
    }
    while (true) {
      if (entries.length >= 16) throw new Error("json_limit_invalid");
      entries.push(value(depth + 1));
      whitespace();
      if (contents[offset] === "]") {
        offset += 1;
        return entries;
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const string = () => {
    const start = offset;
    offset += 1;
    while (offset < contents.length) {
      if (contents[offset] === '"') {
        offset += 1;
        return JSON.parse(contents.slice(start, offset));
      }
      if (contents[offset] === "\\") offset += 1;
      offset += 1;
    }
    throw new Error("json_invalid");
  };
  const parsed = value();
  whitespace();
  if (offset !== contents.length) throw new Error("json_invalid");
  return parsed;
}
function defaultRunVercel(args, { input, repoRoot }) {
  const environment = Object.fromEntries(
    [
      "HOME",
      "LANG",
      "LC_ALL",
      "NPM_CONFIG_CACHE",
      "PATH",
      "TMPDIR",
      "VERCEL_TOKEN",
      "XDG_CONFIG_HOME",
    ]
      .map((name) => [name, process.env[name]])
      .filter((entry) => typeof entry[1] === "string")
  );
  const npxCli = join(
    dirname(process.execPath),
    "..",
    "lib",
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js"
  );
  environment.PATH = `${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
  const result = spawnSync(
    process.execPath,
    [
      npxCli,
      "--yes",
      "vercel@55.0.0",
      ...args,
      "--scope",
      VERCEL_ADAPTIVE_PRODUCTION_PROJECT.scope,
      "--no-color",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: environment,
      input,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 15 * 60_000,
    }
  );
  if (result.status !== 0 || result.signal)
    throw new Error("adaptive_production_vercel_command_failed");
  return { stdout: result.stdout };
}
