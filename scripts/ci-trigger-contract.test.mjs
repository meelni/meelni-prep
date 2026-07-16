import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const triggerBlock = workflow.slice(
  workflow.indexOf("on:"),
  workflow.indexOf("permissions:")
);

test("hosted Validate runs only for merge-ready PRs, main, or manual dispatch", () => {
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
  assert.match(triggerBlock, /push:\n\s+branches: \[main\]/);
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.match(
    workflow,
    /github\.event\.action != 'closed' && github\.event\.pull_request\.draft == false/
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

test("feature branches cannot reintroduce a duplicate push-triggered Validate run", () => {
  assert.equal(triggerBlock.match(/^  push:$/gm)?.length, 1);
  assert.doesNotMatch(triggerBlock, /branches:\s*\[[^\]]*(?:\*\*|codex\/)/);
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
