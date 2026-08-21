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

export const VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT =
  "meelni.vercel-production-web-shadow-canary-config.v1";
export const VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT = Object.freeze({
  orgId: "team_rWHulu37yqEIUBTvTHqemRHU",
  projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
  projectName: "meelni",
  scope: "meelni",
});
export const VERCEL_PRODUCTION_WEB_SHADOW_CANARY_MAX_BYTES = 16 * 1024;

const CONFIG_KEYS = [
  "contract",
  "expires_at",
  "operation",
  "owner_user_id",
  "run_id",
  "source_deployment_id",
  "web_candidate_sha",
  "worker_candidate_sha",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,64}$/;
const PARSED_CONFIGS = new WeakSet();

export function parseVercelProductionWebShadowCanaryConfig(
  contents,
  { now = new Date() } = {}
) {
  if (
    typeof contents !== "string" ||
    contents.length === 0 ||
    Buffer.byteLength(contents, "utf8") >
      VERCEL_PRODUCTION_WEB_SHADOW_CANARY_MAX_BYTES
  ) {
    invalid();
  }
  let value;
  try {
    value = parseJsonRejectingDuplicateKeys(contents);
  } catch {
    invalid();
  }
  if (!isPlainRecord(value) || !hasExactKeys(value, CONFIG_KEYS)) invalid();
  if (
    value.contract !== VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT ||
    !["enable", "disable"].includes(value.operation) ||
    !UUID.test(value.owner_user_id) ||
    !SHA256.test(value.run_id) ||
    !GIT_SHA.test(value.web_candidate_sha) ||
    !GIT_SHA.test(value.worker_candidate_sha) ||
    !DEPLOYMENT_ID.test(value.source_deployment_id)
  ) {
    invalid();
  }
  const expiresAt = parseWholeSecond(value.expires_at);
  if (
    value.operation === "enable" &&
    (expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() > now.getTime() + 60 * 60 * 1_000)
  ) {
    invalid();
  }
  const parsed = Object.freeze({
    contract: value.contract,
    expires_at: value.expires_at,
    operation: value.operation,
    owner_user_id: value.owner_user_id,
    run_id: value.run_id,
    source_deployment_id: value.source_deployment_id,
    web_candidate_sha: value.web_candidate_sha,
    worker_candidate_sha: value.worker_candidate_sha,
  });
  PARSED_CONFIGS.add(parsed);
  return parsed;
}

export function vercelProductionWebShadowCanaryAuthorizationInput(config) {
  if (!PARSED_CONFIGS.has(config)) {
    throw new Error("production_web_shadow_config_invalid");
  }
  const configurationSha256 = sha256(canonicalJson(config));
  const targetFingerprint = sha256(
    `meelni.vercel-production-web-shadow-canary-target.v1\0${canonicalJson({
      environment: "production",
      org_id: VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.orgId,
      project_id: VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.projectId,
      source_deployment_id: config.source_deployment_id,
    })}`
  );
  return Object.freeze({
    action: PRODUCTION_ACTIONS.VERCEL_PRODUCTION_WEB_SHADOW_CANARY,
    provider: "vercel",
    configurationSha256,
    targetFingerprint,
  });
}

export async function loadVercelProductionWebShadowCanaryConfig({
  configPath,
  repoRoot,
  now = new Date(),
}) {
  const canonicalPath = await assertPrivateExternalFile(
    configPath,
    repoRoot,
    "production_web_shadow_config_file"
  );
  return parseVercelProductionWebShadowCanaryConfig(
    await readFile(canonicalPath, "utf8"),
    { now }
  );
}

