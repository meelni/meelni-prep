import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_BOOTSTRAP_READY,
  CALIBRATION_LIVE_RUNTIME_READY,
  CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
  readCalibrationLiveCredentials,
} from "../lib/evaluation/calibration-live-startup.mjs";

assertCalibrationLiveStartupState({ invocation: "bootstrap" });

const status = await import("node:fs").then(({ createWriteStream }) =>
  createWriteStream(null, { fd: 3, autoClose: true })
);
status.end(`${CALIBRATION_LIVE_BOOTSTRAP_READY}\n`);

const { githubToken, openaiKey, acknowledgement } =
  await readCalibrationLiveCredentials(process.stdin);

const { spawn } = await import("node:child_process");
const child = spawn(
  process.execPath,
  [
    ...CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
    new URL("./run-evaluation-calibration.ts", import.meta.url).pathname,
    "--mode",
    "live",
    ...process.argv.slice(2),
  ],
  {
    env: {
      OPENAI_FEEDBACK_MODEL: "gpt-5.1-2025-11-13",
      MEELNI_ALLOW_PAID_CALIBRATION: acknowledgement,
    },
    stdio: ["inherit", "inherit", "inherit", "pipe", "pipe"],
  }
);
const runtimeReadiness = await readOneLine(child.stdio[4], 10_000);
if (runtimeReadiness !== CALIBRATION_LIVE_RUNTIME_READY) {
  child.kill();
  throw new Error("calibration_live_runtime_handshake_invalid");
}
child.stdio[3].end(`${githubToken}\n${openaiKey}\n${acknowledgement}\n`);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    resolve(code ?? (signal ? 128 : 1));
  });
});
process.exitCode = exitCode;

async function readOneLine(stream, timeoutMs) {
  const { createInterface } = await import("node:readline");
  const input = createInterface({ input: stream });
  const timer = setTimeout(() => input.close(), timeoutMs);
  try {
    for await (const line of input) return line;
    return null;
  } finally {
    clearTimeout(timer);
    input.close();
  }
}
