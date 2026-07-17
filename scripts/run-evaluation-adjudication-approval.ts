import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildDelegatedEvaluationAdjudicationApproval } from "@/lib/evaluation/calibration-approval";

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      error: error instanceof Error ? error.message : "approval_failed",
    })
  );
  process.exitCode = 1;
});

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error("--output requires a path");
  if (
    process.argv
      .slice(2)
      .some(
        (argument, index, args) =>
          argument !== "--output" && args[index - 1] !== "--output"
      )
  ) {
    throw new Error("Only --output <path> is supported");
  }
  const serialized = `${JSON.stringify(buildDelegatedEvaluationAdjudicationApproval(), null, 2)}\n`;
  const target = resolve(process.cwd(), output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(serialized);
}
