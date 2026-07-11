import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auditOpenMigrationPullRequests } from "./check-migration-collisions-ci.mjs";
import {
  parseStackEvent,
  runStackCiAndPublish,
} from "./check-stacked-pr-ci.mjs";

export async function verifyRelaunchPullRequestGates({
  env = process.env,
  eventContent,
  stackGate = runStackCiAndPublish,
  migrationGate = auditOpenMigrationPullRequests,
} = {}) {
  if (env.GITHUB_EVENT_NAME !== "pull_request_target") {
    throw new Error("relaunch_pr_gates_require_pull_request_target");
  }
  const content =
    eventContent ??
    (env.GITHUB_EVENT_PATH
      ? readFileSync(env.GITHUB_EVENT_PATH, "utf8")
      : null);
  if (typeof content !== "string") {
    throw new Error("relaunch_pr_gates_event_required");
  }
  const { event, pullRequest, repository } = parseStackEvent(content);
  const sameRepository = pullRequest.head.repo?.full_name === repository;

  const [stack, migration] = await Promise.allSettled([
    event.action === "closed"
      ? Promise.resolve({ status: "skipped_closed" })
      : stackGate({ eventContent: content, env }),
    sameRepository
      ? migrationGate({
          env,
          repository,
          fallbackPullRequest: pullRequest,
          triggeringPrNumber: pullRequest.number,
        })
      : Promise.resolve({ status: "skipped_fork" }),
  ]);
  const errors = [];
  if (stack.status === "rejected") {
    errors.push(
      stack.reason instanceof Error ? stack.reason.message : "stack_gate_failed"
    );
  }
  if (migration.status === "rejected") {
    errors.push(
      migration.reason instanceof Error
        ? migration.reason.message
        : "migration_collision_gate_failed"
    );
  }
  const stackResult = stack.status === "fulfilled" ? stack.value : null;
  const migrationResult =
    migration.status === "fulfilled" ? migration.value : null;
  const failed =
    errors.length > 0 ||
    stackResult?.status === "fail" ||
    migrationResult?.status === "fail" ||
    migrationResult?.status === "error";
  return {
    status: failed ? "fail" : "pass",
    stack: stackResult,
    migration: migrationResult,
    errors,
  };
}

async function main() {
  try {
    const result = await verifyRelaunchPullRequestGates();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error ? error.message : "relaunch_pr_gates_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
