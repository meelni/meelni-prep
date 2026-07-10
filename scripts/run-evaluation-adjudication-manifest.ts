import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildEvaluationAdjudicationReviewManifest } from "@meelni/test-fixtures";

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      error: error instanceof Error ? error.message : "manifest_failed",
    })
  );
  process.exitCode = 1;
});

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) throw new Error("--output requires a path");
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

  const serialized = `${JSON.stringify(buildEvaluationAdjudicationReviewManifest(), null, 2)}\n`;
  if (output) {
    const target = resolve(process.cwd(), output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}
