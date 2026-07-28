#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  prepareUnsignedProductionAction,
  verifyExternalProductionAction,
} from "../lib/operations/production-action-owner-tooling.mjs";
import { resolveCleanGitCandidate } from "../lib/operations/production-action-authorization.mjs";
import { resolveLiveKitProductionInterviewAuthorizationInput } from "../lib/operations/livekit-production-interview-authorization.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runLiveKitProductionInterviewAuthorizationCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  root = repoRoot,
  prepare = prepareUnsignedProductionAction,
  verify = verifyExternalProductionAction,
  resolveCandidate = resolveCleanGitCandidate,
} = {}) {
  const [command, ...rawOptions] = argv;
  if (!command || command === "help" || command === "--help") {
    stdout.write(usage());
    return 0;
  }
  const options = parseOptions(rawOptions);
  const expectedCandidateSha = required(options, "expected-candidate-sha");
  if (!/^[a-f0-9]{40}$/.test(expectedCandidateSha)) {
    throw new Error("livekit_production_candidate_invalid");
  }
  const resolveExpectedCandidate = async (canonicalRoot) => {
    const candidateSha = await resolveCandidate(canonicalRoot);
    if (candidateSha !== expectedCandidateSha) {
      throw new Error("livekit_production_candidate_mismatch");
    }
    return candidateSha;
  };
  const input = await resolveLiveKitProductionInterviewAuthorizationInput({
    configFile: required(options, "config-file"),
    secretsFile: required(options, "secrets-file"),
    repoRoot: root,
  });

  if (command === "prepare") {
    assertNoUnknownOptions(options, [
      "config-file",
      "expected-candidate-sha",
      "output-path",
      "secrets-file",
      "ttl-minutes",
    ]);
    const ttlMinutes = options["ttl-minutes"]
      ? Number(options["ttl-minutes"])
      : 15;
    if (!Number.isSafeInteger(ttlMinutes)) {
      throw new Error("authorization_ttl_invalid");
    }
    await prepare({
      ...input,
      outputPath: required(options, "output-path"),
      repoRoot: root,
      resolveCandidate: resolveExpectedCandidate,
      ttlMs: ttlMinutes * 60 * 1_000,
    });
    stdout.write('{"result":"unsigned_payload_written"}\n');
    return 0;
  }

  if (command === "verify") {
    assertNoUnknownOptions(options, [
      "artifact-path",
      "config-file",
      "expected-candidate-sha",
      "secrets-file",
    ]);
    await verify({
      ...input,
      artifactPath: required(options, "artifact-path"),
      repoRoot: root,
      resolveCandidate: resolveExpectedCandidate,
    });
    stdout.write('{"result":"authorization_valid"}\n');
    return 0;
  }

  stderr.write("livekit_production_authorization_command_invalid\n");
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
      throw new Error("livekit_production_authorization_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("livekit_production_authorization_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`livekit_production_authorization_${name}_required`);
  }
  return value;
}

function assertNoUnknownOptions(options, allowed) {
  const allowlist = new Set(allowed);
  if (Object.keys(options).some((name) => !allowlist.has(name))) {
    throw new Error("livekit_production_authorization_option_unknown");
  }
}

function usage() {
  return [
    "LiveKit Production interview authorization preparation (provider-free)",
    "",
    "Commands:",
    "  prepare --expected-candidate-sha SHA --config-file PATH --secrets-file PATH --output-path PATH [--ttl-minutes 15]",
    "  verify --expected-candidate-sha SHA --config-file PATH --secrets-file PATH --artifact-path PATH",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLiveKitProductionInterviewAuthorizationCli()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`${safeErrorCode(error)}\n`);
      process.exitCode = 1;
    });
}

function safeErrorCode(error) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message)
    ? message
    : "livekit_production_authorization_failed";
}
