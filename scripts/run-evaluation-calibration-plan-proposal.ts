import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildSAV258V27PlanProposal } from "@/lib/evaluation/calibration-run-ledger";

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      error: error instanceof Error ? error.message : "proposal_failed",
    })
  );
  process.exitCode = 1;
});

async function main() {
  const approval = argumentValue("--approval");
  const output = argumentValue("--output");
  const allowed = new Set(["--approval", "--output"]);
  if (
    process.argv
      .slice(2)
      .some(
        (argument, index, args) =>
          !allowed.has(argument) && !allowed.has(args[index - 1] ?? "")
      )
  ) {
    throw new Error("Only --approval <path> and --output <path> are supported");
  }
  const adjudicationApproval = JSON.parse(
    await readFile(resolve(process.cwd(), approval), "utf8")
  );
  const serialized = `${JSON.stringify(buildSAV258V27PlanProposal(adjudicationApproval), null, 2)}\n`;
  const target = resolve(process.cwd(), output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(serialized);
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} requires a path`);
  return value;
}
