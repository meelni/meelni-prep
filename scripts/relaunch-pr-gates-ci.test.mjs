import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { revalidateRelaunchPullRequestGates } from "./revalidate-relaunch-pr-gates-ci.mjs";
import { verifyRelaunchPullRequestGates } from "./verify-relaunch-pr-gates-ci.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function eventContent() {
  return JSON.stringify({
    number: 77,
    repository: {
      full_name: "saviii/meelni-prep",
      default_branch: "main",
    },
    pull_request: {
      number: 77,
      body: "",
      head: {
        ref: "feature",
        sha: "a".repeat(40),
        repo: { full_name: "saviii/meelni-prep" },
      },
      base: { ref: "main" },
      state: "open",
    },
  });
}

function closedEventContent() {
  const event = JSON.parse(eventContent());
  event.action = "closed";
  event.pull_request.state = "closed";
  return JSON.stringify(event);
}

test("PR orchestration runs both trusted gates and reports either failure", async () => {
  const calls = [];
  const result = await verifyRelaunchPullRequestGates({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: eventContent(),
    stackGate: async () => {
      calls.push("stack");
      throw new Error("stack_api_failed");
    },
    migrationGate: async ({ repository, fallbackPullRequest }) => {
      calls.push("migration");
      assert.equal(repository, "saviii/meelni-prep");
      assert.equal(fallbackPullRequest.number, 77);
      return { status: "pass" };
    },
  });
  assert.deepEqual(calls.sort(), ["migration", "stack"]);
  assert.equal(result.status, "fail");
  assert.deepEqual(result.errors, ["stack_api_failed"]);
});

test("PR orchestration fails closed for migration collisions and wrong events", async () => {
  const result = await verifyRelaunchPullRequestGates({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: eventContent(),
    stackGate: async () => ({ status: "not_stacked" }),
    migrationGate: async () => ({ status: "fail" }),
  });
  assert.equal(result.status, "fail");
  await assert.rejects(
    verifyRelaunchPullRequestGates({
      env: { GITHUB_EVENT_NAME: "push" },
      eventContent: eventContent(),
    }),
    /relaunch_pr_gates_require_pull_request_target/
  );
});

test("closing a PR refreshes migration peers without publishing a redundant stack check", async () => {
  let stackCalls = 0;
  let migrationCalls = 0;
  const result = await verifyRelaunchPullRequestGates({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: closedEventContent(),
    stackGate: async () => {
      stackCalls += 1;
      return { status: "pass" };
    },
    migrationGate: async () => {
      migrationCalls += 1;
      return { status: "pass" };
    },
  });
  assert.equal(result.status, "pass");
  assert.equal(stackCalls, 0);
  assert.equal(migrationCalls, 1);
  assert.equal(result.stack.status, "skipped_closed");
});

test("fork events do not spend the same-repository migration inventory budget", async () => {
  const event = JSON.parse(eventContent());
  event.pull_request.head.repo.full_name = "contributor/meelni-prep";
  let migrationCalls = 0;
  const result = await verifyRelaunchPullRequestGates({
    env: { GITHUB_EVENT_NAME: "pull_request_target" },
    eventContent: JSON.stringify(event),
    stackGate: async () => ({ status: "not_stacked" }),
    migrationGate: async () => {
      migrationCalls += 1;
      return { status: "pass" };
    },
  });
  assert.equal(result.status, "pass");
  assert.equal(migrationCalls, 0);
  assert.equal(result.migration.status, "skipped_fork");
});

test("scheduled orchestration retains stack and migration failures", async () => {
  const result = await revalidateRelaunchPullRequestGates({
    stackGate: async () => [{ status: "error", pr: 10 }],
    migrationGate: async () => ({ status: "pass" }),
  });
  assert.equal(result.status, "fail");
  assert.equal(result.stack[0].pr, 10);

  const rejected = await revalidateRelaunchPullRequestGates({
    stackGate: async () => [],
    migrationGate: async () => {
      throw new Error("migration_api_failed");
    },
  });
  assert.equal(rejected.status, "fail");
  assert.deepEqual(rejected.errors, ["migration_api_failed"]);
});

test("trusted workflow runs only default-branch gate code with least privilege", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/stack-topology.yml"),
    "utf8"
  );
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /closed/);
  assert.match(workflow, /converted_to_draft/);
  assert.match(workflow, /ready_for_review/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /checks: write/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
  );
  assert.match(workflow, /node scripts\/verify-relaunch-pr-gates-ci\.mjs/);
  assert.match(workflow, /node scripts\/revalidate-relaunch-pr-gates-ci\.mjs/);
  assert.doesNotMatch(workflow, /pull_request\.head\.sha/);
  assert.doesNotMatch(workflow, /checkout[^]*pull_request\.head/);
});
