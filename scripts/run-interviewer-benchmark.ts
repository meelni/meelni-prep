import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readInterviewerBenchmarkEvidence,
  writeInterviewerBenchmarkEvidence,
} from "@/lib/interviewer-benchmark/evidence-file";
import {
  createProviderFreeInterviewerJudgeAdapter,
  runInterviewerBenchmark,
  serializeInterviewerBenchmarkReport,
} from "@/lib/interviewer-benchmark/runner";

const RUNTIME_SOURCES = [
  "agent/shared/prompt_contracts.py",
  "agent/shared/prompts.py",
  "agent/shared/utils/prompt_builder.py",
] as const;
const BENCHMARK_SOURCES = [
  "packages/agent/src/interviewer-benchmark.ts",
  "packages/test-fixtures/src/interviewer-benchmark.ts",
  "lib/interviewer-benchmark/runner.ts",
  "lib/interviewer-benchmark/evidence-file.ts",
  "scripts/run-interviewer-benchmark.ts",
] as const;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeSourceSha256 = await hashSources(RUNTIME_SOURCES);
  const benchmarkSourceSha256 = await hashSources(BENCHMARK_SOURCES);
  const report = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    runtimeSourceSha256,
    benchmarkSourceSha256
  );
  const serialized = serializeInterviewerBenchmarkReport(report);
  if (options.writePath) {
    await writeInterviewerBenchmarkEvidence(
      REPO_ROOT,
      options.writePath,
      serialized
    );
    process.stdout.write(
      `${report.reproducibility.reportSha256} ${options.writePath}\n`
    );
    return;
  }
  if (options.verifyPath) {
    const committed = await readInterviewerBenchmarkEvidence(
      REPO_ROOT,
      options.verifyPath
    );
    if (committed !== serialized) {
      throw new Error("interviewer_benchmark_evidence_mismatch");
    }
    process.stdout.write(
      `${report.reproducibility.reportSha256} ${options.verifyPath}\n`
    );
    return;
  }
  process.stdout.write(serialized);
}

async function hashSources(paths: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(resolve(REPO_ROOT, path)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function parseArgs(args: string[]): {
  verifyPath: string | null;
  writePath: string | null;
} {
  let verifyPath: string | null = null;
  let writePath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--verify" && args[index + 1]) {
      verifyPath = args[++index]!;
      continue;
    }
    if (argument === "--write" && args[index + 1]) {
      writePath = args[++index]!;
      continue;
    }
    throw new Error("interviewer_benchmark_cli_argument_invalid");
  }
  if (verifyPath && writePath) {
    throw new Error("interviewer_benchmark_cli_mode_conflict");
  }
  return { verifyPath, writePath };
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "interviewer_benchmark_failed"}\n`
  );
  process.exitCode = 1;
});
