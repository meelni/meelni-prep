import { spawn } from "node:child_process";
import { lstat, mkdir } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createSyntheticFeedbackScenarios } from "@meelni/test-fixtures/synthetic-feedback";

import {
  createSyntheticFeedbackBundle,
  type SyntheticFeedbackWorkerEnvironment,
} from "@/lib/workflows/synthetic-feedback-runner";

const DEFAULT_OUTPUT_DIRECTORY = ".artifacts/synthetic-feedback/v1";
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLISHER_WORKER_PATH = fileURLToPath(
  new URL("./synthetic-feedback-publisher-worker.mjs", import.meta.url)
);

export async function runSyntheticFeedbackCli(
  args: readonly string[],
  io: {
    cwd: string;
    writeOut(value: string): void;
    writeError(value: string): void;
  }
): Promise<number> {
  try {
    const command = args[0];
    if (command === "list") {
      if (args.length !== 1) throw usageError();
      const rows = createSyntheticFeedbackScenarios().map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        expectedOutcome: scenario.expectedOutcome,
        stages: scenario.expectedStages,
      }));
      io.writeOut(`${JSON.stringify(rows, null, 2)}\n`);
      return 0;
    }
    if (command !== "run") throw usageError();

    const parsed = parseRunArguments(args.slice(1));
    const outputDirectory = resolve(
      io.cwd,
      parsed.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY
    );
    if (outputDirectory === parse(outputDirectory).root) {
      throw new Error("synthetic_feedback_output_cannot_be_filesystem_root");
    }

    const workerEnvironment = createSyntheticFeedbackWorkerEnvironment();
    const bundle = await createSyntheticFeedbackBundle(parsed.scenarioIds, {
      workerEnvironment,
    });
    await publishSyntheticFeedbackFiles(
      outputDirectory,
      [
        ...bundle.artifacts.map((entry) => ({
          name: entry.artifactFile,
          content: entry.artifactJson,
        })),
        { name: "manifest.json", content: bundle.manifestJson },
      ].sort((left, right) => left.name.localeCompare(right.name))
    );
    io.writeOut(
      `${JSON.stringify(
        {
          outputDirectory,
          scenarios: bundle.manifest.artifacts.map((entry) => ({
            id: entry.scenarioId,
            expectedOutcome: entry.expectedOutcome,
            artifactFile: entry.artifactFile,
            artifactSha256: entry.artifactSha256,
          })),
          manifestFile: "manifest.json",
        },
        null,
        2
      )}\n`
    );
    return 0;
  } catch (error) {
    io.writeError(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }
}

export async function publishSyntheticFeedbackFiles(
  outputDirectory: string,
  files: readonly { name: string; content: string }[],
  hooks: {
    beforeOutputClaim?(): Promise<void>;
    afterExistingOutputReady?(): Promise<void>;
    afterPublisherReady?(): Promise<void>;
  } = {}
): Promise<void> {
  try {
    if (
      await existingOutputMatches(
        outputDirectory,
        files,
        hooks.afterExistingOutputReady
      )
    ) {
      return;
    }
    const parentDirectory = dirname(outputDirectory);
    await mkdir(parentDirectory, { recursive: true });
    await hooks.beforeOutputClaim?.();
    try {
      await mkdir(outputDirectory, { mode: 0o700 });
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        if (
          await existingOutputMatches(
            outputDirectory,
            files,
            hooks.afterExistingOutputReady
          )
        ) {
          return;
        }
        throw new Error("synthetic_feedback_output_conflict");
      }
      throw error;
    }
    const claimedDirectory = await readDirectoryIdentity(outputDirectory);
    await runDirectoryWorker(
      "publish",
      outputDirectory,
      claimedDirectory,
      files,
      hooks.afterPublisherReady
    );
    await assertDirectoryIdentity(outputDirectory, claimedDirectory);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "synthetic_feedback_output_conflict"
    ) {
      throw error;
    }
    throw new Error("synthetic_feedback_output_write_failed");
  }
}

interface DirectoryIdentity {
  dev: bigint;
  ino: bigint;
}

async function readDirectoryIdentity(
  outputDirectory: string
): Promise<DirectoryIdentity> {
  const stats = await lstat(outputDirectory, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("synthetic_feedback_output_conflict");
  }
  return { dev: stats.dev, ino: stats.ino };
}

