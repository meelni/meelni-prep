#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  createProductionActionOwnerSigningKey,
  DEFAULT_EXECUTOR_IDENTITY_PATH,
  DEFAULT_OWNER_PRIVATE_KEY_PATH,
  enrollProductionActionOwner,
  inspectProductionActionOwnerPublicEntry,
  prepareUnsignedProductionAction,
  runSyntheticProductionActionDryRun,
  signProductionActionPayload,
  verifyExternalProductionAction,
} from "../lib/operations/production-action-owner-tooling.mjs";

export async function runProductionActionOwnerCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  repoRoot = process.cwd(),
} = {}) {
  const [command, ...rawOptions] = argv;
  if (!command || command === "help" || command === "--help") {
    stdout.write(usage());
    return 0;
  }
  const options = parseOptions(rawOptions);

  if (command === "enroll") {
    assertNoUnknownOptions(options, [
      "executor-id-path",
      "key-id",
      "not-after",
      "not-before",
      "private-key-path",
    ]);
    const result = await enrollProductionActionOwner({
      keyId: required(options, "key-id"),
      notBefore: required(options, "not-before"),
      notAfter: required(options, "not-after"),
      privateKeyPath:
        options["private-key-path"] ?? DEFAULT_OWNER_PRIVATE_KEY_PATH,
      executorIdentityPath:
        options["executor-id-path"] ?? DEFAULT_EXECUTOR_IDENTITY_PATH,
      repoRoot,
    });
    // Enrollment is the only command that emits material, and that material is
    // the public registry entry intended for reviewed source control.
    stdout.write(`${JSON.stringify(result.publicRegistryEntry, null, 2)}\n`);
    return 0;
  }

  if (command === "rotate-key") {
    assertNoUnknownOptions(options, [
      "key-id",
      "not-after",
      "not-before",
      "private-key-path",
    ]);
    const result = await createProductionActionOwnerSigningKey({
      keyId: required(options, "key-id"),
      notBefore: required(options, "not-before"),
      notAfter: required(options, "not-after"),
      privateKeyPath: required(options, "private-key-path"),
      repoRoot,
    });
    stdout.write(`${JSON.stringify(result.publicRegistryEntry, null, 2)}\n`);
    return 0;
  }

  if (command === "public-entry") {
    assertNoUnknownOptions(options, [
      "key-id",
      "not-after",
      "not-before",
      "private-key-path",
    ]);
    const result = await inspectProductionActionOwnerPublicEntry({
      keyId: required(options, "key-id"),
      notBefore: required(options, "not-before"),
      notAfter: required(options, "not-after"),
      privateKeyPath:
        options["private-key-path"] ?? DEFAULT_OWNER_PRIVATE_KEY_PATH,
      repoRoot,
    });
    stdout.write(`${JSON.stringify(result.publicRegistryEntry, null, 2)}\n`);
    return 0;
  }

  if (command === "prepare") {
    assertNoUnknownOptions(options, [
      "action",
      "configuration-sha256",
      "executor-id-path",
      "output-path",
      "target-fingerprint",
      "ttl-minutes",
    ]);
    const ttlMinutes = options["ttl-minutes"]
      ? Number(options["ttl-minutes"])
      : 15;
    if (!Number.isSafeInteger(ttlMinutes)) {
      throw new Error("authorization_ttl_invalid");
    }
    await prepareUnsignedProductionAction({
      action: required(options, "action"),
      configurationSha256: required(options, "configuration-sha256"),
      targetFingerprint: required(options, "target-fingerprint"),
      outputPath: required(options, "output-path"),
      executorIdentityPath:
        options["executor-id-path"] ?? DEFAULT_EXECUTOR_IDENTITY_PATH,
      repoRoot,
      ttlMs: ttlMinutes * 60 * 1_000,
    });
    stdout.write('{"result":"unsigned_payload_written"}\n');
    return 0;
  }

  if (command === "sign") {
    assertNoUnknownOptions(options, [
      "artifact-path",
      "key-id",
      "key-registry-path",
      "payload-path",
      "private-key-path",
    ]);
    await signProductionActionPayload({
      payloadPath: required(options, "payload-path"),
      privateKeyPath:
        options["private-key-path"] ?? DEFAULT_OWNER_PRIVATE_KEY_PATH,
      artifactPath: required(options, "artifact-path"),
      keyId: required(options, "key-id"),
      keyRegistryPath:
        options["key-registry-path"] ??
        join(repoRoot, "config", "production-action-owner-keys.json"),
      repoRoot,
    });
    stdout.write('{"result":"signed_artifact_written"}\n');
    return 0;
  }

  if (command === "verify") {
    assertNoUnknownOptions(options, [
      "action",
      "artifact-path",
      "configuration-sha256",
      "executor-id-path",
      "key-registry-path",
      "target-fingerprint",
    ]);
    await verifyExternalProductionAction({
      artifactPath: required(options, "artifact-path"),
      action: required(options, "action"),
      configurationSha256: required(options, "configuration-sha256"),
      targetFingerprint: required(options, "target-fingerprint"),
      executorIdentityPath:
        options["executor-id-path"] ?? DEFAULT_EXECUTOR_IDENTITY_PATH,
      keyRegistryPath:
        options["key-registry-path"] ??
        join(repoRoot, "config", "production-action-owner-keys.json"),
      repoRoot,
    });
    stdout.write('{"result":"authorization_valid"}\n');
    return 0;
  }

  if (command === "synthetic-dry-run") {
    assertNoUnknownOptions(options, []);
    const proof = await runSyntheticProductionActionDryRun({ repoRoot });
    stdout.write(`${JSON.stringify(proof)}\n`);
    return 0;
  }

  stderr.write("production_action_owner_command_invalid\n");
  return 1;
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
      throw new Error("production_action_owner_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("production_action_owner_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`production_action_owner_${name}_required`);
  return value;
}

function assertNoUnknownOptions(options, allowed) {
  const allowlist = new Set(allowed);
  if (Object.keys(options).some((name) => !allowlist.has(name))) {
    throw new Error("production_action_owner_option_unknown");
  }
}

function usage() {
  return [
    "Production action owner tooling (provider-free)",
    "",
    "Commands:",
    "  enroll --key-id ID --not-before ISO --not-after ISO [private paths]",
    "  rotate-key --key-id ID --not-before ISO --not-after ISO --private-key-path PATH",
    "  public-entry --key-id ID --not-before ISO --not-after ISO [private key path]",
    "  prepare --action ACTION --configuration-sha256 HASH --target-fingerprint HASH --output-path PATH",
    "  sign --payload-path PATH --artifact-path PATH --key-id ID [private key path]",
    "  verify --artifact-path PATH --action ACTION --configuration-sha256 HASH --target-fingerprint HASH",
    "  synthetic-dry-run",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runProductionActionOwnerCli()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      // Stable codes only. Never include paths, payloads, signatures, keys, or
      // executor material in command failures.
      process.stderr.write(`${safeErrorCode(error)}\n`);
      process.exitCode = 1;
    });
}

function safeErrorCode(error) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message)
    ? message
    : "production_action_owner_failed";
}
