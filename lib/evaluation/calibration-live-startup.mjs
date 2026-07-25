import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const CALIBRATION_LIVE_NODE_VERSION = "22.22.0";
export const CALIBRATION_LIVE_BOOTSTRAP_READY = "MEELNI_CALIBRATION_READY_V1";
export const CALIBRATION_LIVE_RUNTIME_READY =
  "MEELNI_CALIBRATION_RUNTIME_READY_V1";
const CALIBRATION_LIVE_MAX_CREDENTIAL_BYTES = 16_384;
export const CALIBRATION_LIVE_RUNTIME_EXEC_ARGV = Object.freeze([]);
export const CALIBRATION_RUNTIME_BUNDLE_PATH =
  "scripts/generated/run-evaluation-calibration.bundle.mjs";
export const CALIBRATION_RUNTIME_MANIFEST_PATH =
  "docs/evidence/sav-248-v18-runtime-manifest.json";
export const CALIBRATION_RUNTIME_BUILD_CONTRACT_SHA256 =
  "f245d2fb3bfd63a1d2fcd9ccc8ca4b8617a78ba2a7b74214a42a1dfedd6cfbae";
export const CALIBRATION_RUNTIME_ESBUILD_VERSION = "0.25.12";
export const CALIBRATION_RUNTIME_INPUT_COUNT = 372;
export const CALIBRATION_RUNTIME_EXTERNAL_IMPORTS = Object.freeze([
  "crypto",
  "fs",
  "net",
  "node:child_process",
  "node:crypto",
  "node:fs",
  "node:fs/promises",
  "node:https",
  "node:path",
  "node:readline",
  "node:tls",
  "node:url",
  "os",
  "path",
  "perf_hooks",
  "stream",
  "tls",
]);

