import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildEvaluationAdjudicationReviewManifest } from "@meelni/test-fixtures";
import { readFile } from "node:fs/promises";
import { parseEvaluationAdjudicationApproval } from "@/lib/evaluation/calibration-approval";

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
  const approvalIndex = process.argv.indexOf("--approval");
  const approvalPath =
    approvalIndex >= 0 ? process.argv[approvalIndex + 1] : undefined;
  if (approvalIndex >= 0 && !approvalPath)
    throw new Error("--approval requires a path");
  if (
    process.argv
      .slice(2)
      .some(
        (argument, index, args) =>
          argument !== "--output" &&
          argument !== "--approval" &&
          args[index - 1] !== "--output" &&
          args[index - 1] !== "--approval"
      )
  ) {
    throw new Error("Only --output <path> and --approval <path> are supported");
  }

  const candidate = buildEvaluationAdjudicationReviewManifest();
  const approval = approvalPath
    ? parseEvaluationAdjudicationApproval(
        JSON.parse(await readFile(resolve(process.cwd(), approvalPath), "utf8"))
      )
    : null;
  const manifest = approval
    ? {
        ...candidate,
        reviewStatus: "approved_via_product_owner_task_thread_delegation",
        approvalRequired: false,
        approvalResolution: {
          contractVersion: approval.contractVersion,
          reviewedAt: approval.reviewedAt,
          reviewedHead: approval.delegatedAuthority?.reviewedHead,
          reviewer: approval.reviewer,
          reviewBasis: approval.reviewBasis,
          panelSignoffs: approval.delegatedAuthority?.panels,
          approvedCases: approval.decisions.filter(
            ({ decision }) => decision === "approved"
          ).length,
          changesRequiredCases: approval.decisions.filter(
            ({ decision }) => decision === "changes_required"
          ).length,
          scope: "semantic_adjudication_only",
        },
      }
    : candidate;
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (output) {
    const target = resolve(process.cwd(), output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}
