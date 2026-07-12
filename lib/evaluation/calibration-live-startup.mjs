import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const CALIBRATION_LIVE_NODE_MAJOR = 22;
export const CALIBRATION_LIVE_TSX_VERSION = "4.23.0";
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
    nodeMajor(nodeVersion) !== CALIBRATION_LIVE_NODE_MAJOR ||
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

function nodeMajor(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
    return Number.NaN;
  }
  return Number(version.split(".", 1)[0]);
}