async function assertDirectoryIdentity(
  outputDirectory: string,
  expected: DirectoryIdentity
): Promise<void> {
  const actual = await readDirectoryIdentity(outputDirectory);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino) {
    throw new Error("synthetic_feedback_output_conflict");
  }
}

type DirectoryWorkerMode = "publish" | "verify";

function runDirectoryWorker(
  mode: DirectoryWorkerMode,
  outputDirectory: string,
  expected: DirectoryIdentity,
  files: readonly { name: string; content: string }[],
  afterReady: (() => Promise<void>) | undefined
): Promise<void> {
  const payload = JSON.stringify(files);
  return new Promise((resolvePublish, rejectPublish) => {
    const child = spawn(
      process.execPath,
      [
        PUBLISHER_WORKER_PATH,
        mode,
        expected.dev.toString(),
        expected.ino.toString(),
      ],
      {
        cwd: outputDirectory,
        env: createSyntheticFeedbackWorkerEnvironment(),
        shell: false,
        stdio: ["pipe", "pipe", "ignore"],
      }
    );
    let settled = false;
    let payloadSent = false;
    let readyOutput = "";
    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      rejectPublish(new Error("synthetic_feedback_output_write_failed"));
    };

    child.once("error", rejectOnce);
    child.stdin.once("error", rejectOnce);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (value: string) => {
      if (settled) return;
      readyOutput += value;
      if (!"ready\n".startsWith(readyOutput)) {
        child.kill();
        rejectOnce();
        return;
      }
      if (readyOutput !== "ready\n" || payloadSent) return;
      payloadSent = true;
      void (async () => {
        await afterReady?.();
        child.stdin.end(payload);
      })().catch(() => {
        child.kill();
        rejectOnce();
      });
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0 || readyOutput !== "ready\n") {
        rejectOnce();
        return;
      }
      settled = true;
      resolvePublish();
    });
  });
}

async function existingOutputMatches(
  outputDirectory: string,
  files: readonly { name: string; content: string }[],
  afterVerifierReady: (() => Promise<void>) | undefined
): Promise<boolean> {
  let expected: DirectoryIdentity;
  try {
    expected = await readDirectoryIdentity(outputDirectory);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
  try {
    await runDirectoryWorker(
      "verify",
      outputDirectory,
      expected,
      files,
      afterVerifierReady
    );
  } catch {
    throw new Error("synthetic_feedback_output_conflict");
  }
  await assertDirectoryIdentity(outputDirectory, expected);
  return true;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function createSyntheticFeedbackWorkerEnvironment(
  parentEnvironment: Readonly<Record<string, string | undefined>> = process.env
): SyntheticFeedbackWorkerEnvironment {
  const reviewedEgressGuard = `--import=${
    pathToFileURL(
      resolve(REPOSITORY_ROOT, "tests/browser/support/block-server-egress.mjs")
    ).href
  }`;
  return parentEnvironment.NODE_OPTIONS === reviewedEgressGuard
    ? {
        MEELNI_REQUIRE_BROWSER_QA_EGRESS_GUARD: "1",
        NODE_ENV: "test",
        NODE_OPTIONS: reviewedEgressGuard,
        TZ: "UTC",
      }
    : { NODE_ENV: "test", TZ: "UTC" };
}

function parseRunArguments(args: readonly string[]): {
  scenarioIds: string[] | undefined;
  outputDirectory: string | undefined;
} {
  let runAll = false;
  let scenarioId: string | undefined;
  let outputDirectory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--all") {
      if (runAll || scenarioId) throw usageError();
      runAll = true;
      continue;
    }
    if (value === "--output") {
      const directory = args[index + 1];
      if (!directory || directory.startsWith("--") || outputDirectory) {
        throw usageError();
      }
      outputDirectory = directory;
      index += 1;
      continue;
    }
    if (!value || value.startsWith("--") || runAll || scenarioId) {
      throw usageError();
    }
    scenarioId = value;
  }
  if (!runAll && !scenarioId) throw usageError();
  return {
    scenarioIds: runAll ? undefined : [scenarioId!],
    outputDirectory,
  };
}

function usageError(): Error {
  return new Error(
    "usage: feedback:synthetic list | run <scenario-id> [--output <directory>] | run --all [--output <directory>]"
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void (async () => {
    process.exitCode = await runSyntheticFeedbackCli(process.argv.slice(2), {
      cwd: process.cwd(),
      writeOut: (value) => process.stdout.write(value),
      writeError: (value) => process.stderr.write(value),
    });
  })();
}
