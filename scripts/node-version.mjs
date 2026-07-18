import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parsePinnedNodeVersion(contents) {
  if (typeof contents !== "string" || !contents.endsWith("\n")) {
    throw new Error("node_version_policy_invalid");
  }

  const version = contents.slice(0, -1);
  if (!VERSION_PATTERN.test(version) || contents !== `${version}\n`) {
    throw new Error("node_version_policy_invalid");
  }

  return version;
}

export function readPinnedNodeVersion(root = repoRoot) {
  return parsePinnedNodeVersion(
    readFileSync(resolve(root, ".node-version"), "utf8")
  );
}

export function evaluateNodeVersion({ actualVersion, requiredVersion }) {
  const normalizedActual =
    typeof actualVersion === "string" && actualVersion.startsWith("v")
      ? actualVersion.slice(1)
      : actualVersion;

  return {
    actualVersion: normalizedActual,
    requiredVersion,
    matches:
      typeof normalizedActual === "string" &&
      VERSION_PATTERN.test(normalizedActual) &&
      normalizedActual === requiredVersion,
  };
}

export function nodeVersionRecoveryCommand(requiredVersion) {
  return `fnm install ${requiredVersion} && fnm use ${requiredVersion}`;
}

export function assertPinnedNodeVersion({
  actualVersion = process.version,
  requiredVersion = readPinnedNodeVersion(),
} = {}) {
  const result = evaluateNodeVersion({ actualVersion, requiredVersion });
  if (!result.matches) {
    const actual = result.actualVersion || "unknown";
    throw new Error(
      `Node ${actual} does not match required ${requiredVersion}. Run \`${nodeVersionRecoveryCommand(requiredVersion)}\`, then retry.`
    );
  }

  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = assertPinnedNodeVersion();
    console.log(
      `Node ${result.actualVersion} matches required ${result.requiredVersion}.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
