import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const CALIBRATION_LIVE_NODE_VERSION = "22.22.0";
export const CALIBRATION_LIVE_TSX_VERSION = "4.23.0";
export const CALIBRATION_LIVE_BOOTSTRAP_READY = "MEELNI_CALIBRATION_READY_V1";
export const CALIBRATION_LIVE_RUNTIME_READY =
  "MEELNI_CALIBRATION_RUNTIME_READY_V1";
const CALIBRATION_LIVE_MAX_CREDENTIAL_BYTES = 16_384;
export const CALIBRATION_LIVE_RUNTIME_EXEC_ARGV = Object.freeze([
  "--require",
  require.resolve("tsx/preflight"),
  "--import",
  pathToFileURL(require.resolve("tsx")).href,
]);

const installedTsxVersion = require("tsx/package.json").version;

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
  if (
    releaseName !== "node" ||
    nodeVersion !== CALIBRATION_LIVE_NODE_VERSION ||
    installedTsxVersion !== CALIBRATION_LIVE_TSX_VERSION
  ) {
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

export async function readCalibrationLiveCredentials(stream) {
  const lines = [];
  let size = 0;
  const input = createInterface({ input: stream, crlfDelay: Infinity });
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
