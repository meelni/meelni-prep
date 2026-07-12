import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
} from "../lib/evaluation/calibration-live-startup.mjs";

assertCalibrationLiveStartupState({ invocation: "bootstrap" });

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
  { env: process.env, stdio: "inherit" }
);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    resolve(code ?? (signal ? 128 : 1));
  });
});
process.exitCode = exitCode;