export async function applyVercelProductionWebShadowCanaryConfig({
  config,
  authorizationPath,
  repoRoot,
  now = new Date(),
  consumeAuthorization = consumeProductionActionAuthorization,
  resolveCandidate = resolveCleanGitCandidate,
  runVercel = defaultRunVercel,
}) {
  if (resolveCandidate(repoRoot) !== config.web_candidate_sha) {
    throw new Error("production_web_shadow_web_candidate_mismatch");
  }
  const input = vercelProductionWebShadowCanaryAuthorizationInput(config);
  const consumed = await consumeAuthorization({
    authorizationPath,
    repoRoot,
    expected: input,
    now,
  });
  if (consumed.candidateSha !== config.web_candidate_sha) {
    throw new Error("production_web_shadow_web_candidate_mismatch");
  }

  const source = parseDeploymentInspection(
    runVercel(["inspect", config.source_deployment_id, "--json"], { repoRoot })
      .stdout,
    config.source_deployment_id
  );
  if (
    source.name !== VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.projectName ||
    source.contextName !== VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.scope ||
    source.target !== "production" ||
    source.readyState !== "READY"
  ) {
    throw new Error("production_web_shadow_source_deployment_invalid");
  }

  const values = Object.freeze({
    MEELNI_PRODUCTION_WEB_SHADOW_CANARY:
      config.operation === "enable" ? "enabled" : "disabled",
    MEELNI_PRODUCTION_WEB_SHADOW_OWNER_USER_ID: config.owner_user_id,
    MEELNI_PRODUCTION_WEB_SHADOW_RUN_ID: config.run_id,
    MEELNI_PRODUCTION_WEB_SHADOW_CANDIDATE_SHA: config.worker_candidate_sha,
    MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT: config.expires_at,
  });
  for (const [name, value] of Object.entries(values)) {
    runVercel(
      ["env", "add", name, "production", "--force", "--sensitive", "--yes"],
      { input: `${value}\n`, repoRoot }
    );
  }
  const redeploy = runVercel(
    ["redeploy", config.source_deployment_id, "--target", "production"],
    { repoRoot }
  );
  const deploymentUrl = parseDeploymentUrl(redeploy.stdout);
  const result = parseDeploymentInspection(
    runVercel(["inspect", deploymentUrl, "--json"], { repoRoot }).stdout
  );
  if (
    result.name !== VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.projectName ||
    result.contextName !== VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.scope ||
    result.target !== "production" ||
    result.readyState !== "READY"
  ) {
    throw new Error("production_web_shadow_redeployment_invalid");
  }
  return Object.freeze({
    authorizationId: consumed.authorizationId,
    candidateSha: consumed.candidateSha,
    deploymentId: result.id,
    operation: config.operation,
  });
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
      VERCEL_PRODUCTION_WEB_SHADOW_CANARY_PROJECT.scope,
      "--no-color",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: environment,
      input,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 15 * 60 * 1_000,
    }
  );
  if (result.status !== 0 || result.signal) {
    throw new Error("production_web_shadow_vercel_command_failed");
  }
  return { stdout: result.stdout };
}

function parseDeploymentInspection(contents, expectedId) {
  if (typeof contents !== "string" || Buffer.byteLength(contents) > 2_000_000) {
    throw new Error("production_web_shadow_deployment_inspection_invalid");
  }
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("production_web_shadow_deployment_inspection_invalid");
  }
  if (
    !isPlainRecord(value) ||
    !DEPLOYMENT_ID.test(value.id) ||
    (expectedId && value.id !== expectedId) ||
    typeof value.name !== "string" ||
    typeof value.contextName !== "string" ||
    typeof value.target !== "string" ||
    typeof value.readyState !== "string"
  ) {
    throw new Error("production_web_shadow_deployment_inspection_invalid");
  }
  return value;
}

function parseDeploymentUrl(contents) {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const deploymentUrl = lines.findLast((line) =>
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(line)
  );
  if (!deploymentUrl) {
    throw new Error("production_web_shadow_redeployment_invalid");
  }
  return deploymentUrl;
}

function parseWholeSecond(value) {
  if (typeof value !== "string" || value.length !== 24) invalid();
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed.getMilliseconds() !== 0
  ) {
    invalid();
  }
  return parsed;
}

function isPlainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function parseJsonRejectingDuplicateKeys(contents) {
  let offset = 0;
  let valuesSeen = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(contents[offset] ?? "")) offset += 1;
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
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
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
      const character = contents[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(contents.slice(start, offset));
      }
      if (character === "\\") {
        offset += 1;
        const escape = contents[offset];
        if (escape === "u") {
          if (
            !/^[0-9a-fA-F]{4}$/.test(contents.slice(offset + 1, offset + 5))
          ) {
            throw new Error("json_invalid");
          }
          offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error("json_invalid");
        }
        offset += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) {
        throw new Error("json_invalid");
      }
      offset += 1;
    }
    throw new Error("json_invalid");
  };
  const parsed = value();
  whitespace();
  if (offset !== contents.length) throw new Error("json_invalid");
  return parsed;
}

function invalid() {
  throw new Error("production_web_shadow_config_invalid");
}
