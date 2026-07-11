import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auditOpenMigrationPullRequests } from "./check-migration-collisions-ci.mjs";
import { parseStackEvent } from "./check-stacked-pr-ci.mjs";

export async function verifyMigrationCollisionsForEvent({
  env = process.env,
  eventContent,
  audit = auditOpenMigrationPullRequests,
} = {}) {
  if (env.GITHUB_EVENT_NAME !== "pull_request_target") {
    throw new Error("migration_collision_gate_requires_pull_request_target");
  }
  const content =
    eventContent ??
    (env.GITHUB_EVENT_PATH
      ? readFileSync(env.GITHUB_EVENT_PATH, "utf8")
      : null);
  if (typeof content !== "string") {
    throw new Error("migration_collision_gate_event_required");
  }
  const { pullRequest, repository } = parseStackEvent(content);
  const triggeringPrNumber = pullRequest.number;
  const triggeringOpen = pullRequest.state === "open";
  if (pullRequest.head.repo?.full_name !== repository) {
    return { status: "skipped_fork", triggeringPrNumber, triggeringOpen };
  }
  const result = await audit({
    env,
    repository,
    fallbackPullRequest: triggeringOpen ? pullRequest : undefined,
    triggeringPrNumber,
  });
  return { ...result, triggeringPrNumber, triggeringOpen };
}

export function migrationEventJobFailed(result) {
  if (!result || result.status === "error") return true;
  if (result.status === "skipped_fork") return true;
  if (!Number.isInteger(result.triggeringPrNumber)) return true;
  if (!result.triggeringOpen) return false;
  if (!Array.isArray(result.results)) return true;

  const triggeringResult = result.results.find(
    (entry) => entry?.pr === result.triggeringPrNumber
  );
  return (
    !triggeringResult ||
    triggeringResult.status === "fail" ||
    triggeringResult.status === "error"
  );
}

async function main() {
  try {
    const result = await verifyMigrationCollisionsForEvent();
    console.log(JSON.stringify(result, null, 2));
    if (migrationEventJobFailed(result)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "migration_collision_event_check_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
