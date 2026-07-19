import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const parsedWorkflow = parse(workflow);
const triggerBlock = workflow.slice(
  workflow.indexOf("on:"),
  workflow.indexOf("permissions:")
);
const pullRequestTrigger = triggerBlock.slice(
  triggerBlock.indexOf("  pull_request:"),
  triggerBlock.indexOf("  workflow_dispatch:")
);
const stackWorkflow = readFileSync(
  ".github/workflows/stack-topology.yml",
  "utf8"
);

test("hosted Validate runs for merge-ready PRs or manual dispatch", () => {
  assert.match(triggerBlock, /pull_request:\n\s+types:/);
  for (const event of [
    "opened",
    "reopened",
    "ready_for_review",
    "converted_to_draft",
    "synchronize",
    "closed",
  ]) {
    assert.match(triggerBlock, new RegExp(`\\b${event}\\b`));
  }
  assert.doesNotMatch(triggerBlock, /^  push:\s*$/m);
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.match(
    workflow,
    /github\.event\.action != 'closed' && github\.event\.pull_request\.draft == false/
  );
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && 'Manual Validate'/
  );
  assert.match(
    workflow,
    /'PR lifecycle \/ No hosted validation' \|\| 'Validate'/
  );
});

test("cost control preserves exact-head cancellation and the complete validation gate", () => {
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /postgres:17\.6-alpine3\.22@sha256:/);

  for (const step of [
    "Validate repository skills",
    "Run local tooling tests",
    "Verify clean and legacy database migrations",
    "Run type, lint, quality, and regression checks",
    "Run Python agent contract tests",
    "Build production application",
  ]) {
    assert.match(workflow, new RegExp(`- name: ${step}`));
  }
});

test("protected branch merges cannot start a duplicate push-triggered Validate run", () => {
  assert.ok(parsedWorkflow?.on && typeof parsedWorkflow.on === "object");
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedWorkflow.on, "push"),
    false
  );
  assert.doesNotMatch(triggerBlock, /^\s{2}push\s*:/m);
  assert.doesNotMatch(triggerBlock, /branches:/);
});

test("pull request validation stays unfiltered while trusted main publishers remain active", () => {
  assert.doesNotMatch(pullRequestTrigger, /\bpaths(?:-ignore)?:/);
  assert.match(stackWorkflow, /^  push:\n    branches: \[main\]/m);
  assert.match(stackWorkflow, /- "\.github\/stacked-prs\.json"/);
  assert.match(
    stackWorkflow,
    /if: github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'push'/
  );
});

test("draft and closed lifecycle events cannot publish the required Validate context", () => {
  assert.match(
    workflow,
    /github\.event\.action == 'closed' \|\| github\.event\.pull_request\.draft/
  );
  assert.match(triggerBlock, /\bsynchronize\b/);
  assert.match(triggerBlock, /\bclosed\b/);
  assert.doesNotMatch(
    workflow,
    /name: Validate[\s\S]*if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/
  );
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && 'Manual Validate'/
  );
});

test("hosted workflows cannot reintroduce unattended schedules", () => {
  const workflowDirectory = ".github/workflows";
  for (const filename of readdirSync(workflowDirectory)) {
    if (!/\.ya?ml$/.test(filename)) continue;
    const source = readFileSync(`${workflowDirectory}/${filename}`, "utf8");
    assert.doesNotMatch(
      source,
      /^\s{2}schedule:\s*$/m,
      `${filename} must not run on an unattended schedule`
    );
  }
});
