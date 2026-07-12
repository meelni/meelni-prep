import { spawn } from "node:child_process";
import { createWriteStream, lstatSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = realpathSync(dirname(fileURLToPath(import.meta.url)));
const startupPath = attestFile(
  realpathSync(
    join(scriptDirectory, "../lib/evaluation/calibration-live-startup.mjs")
  )
);
const startup = await import(pathToFileURL(startupPath).href);
const {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_BOOTSTRAP_READY,
  CALIBRATION_LIVE_RUNTIME_READY,
  CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
  readCalibrationLiveCredentials,
} = startup;

assertCalibrationLiveStartupState({ invocation: "bootstrap" });

const status = createWriteStream(null, { fd: 3, autoClose: true });
status.end(`${CALIBRATION_LIVE_BOOTSTRAP_READY}\n`);

const { githubToken, openaiKey, acknowledgement } =
  await readCalibrationLiveCredentials(process.stdin);

const testRuntime = process.env.MEELNI_CALIBRATION_TEST_RUNTIME;
const runtimePath = attestFile(
  realpathSync(
    testRuntime || join(scriptDirectory, "run-evaluation-calibration.ts")
  )
);
let child;
let exitPromise;
let cleanupPromise;
let requestedExitCode;

for (const [signal, code] of [
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.on(signal, () => {
    requestedExitCode ??= code;
    void terminateChild().finally(() => process.exit(requestedExitCode));
  });
}

try {
  child = spawn(
    process.execPath,
    [
      ...CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
      runtimePath,
      "--mode",
      "live",
      ...process.argv.slice(2),
    ],
    {
      env: {
        OPENAI_FEEDBACK_MODEL: "gpt-5.1-2025-11-13",
        MEELNI_ALLOW_PAID_CALIBRATION: acknowledgement,
      },
      stdio: ["ignore", "inherit", "inherit", "pipe", "pipe"],
    }
  );
  exitPromise = new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
  const runtimeReadiness = await readOneLine(child.stdio[4], 10_000);
  if (runtimeReadiness !== CALIBRATION_LIVE_RUNTIME_READY) {
    throw new Error("calibration_live_runtime_handshake_invalid");
  }
  child.stdio[3].end(`${githubToken}\n${openaiKey}\n${acknowledgement}\n`);
  process.exitCode = await exitPromise;
} finally {
  await terminateChild();
}

function terminateChild() {
  cleanupPromise ??= terminateChildOnce();
  return cleanupPromise;
}

async function terminateChildOnce() {
  child?.stdio[3]?.destroy();
  child?.stdio[4]?.destroy();
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(2_000)) return;
  child.kill("SIGKILL");
  await waitForExit(2_000);
}

async function waitForExit(timeoutMs) {
  if (!exitPromise) return true;
  return Promise.race([
    exitPromise.then(() => true),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref();
    }),
  ]);
}

async function readOneLine(stream, timeoutMs) {
  const input = createInterface({ input: stream });
  const timer = setTimeout(
    () => stream.destroy(new Error("calibration_live_runtime_ready_timeout")),
    timeoutMs
  );
  try {
    for await (const line of input) return line;
    return null;
  } finally {
    clearTimeout(timer);
    input.close();
    stream.destroy();
  }
}

function attestFile(path) {
  const metadata = lstatSync(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o022) !== 0
  ) {
    throw new Error("calibration_live_bootstrap_file_rejected");
  }
  return path;
}
