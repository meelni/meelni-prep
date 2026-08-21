#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  DEFAULT_PREVIEW_SHADOW_OWNER_KEY_ID,
  preparePreviewShadowOwnerPacket,
  signPreviewShadowOwnerPacket,
  verifyPreviewShadowOwnerPacket,
} from "../lib/operations/adaptive-interviewer-preview-shadow-owner";

const DEFAULT_REGISTRY = join(
  process.cwd(),
  "config",
  "adaptive-interviewer-preview-shadow-owner-keys.json"
);

export async function runPreviewShadowOwnerCli(
  argv = process.argv.slice(2),
  stdout = process.stdout
): Promise<number> {
  const [command, ...rest] = argv;
  const options = parseOptions(rest);
  if (command === "prepare") {
    assertOnly(options, [
      "output-directory",
      "owner-decision-reference",
      "key-id",
      "ttl-minutes",
    ]);
    const ttlMinutes = options["ttl-minutes"]
      ? Number(options["ttl-minutes"])
      : 60;
    const summary = await preparePreviewShadowOwnerPacket({
      outputDirectory: required(options, "output-directory"),
      ownerDecisionReference: required(options, "owner-decision-reference"),
      keyId: options["key-id"] ?? DEFAULT_PREVIEW_SHADOW_OWNER_KEY_ID,
      ttlMs: ttlMinutes * 60 * 1_000,
    });
    stdout.write(`${JSON.stringify({ result: "owner_packet_prepared", ...summary })}\n`);
    return 0;
  }
  if (command === "sign") {
    assertOnly(options, [
      "packet-directory",
      "artifact-path",
      "private-key-path",
      "key-registry-path",
    ]);
    const summary = await signPreviewShadowOwnerPacket({
      packetDirectory: required(options, "packet-directory"),
      artifactPath: required(options, "artifact-path"),
      keyRegistryPath: options["key-registry-path"] ?? DEFAULT_REGISTRY,
      ...(options["private-key-path"]
        ? { privateKeyPath: options["private-key-path"] }
        : {}),
    });
    stdout.write(`${JSON.stringify({ result: "owner_artifact_signed", ...summary })}\n`);
    return 0;
  }
  if (command === "verify") {
    assertOnly(options, [
      "packet-directory",
      "artifact-path",
      "key-registry-path",
    ]);
    const summary = await verifyPreviewShadowOwnerPacket({
      packetDirectory: required(options, "packet-directory"),
      artifactPath: required(options, "artifact-path"),
      keyRegistryPath: options["key-registry-path"] ?? DEFAULT_REGISTRY,
    });
    stdout.write(`${JSON.stringify({ result: "owner_artifact_valid", ...summary })}\n`);
    return 0;
  }
  stdout.write(usage());
  return command ? 1 : 0;
}

function parseOptions(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("preview_shadow_owner_options_invalid");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new Error("preview_shadow_owner_options_invalid");
    }
    options[name] = value;
  }
  return options;
}

function assertOnly(options: Record<string, string>, allowed: string[]): void {
  if (Object.keys(options).some((key) => !allowed.includes(key))) {
    throw new Error("preview_shadow_owner_option_unknown");
  }
}

function required(options: Record<string, string>, name: string): string {
  const value = options[name];
  if (!value) throw new Error(`preview_shadow_owner_${name}_required`);
  return value;
}

function usage(): string {
  return [
    "Preview-shadow owner tooling (provider-free)",
    "",
    "prepare --output-directory PATH --owner-decision-reference REF [--ttl-minutes N]",
    "sign --packet-directory PATH --artifact-path PATH [--private-key-path PATH]",
    "verify --packet-directory PATH --artifact-path PATH",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPreviewShadowOwnerCli()
    .then((status) => {
      process.exitCode = status;
    })
    .catch(() => {
      process.stderr.write("preview_shadow_owner_command_failed\n");
      process.exitCode = 1;
    });
}
