#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCleanGitCandidate } from "../lib/operations/production-action-authorization.mjs";
import {
  preparePrivateExternalTarget,
  prepareUnsignedProductionAction,
  verifyExternalProductionAction,
  writePrivateFileCreateOnly,
} from "../lib/operations/production-action-owner-tooling.mjs";
import {
  applyVercelProductionWebShadowCanaryConfig,
  loadVercelProductionWebShadowCanaryConfig,
  parseVercelProductionWebShadowCanaryConfig,
  VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT,
  vercelProductionWebShadowCanaryAuthorizationInput,
} from "../lib/operations/vercel-production-web-shadow-canary.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runVercelProductionWebShadowCanaryCli({
  argv = process.argv.slice(2),
  root = repoRoot,
  stdout = process.stdout,
  prepare = prepareUnsignedProductionAction,
  verify = verifyExternalProductionAction,
  apply = applyVercelProductionWebShadowCanaryConfig,
  now = new Date(),
} = {}) {
  const [command, ...rawOptions] = argv;
  if (!command || command === "help" || command === "--help") {
    stdout.write(usage());
    return 0;
  }
  const options = parseOptions(rawOptions);
  if (command === "write-config") {
    assertNoUnknownOptions(options, [
      "expires-at",
      "operation",
      "output-path",
      "owner-user-id",
      "run-id",
      "source-deployment-id",
      "web-candidate-sha",
      "worker-candidate-sha",
    ]);
    const config = parseVercelProductionWebShadowCanaryConfig(
      JSON.stringify({
        contract: VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT,
        expires_at: required(options, "expires-at"),
        operation: required(options, "operation"),
        owner_user_id: required(options, "owner-user-id"),
        run_id: required(options, "run-id"),
        source_deployment_id: required(options, "source-deployment-id"),
        web_candidate_sha: required(options, "web-candidate-sha"),
        worker_candidate_sha: required(options, "worker-candidate-sha"),
      }),
      { now }
    );
    const target = await preparePrivateExternalTarget(
      required(options, "output-path"),
      root,
      "production_web_shadow_config_file"
    );
    await writePrivateFileCreateOnly(
      target,
      `${JSON.stringify(config, null, 2)}\n`
    );
    stdout.write('{"result":"configuration_written"}\n');
    return 0;
  }
  const config = await loadVercelProductionWebShadowCanaryConfig({
    configPath: required(options, "config-file"),
    repoRoot: root,
    now,
  });
  if (resolveCleanGitCandidate(root) !== config.web_candidate_sha) {
    throw new Error("production_web_shadow_web_candidate_mismatch");
  }
  const input = vercelProductionWebShadowCanaryAuthorizationInput(config);

  if (command === "prepare") {
    assertNoUnknownOptions(options, [
      "config-file",
      "output-path",
      "ttl-minutes",
    ]);
    const ttlMinutes = options["ttl-minutes"]
      ? Number(options["ttl-minutes"])
      : 15;
    if (!Number.isSafeInteger(ttlMinutes)) {
      throw new Error("production_web_shadow_ttl_invalid");
    }
    await prepare({
      ...input,
      outputPath: required(options, "output-path"),
      repoRoot: root,
      now,
      ttlMs: ttlMinutes * 60 * 1_000,
    });
    stdout.write('{"result":"unsigned_payload_written"}\n');
    return 0;
  }

  if (command === "verify") {
    assertNoUnknownOptions(options, ["artifact-path", "config-file"]);
    await verify({
      ...input,
      artifactPath: required(options, "artifact-path"),
      repoRoot: root,
      now,
    });
    stdout.write('{"result":"authorization_valid"}\n');
    return 0;
  }

  if (command === "apply") {
    assertNoUnknownOptions(options, ["artifact-path", "config-file"]);
    const result = await apply({
      config,
      authorizationPath: required(options, "artifact-path"),
      repoRoot: root,
      now,
    });
    stdout.write(
      `${JSON.stringify({
        result: "production_web_shadow_canary_deployed",
        candidate_sha: result.candidateSha,
        deployment_id: result.deploymentId,
        operation: result.operation,
      })}\n`
    );
    return 0;
  }

  throw new Error("production_web_shadow_command_invalid");
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !flag?.startsWith("--") ||
      flag.length < 3 ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error("production_web_shadow_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("production_web_shadow_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`production_web_shadow_${name}_required`);
  return value;
}

function assertNoUnknownOptions(options, allowed) {
  const allowlist = new Set(allowed);
  if (Object.keys(options).some((name) => !allowlist.has(name))) {
    throw new Error("production_web_shadow_option_unknown");
  }
}

function usage() {
  return [
    "Vercel Production web Shadow canary action",
    "",
    "Commands:",
    "  write-config --operation enable|disable --source-deployment-id ID --web-candidate-sha SHA --worker-candidate-sha SHA --owner-user-id UUID --run-id SHA256 --expires-at UTC --output-path PATH",
    "  prepare --config-file PATH --output-path PATH [--ttl-minutes 15]",
    "  verify --config-file PATH --artifact-path PATH",
    "  apply --config-file PATH --artifact-path PATH",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVercelProductionWebShadowCanaryCli().catch((error) => {
    const message = error instanceof Error ? error.message : "";
    process.stderr.write(
      `${/^[a-z0-9_]+$/.test(message) ? message : "production_web_shadow_failed"}\n`
    );
    process.exitCode = 1;
  });
}
