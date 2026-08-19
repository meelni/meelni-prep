import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const runtimeSourceSha256 = await hashRuntimeSources();
  const report = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    runtimeSourceSha256
  );
  const serialized = serializeInterviewerBenchmarkReport(report);
  if (options.writePath) {
    await writeFile(options.writePath, serialized, "utf8");
    process.stdout.write(
      `${report.reproducibility.reportSha256} ${options.writePath}\n`
    );
    return;
  }
  if (options.verifyPath) {
    const committed = await readFile(options.verifyPath, "utf8");
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

async function hashRuntimeSources(): Promise<string> {
  const hash = createHash("sha256");
  for (const path of RUNTIME_SOURCES) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(resolve(path)));
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
      verifyPath = resolve(args[++index]!);
      continue;
    }
    if (argument === "--write" && args[index + 1]) {
      writePath = resolve(args[++index]!);
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
