import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  migrationEventJobFailed,
  verifyMigrationCollisionsForEvent,
} from "./check-migration-collisions-event-ci.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function event({ state = "open", headRepository = "meelni/meelni-prep" } = {}) {
  return JSON.stringify({
    action: state === "closed" ? "closed" : "synchronize",
    number: 77,
    repository: {
      full_name: "meelni/meelni-prep",
      default_branch: "main",
    },
    pull_request: {
      number: 77,
      state,
      body: "",
      head: {
        ref: "feature",
        sha: "a".repeat(40),
        repo: { full_name: headRepository },
      },
      base: { ref: "main" },
    },
  });
}

test("same-repository PR events run the migration audit with exact event identity", async () => {
  const calls = [];
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event(),
    audit: async (input) => {
      calls.push(input);
      return {
        status: "pass",
        results: [{ pr: 77, status: "not_applicable" }],
      };
    },
  });
  assert.equal(result.status, "pass");
  assert.equal(calls[0].repository, "meelni/meelni-prep");
  assert.equal(calls[0].triggeringPrNumber, 77);
  assert.equal(calls[0].fallbackPullRequest.number, 77);
});

test("closed events refresh peers without using a closed PR as fallback", async () => {
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event({ state: "closed" }),
    audit: async (input) => {
      assert.equal(input.triggeringPrNumber, 77);
      assert.equal(input.fallbackPullRequest, undefined);
      return { status: "pass", results: [] };
    },
  });
  assert.equal(result.status, "pass");
});

test("an unrelated trigger succeeds while other open PRs collide", async () => {
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event(),
    audit: async () => ({
      status: "fail",
      results: [
        { pr: 88, status: "fail" },
        { pr: 89, status: "fail" },
        { pr: 77, status: "not_applicable" },
      ],
    }),
  });

  assert.equal(migrationEventJobFailed(result), false);
});

test("a collision-owning trigger fails its standard job context", async () => {
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event(),
    audit: async () => ({
      status: "fail",
      results: [
        { pr: 77, status: "fail" },
        { pr: 88, status: "fail" },
      ],
    }),
  });

  assert.equal(migrationEventJobFailed(result), true);
});

test("inventory, publication, and freshness errors fail every triggering job", async () => {
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event(),
    audit: async () => ({
      status: "error",
      errors: [{ pr: null, error: "github_open_pr_inventory_failed" }],
      results: [{ pr: 77, status: "error" }],
    }),
  });

  assert.equal(migrationEventJobFailed(result), true);
  assert.equal(
    migrationEventJobFailed({
      status: "pass",
      triggeringPrNumber: 77,
      triggeringOpen: true,
      results: [],
    }),
    true
  );
});

test("fork triggers skip inventory but fail the required job closed", async () => {
  let auditCalls = 0;
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event({ headRepository: "contributor/meelni-prep" }),
    audit: async () => {
      auditCalls += 1;
      return { status: "pass" };
    },
  });
  assert.equal(result.status, "skipped_fork");
  assert.equal(migrationEventJobFailed(result), true);
  assert.equal(auditCalls, 0);
  await assert.rejects(
    verifyMigrationCollisionsForEvent({
      env: { GITHUB_EVENT_NAME: "push" },
      eventContent: event(),
    }),
    /migration_collision_gate_requires_pull_request_target/
  );
});

test("closed triggers do not inherit peer collisions after a complete audit", async () => {
  const result = await verifyMigrationCollisionsForEvent({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: event({ state: "closed" }),
    audit: async () => ({
      status: "fail",
      results: [{ pr: 88, status: "fail" }],
    }),
  });

  assert.equal(result.triggeringOpen, false);
  assert.equal(migrationEventJobFailed(result), false);
});

test("migration publishers share the workflow's non-canceling serialization boundary", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/stack-topology.yml"),
    "utf8"
  );
  const groups = workflow.match(/group: migration-collision-audit/g) ?? [];
  const nonCanceling =
    workflow.match(
      /group: migration-collision-audit\n      cancel-in-progress: false/g
    ) ?? [];
  assert.equal(groups.length, 3);
  assert.equal(nonCanceling.length, 3);
  assert.match(
    workflow,
    /run: node scripts\/check-migration-collisions-event-ci\.mjs/
  );
  assert.match(
    workflow,
    /run: node scripts\/check-migration-collisions-ci\.mjs/
  );
  assert.match(
    workflow,
    /verify-migrations:[^]*?name: Migration Collision Publisher/
  );
  assert.doesNotMatch(workflow, /checkout[^]*pull_request\.head/);
});
