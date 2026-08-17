import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SAFE_PARENT_ENV_KEYS = [
  "CI",
  "DEBUG",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
];

export const FEEDBACK_LAB_ARTIFACT_DIRECTORY = join(
  "tests",
  "browser",
  "harness",
  "generated-feedback"
);

export function createFeedbackLabEnvironment(
  parentEnvironment = process.env,
  repoRoot = REPO_ROOT
) {
  const environment = {};
  for (const key of SAFE_PARENT_ENV_KEYS) {
    const value = parentEnvironment[key];
    if (typeof value === "string" && value.length > 0) {
      environment[key] = value;
    }
  }

  const egressGuard = pathToFileURL(
    join(repoRoot, "tests/browser/support/block-server-egress.mjs")
  ).href;
  return {
    ...environment,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "test",
    NODE_OPTIONS: `--import=${egressGuard}`,
  };
}

export function feedbackLabGenerationCommand(repoRoot = REPO_ROOT) {
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [
      "run",
      "feedback:synthetic",
      "--",
      "run",
      "--all",
      "--output",
      relative(repoRoot, join(repoRoot, FEEDBACK_LAB_ARTIFACT_DIRECTORY)),
    ],
  };
}

function runChild(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Feedback Lab child exited from signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

export async function prepareFeedbackLabArtifacts({
  repoRoot = REPO_ROOT,
  environment = createFeedbackLabEnvironment(process.env, repoRoot),
} = {}) {
  const artifactDirectory = join(repoRoot, FEEDBACK_LAB_ARTIFACT_DIRECTORY);
  await rm(artifactDirectory, { force: true, recursive: true });
  await mkdir(artifactDirectory, { recursive: true });

  const generation = feedbackLabGenerationCommand(repoRoot);
  const status = await runChild(generation.command, generation.args, {
    cwd: repoRoot,
    env: environment,
    stdio: "inherit",
  });
  if (status !== 0) {
    throw new Error(`Synthetic feedback generation exited with ${status}`);
  }
  return artifactDirectory;
}

export async function startFeedbackLab() {
  const environment = createFeedbackLabEnvironment();
  await prepareFeedbackLabArtifacts({ environment });

  const url = "http://127.0.0.1:4173/?scenario=feedback-lab";
  console.log(`Feedback Lab ready at ${url}`);
  const status = await runChild(
    process.execPath,
    [
      "node_modules/vitest/node_modules/vite/bin/vite.js",
      "--config",
      "tests/browser/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
      "--strictPort",
    ],
    { cwd: REPO_ROOT, env: environment, stdio: "inherit" }
  );
  process.exitCode = status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await startFeedbackLab();
}
