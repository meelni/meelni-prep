#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  consumeProductionActionAuthorization,
  sha256,
} from "../lib/operations/production-action-authorization.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configurationSha256 = args.configurationFile
    ? sha256(await readFile(resolve(args.configurationFile)))
    : args.configurationSha256;
  const targetFingerprint = args.targetMaterial
    ? sha256(args.targetMaterial)
    : args.targetFingerprint;
  if (!configurationSha256) {
    throw new Error("configuration_fingerprint_required");
  }
  if (!targetFingerprint) throw new Error("target_fingerprint_required");
  const result = await consumeProductionActionAuthorization({
    authorizationPath: process.env.MEELNI_PRODUCTION_ACTION_AUTHORIZATION,
    repoRoot,
    expected: {
      action: args.action,
      provider: args.provider,
      configurationSha256,
      targetFingerprint,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      contract: "meelni.production-action-consumption-receipt.v1",
      authorizationId: result.authorizationId,
      action: result.action,
      candidateSha: result.candidateSha,
      artifactSha256: result.artifactSha256,
    })}\n`
  );
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("production_action_arguments_invalid");
    }
    if (values.has(key)) throw new Error("production_action_arguments_invalid");
    values.set(key, value);
  }
  const accepted = new Set([
    "--action",
    "--provider",
    "--configuration-file",
    "--configuration-sha256",
    "--target-fingerprint",
    "--target-material",
  ]);
  if ([...values.keys()].some((key) => !accepted.has(key))) {
    throw new Error("production_action_arguments_invalid");
  }
  if (
    !values.get("--action") ||
    !values.get("--provider") ||
    Boolean(values.get("--configuration-file")) ===
      Boolean(values.get("--configuration-sha256")) ||
    Boolean(values.get("--target-fingerprint")) ===
      Boolean(values.get("--target-material"))
  ) {
    throw new Error("production_action_arguments_invalid");
  }
  return {
    action: values.get("--action"),
    provider: values.get("--provider"),
    configurationFile: values.get("--configuration-file"),
    configurationSha256: values.get("--configuration-sha256"),
    targetFingerprint: values.get("--target-fingerprint"),
    targetMaterial: values.get("--target-material"),
  };
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "production_action_denied"
  );
  process.exitCode = 1;
});