export const CALIBRATION_LIVE_DISALLOWED_ENV = Object.freeze([
  "GH_CONFIG_DIR",
  "GH_HTTP_UNIX_SOCKET",
  "GH_HOST",
  "GITHUB_API_URL",
  "GITHUB_GRAPHQL_URL",
  "GITHUB_SERVER_URL",
  "OPENAI_BASE_URL",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "NODE_DEBUG",
  "NODE_DEBUG_NATIVE",
  "NODE_EXTRA_CA_CERTS",
  "NODE_OPTIONS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_USE_ENV_PROXY",
  "NODE_USE_SYSTEM_CA",
  "NODE_V8_COVERAGE",
  "OPENSSL_CONF",
  "SSLKEYLOGFILE",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);

/**
 * @param {{
 *   env?: Record<string, string | undefined>;
 *   execArgv?: string[];
 *   releaseName?: string;
 *   nodeVersion?: string;
 *   invocation?: "bootstrap" | "runtime";
 * }} [options]
 */
export function assertCalibrationLiveStartupState({
  env = process.env,
  execArgv = process.execArgv,
  releaseName = process.release.name,
  nodeVersion = process.versions.node,
  invocation = "runtime",
} = {}) {
  if (releaseName !== "node" || nodeVersion !== CALIBRATION_LIVE_NODE_VERSION) {
    throw new Error("calibration_live_startup_runtime_rejected");
  }
  const expectedExecArgv =
    invocation === "bootstrap"
      ? []
      : invocation === "runtime"
        ? CALIBRATION_LIVE_RUNTIME_EXEC_ARGV
        : null;
  if (
    expectedExecArgv === null ||
    !Array.isArray(execArgv) ||
    execArgv.length !== expectedExecArgv.length ||
    execArgv.some((value, index) => value !== expectedExecArgv[index])
  ) {
    throw new Error("calibration_live_startup_exec_argv_rejected");
  }
  for (const name of CALIBRATION_LIVE_DISALLOWED_ENV) {
    if (env[name] !== undefined) {
      throw new Error(`calibration_live_startup_env_${name}_rejected`);
    }
  }
}

export function assertCalibrationRuntimeArtifact({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  manifest: suppliedManifest,
  platform = process.platform,
  architecture = process.arch,
  nodeVersion = process.versions.node,
} = {}) {
  const canonicalRoot = realpathSync(repositoryRoot);
  const manifestPath = join(canonicalRoot, CALIBRATION_RUNTIME_MANIFEST_PATH);
  const manifestMetadata = suppliedManifest ? null : lstatSync(manifestPath);
  const manifest = parseCalibrationRuntimeManifest(
    suppliedManifest ?? JSON.parse(readFileSync(manifestPath, "utf8"))
  );
  const packageLockPath = join(canonicalRoot, "package-lock.json");
  const packageLockMetadata = lstatSync(packageLockPath);
  const bundlePath = join(canonicalRoot, CALIBRATION_RUNTIME_BUNDLE_PATH);
  const bundleMetadata = lstatSync(bundlePath);
  if (
    (manifestMetadata !== null && !isTrustedRegularFile(manifestMetadata)) ||
    manifest.nodeVersion !== nodeVersion ||
    manifest.platform !== platform ||
    manifest.architecture !== architecture ||
    manifest.bundlePath !== CALIBRATION_RUNTIME_BUNDLE_PATH ||
    !isTrustedRegularFile(packageLockMetadata) ||
    sha256(readFileSync(packageLockPath)) !== manifest.packageLockSha256 ||
    !isTrustedRegularFile(bundleMetadata) ||
    realpathSync(bundlePath) !== bundlePath ||
    bundleMetadata.size !== manifest.bundleBytes
  ) {
    throw new Error("calibration_runtime_artifact_rejected");
  }
  const bundle = readFileSync(bundlePath);
  if (sha256(bundle) !== manifest.bundleSha256) {
    throw new Error("calibration_runtime_artifact_rejected");
  }
  return bundlePath;
}

export function parseCalibrationRuntimeManifest(value) {
  const keys = [
    "architecture",
    "buildContractSha256",
    "bundleBytes",
    "bundlePath",
    "bundleSha256",
    "contractVersion",
    "esbuildVersion",
    "externalImports",
    "inputCount",
    "nodeVersion",
    "packageLockSha256",
    "platform",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys) ||
    value.contractVersion !== "evaluation-calibration-runtime-artifact.v1" ||
    value.nodeVersion !== CALIBRATION_LIVE_NODE_VERSION ||
    value.platform !== "darwin" ||
    value.architecture !== "arm64" ||
    value.bundlePath !== CALIBRATION_RUNTIME_BUNDLE_PATH ||
    !/^[a-f0-9]{64}$/.test(value.packageLockSha256) ||
    value.buildContractSha256 !== CALIBRATION_RUNTIME_BUILD_CONTRACT_SHA256 ||
    !/^[a-f0-9]{64}$/.test(value.bundleSha256) ||
    value.esbuildVersion !== CALIBRATION_RUNTIME_ESBUILD_VERSION ||
    !Number.isSafeInteger(value.bundleBytes) ||
    value.bundleBytes <= 0 ||
    value.inputCount !== CALIBRATION_RUNTIME_INPUT_COUNT ||
    !Array.isArray(value.externalImports) ||
    JSON.stringify(value.externalImports) !==
      JSON.stringify(CALIBRATION_RUNTIME_EXTERNAL_IMPORTS)
  ) {
    throw new Error("calibration_runtime_manifest_rejected");
  }
  return Object.freeze({
    ...value,
    externalImports: [...value.externalImports],
  });
}

function isTrustedRegularFile(metadata) {
  return (
    metadata.isFile() &&
    !metadata.isSymbolicLink() &&
    metadata.uid === process.getuid() &&
    metadata.nlink === 1 &&
    (metadata.mode & 0o022) === 0
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readCalibrationLiveCredentials(
  stream,
  timeoutMs = 10_000
) {
  const lines = [];
  let size = 0;
  const input = createInterface({ input: stream, crlfDelay: Infinity });
  const timer = setTimeout(
    () => stream.destroy(new Error("calibration_live_credentials_timeout")),
    timeoutMs
  );
  try {
    for await (const line of input) {
      size += Buffer.byteLength(line) + 1;
      if (size > CALIBRATION_LIVE_MAX_CREDENTIAL_BYTES) {
        throw new Error("calibration_live_credentials_too_large");
      }
      lines.push(line);
      if (lines.length === 3) break;
    }
  } finally {
    clearTimeout(timer);
    input.close();
    stream.pause();
  }
  const [githubToken, openaiKey, acknowledgement] = lines;
  if (
    lines.length !== 3 ||
    !/^(?:gh[opusr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})$/.test(
      githubToken ?? ""
    ) ||
    !/^sk-[A-Za-z0-9_-]{8,}$/.test(openaiKey ?? "") ||
    !acknowledgement
  ) {
    throw new Error("calibration_live_credentials_invalid");
  }
  return Object.freeze({ githubToken, openaiKey, acknowledgement });
}
