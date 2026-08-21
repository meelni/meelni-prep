#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  preparePrivateExternalTarget,
  prepareUnsignedProductionAction,
  verifyExternalProductionAction,
  writePrivateFileCreateOnly,
} from "../lib/operations/production-action-owner-tooling.mjs";
import {
  applyVercelAdaptiveProductionLaunch,
  loadVercelAdaptiveProductionLaunchConfig,
  parseVercelAdaptiveProductionLaunchConfig,
  vercelAdaptiveProductionLaunchAuthorizationInput,
  VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG,
} from "../lib/operations/vercel-adaptive-interviewer-production-launch.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...raw] = process.argv.slice(2);
const options = parseOptions(raw);
const allowedOptions = {
  apply: ["artifact-path", "config-file"],
  prepare: ["config-file", "output-path"],
  verify: ["artifact-path", "config-file"],
  "write-config": [
    "candidate-git-sha",
    "expires-at",
    "operation",
    "output-path",
    "source-deployment-id",
  ],
};

async function main() {
  if (!Object.hasOwn(allowedOptions, command))
    throw new Error("adaptive_production_command_invalid");
  if (
    !Object.keys(options).every((name) =>
      allowedOptions[command].includes(name)
    )
  )
    throw new Error("adaptive_production_options_invalid");
  if (command === "write-config") {
    const config = parseVercelAdaptiveProductionLaunchConfig(
      JSON.stringify({
        candidate_git_sha: required("candidate-git-sha"),
        configuration_sha256:
          "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423",
        contract: VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG,
        expires_at: required("expires-at"),
        operation: required("operation"),
        source_deployment_id: required("source-deployment-id"),
      })
    );
    const target = await preparePrivateExternalTarget(
      required("output-path"),
      repoRoot,
      "adaptive_production_config_file"
    );
    await writePrivateFileCreateOnly(
      target,
      `${JSON.stringify(config, null, 2)}\n`
    );
    process.stdout.write('{"result":"configuration_written"}\n');
    return;
  }
  const config = await loadVercelAdaptiveProductionLaunchConfig({
    configPath: required("config-file"),
    repoRoot,
    now: new Date(),
  });
  const input = vercelAdaptiveProductionLaunchAuthorizationInput(config);
  if (command === "prepare") {
    await prepareUnsignedProductionAction({
      ...input,
      ownerLaunchDecision: "GO",
      outputPath: required("output-path"),
      repoRoot,
      now: new Date(),
      ttlMs: 15 * 60_000,
    });
    process.stdout.write('{"result":"unsigned_payload_written"}\n');
    return;
  }
  if (command === "verify") {
    await verifyExternalProductionAction({
      ...input,
      artifactPath: required("artifact-path"),
      repoRoot,
      now: new Date(),
    });
    process.stdout.write('{"result":"authorization_valid"}\n');
    return;
  }
  if (command === "apply") {
    const result = await applyVercelAdaptiveProductionLaunch({
      config,
      authorizationPath: required("artifact-path"),
      repoRoot,
      now: new Date(),
    });
    process.stdout.write(
      `${JSON.stringify({ result: "adaptive_interviewer_production_deployed", candidate_sha: result.candidateSha, deployment_id: result.deploymentId, operation: result.operation })}\n`
    );
    return;
  }
}
function required(name) {
  const value = options[name];
  if (!value) throw new Error(`adaptive_production_${name}_required`);
  return value;
}
function parseOptions(values) {
  if (values.length % 2 !== 0) {
    throw new Error("adaptive_production_options_invalid");
  }
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (
      !/^--[a-z0-9-]+$/u.test(flag ?? "") ||
      !value ||
      value.startsWith("--") ||
      Object.hasOwn(parsed, flag.slice(2))
    ) {
      throw new Error("adaptive_production_options_invalid");
    }
    parsed[flag.slice(2)] = value;
  }
  return parsed;
}
main().catch((error) => {
  const message =
    error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
      ? error.message
      : "adaptive_production_failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
