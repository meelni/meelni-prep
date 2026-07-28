import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { snapshotLiveKitProductionDeploySource } from "../lib/operations/livekit-production-deploy-source.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const { candidateSha } = await snapshotLiveKitProductionDeploySource({
    outputDirectory: required(options, "output-directory"),
    receiptFile: required(options, "receipt-file"),
    repoRoot,
  });
  process.stdout.write(`${candidateSha}\n`);
}

function parseOptions(argv) {
  if (argv.length !== 4) {
    throw new Error("livekit_deploy_source_options_invalid");
  }
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !flag?.startsWith("--") ||
      !value ||
      value.startsWith("--") ||
      Object.hasOwn(options, flag.slice(2))
    ) {
      throw new Error("livekit_deploy_source_options_invalid");
    }
    options[flag.slice(2)] = value;
  }
  if (
    Object.keys(options).some(
      (name) => !["output-directory", "receipt-file"].includes(name)
    )
  ) {
    throw new Error("livekit_deploy_source_options_invalid");
  }
  return options;
}

function required(options, name) {
  const value = options[name];
  if (!value) throw new Error(`livekit_deploy_source_${name}_required`);
  return value;
}

function safeErrorCode(error) {
  const message = error instanceof Error ? error.message : "";
  return /^[a-z0-9_]+$/.test(message)
    ? message
    : "livekit_deploy_source_failed";
}

main().catch((error) => {
  process.stderr.write(`${safeErrorCode(error)}\n`);
  process.exitCode = 1;
});
