import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  runProviderFreeBakeoff,
  serializeProviderFreeBakeoffReport,
} from "@/lib/evaluation/provider-free-bakeoff";

interface CliOptions {
  configPath: string;
  verifyPath: string | null;
  writePath: string | null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(options.configPath, "utf8"));
  const report = await runProviderFreeBakeoff(config);
  const serialized = serializeProviderFreeBakeoffReport(report);
  if (options.writePath) {
    await writeFile(options.writePath, serialized, { encoding: "utf8" });
    process.stdout.write(
      `${report.reproducibility.reportSha256} ${options.writePath}\n`
    );
    return;
  }
  if (options.verifyPath) {
    const committed = await readFile(options.verifyPath, "utf8");
    if (committed !== serialized) {
      throw new Error("provider_free_bakeoff_evidence_mismatch");
    }
    process.stdout.write(
      `${report.reproducibility.reportSha256} ${options.verifyPath}\n`
    );
    return;
  }
  process.stdout.write(serialized);
}

function parseArgs(args: string[]): CliOptions {
  let configPath = resolve("config/feedback-provider-free-bakeoff.json");
  let verifyPath: string | null = null;
  let writePath: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--config" && args[index + 1]) {
      configPath = resolve(args[++index]!);
      continue;
    }
    if (argument === "--verify" && args[index + 1]) {
      verifyPath = resolve(args[++index]!);
      continue;
    }
    if (argument === "--write" && args[index + 1]) {
      writePath = resolve(args[++index]!);
      continue;
    }
    throw new Error("provider_free_bakeoff_cli_argument_invalid");
  }
  if (verifyPath && writePath) {
    throw new Error("provider_free_bakeoff_cli_mode_conflict");
  }
  return { configPath, verifyPath, writePath };
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "provider_free_bakeoff_failed"}\n`
  );
  process.exitCode = 1;
});
