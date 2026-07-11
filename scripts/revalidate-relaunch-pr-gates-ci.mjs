import { fileURLToPath } from "node:url";

import { auditOpenMigrationPullRequests } from "./check-migration-collisions-ci.mjs";
import { revalidateRegisteredStacks } from "./revalidate-stacked-prs-ci.mjs";

export async function revalidateRelaunchPullRequestGates({
  stackGate = revalidateRegisteredStacks,
  migrationGate = auditOpenMigrationPullRequests,
} = {}) {
  const [stack, migration] = await Promise.allSettled([
    stackGate(),
    migrationGate(),
  ]);
  const errors = [];
  if (stack.status === "rejected") {
    errors.push(
      stack.reason instanceof Error
        ? stack.reason.message
        : "stack_revalidation_failed"
    );
  }
  if (migration.status === "rejected") {
    errors.push(
      migration.reason instanceof Error
        ? migration.reason.message
        : "migration_collision_revalidation_failed"
    );
  }
  const stackResults = stack.status === "fulfilled" ? stack.value : [];
  const migrationResult =
    migration.status === "fulfilled" ? migration.value : null;
  const failed =
    errors.length > 0 ||
    stackResults.some(
      (result) => result.status === "fail" || result.status === "error"
    ) ||
    migrationResult?.status === "fail" ||
    migrationResult?.status === "error";
  return {
    status: failed ? "fail" : "pass",
    stack: stackResults,
    migration: migrationResult,
    errors,
  };
}

async function main() {
  try {
    const result = await revalidateRelaunchPullRequestGates();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "relaunch_pr_gate_revalidation_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
