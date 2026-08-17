import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, parse, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSyntheticFeedbackScenarios } from "@meelni/test-fixtures";

import { createSyntheticFeedbackBundle } from "@/lib/workflows/synthetic-feedback-runner";

const DEFAULT_OUTPUT_DIRECTORY = ".artifacts/synthetic-feedback/v1";

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

    const bundle = await createSyntheticFeedbackBundle(parsed.scenarioIds);
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

async function publishSyntheticFeedbackFiles(
  outputDirectory: string,
  files: readonly { name: string; content: string }[]
): Promise<void> {
  try {
    if (await existingOutputMatches(outputDirectory, files)) return;
    const parentDirectory = dirname(outputDirectory);
    await mkdir(parentDirectory, { recursive: true });
    const stagingDirectory = await mkdtemp(
      join(parentDirectory, ".meelni-synthetic-feedback-")
    );
    let published = false;
    try {
      for (const file of files) {
        await writeFile(join(stagingDirectory, file.name), file.content, {
          encoding: "utf8",
          flag: "wx",
        });
      }
      try {
        await rename(stagingDirectory, outputDirectory);
        published = true;
      } catch (error) {
        if (await existingOutputMatches(outputDirectory, files)) return;
        throw error;
      }
    } finally {
      if (!published) {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    }
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

async function existingOutputMatches(
  outputDirectory: string,
  files: readonly { name: string; content: string }[]
): Promise<boolean> {
  let outputStats;
  try {
    outputStats = await lstat(outputDirectory);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
  if (outputStats.isSymbolicLink() || !outputStats.isDirectory()) {
    throw new Error("synthetic_feedback_output_conflict");
  }

  const expectedNames = files.map((file) => file.name).sort();
  const actualNames = (await readdir(outputDirectory)).sort();
  if (
    expectedNames.length !== actualNames.length ||
    expectedNames.some((name, index) => name !== actualNames[index])
  ) {
    throw new Error("synthetic_feedback_output_conflict");
  }

  for (const file of files) {
    const filePath = join(outputDirectory, file.name);
    const fileStats = await lstat(filePath);
    if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
      throw new Error("synthetic_feedback_output_conflict");
    }
    if ((await readFile(filePath, "utf8")) !== file.content) {
      throw new Error("synthetic_feedback_output_conflict");
    }
  }
  return true;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
