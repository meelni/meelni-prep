import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const triggerBlock = workflow.slice(
  workflow.indexOf("on:"),
  workflow.indexOf("permissions:")
);

test("hosted Validate runs only for merge-ready PRs, main, or manual dispatch", () => {
  assert.match(
    triggerBlock,
    /pull_request:\n\s+types: \[opened, reopened, ready_for_review, converted_to_draft, synchronize\]/
  );
  assert.match(triggerBlock, /push:\n\s+branches: \[main\]/);
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.match(
    workflow,
    /validate:\n\s+if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/
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
