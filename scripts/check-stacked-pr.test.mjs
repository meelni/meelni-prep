import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkStackTopology,
  extractStackEvidence,
  loadStackManifest,
  validatePullRequestDeclaration,
} from "./check-stacked-pr.mjs";

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(repo, message, allowEmpty = true) {
  git(repo, "commit", ...(allowEmpty ? ["--allow-empty"] : []), "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "meelni-stack-check-"));
  git(repo, "init", "--initial-branch=main");
  git(repo, "config", "user.email", "stack-test@example.invalid");
  git(repo, "config", "user.name", "Stack Test");
  const root = commit(repo, "root");
  git(repo, "switch", "-c", "parent");
  const parent = commit(repo, "parent");
  git(repo, "switch", "-c", "child");
  const head = commit(repo, "child");
  return { repo, root, parent, head };
}

function manifest(expectedParentHead) {
  return {
    version: 1,
    repository: "saviii/meelni-prep",
    stacks: [
      {
        pr: 999,
        headRef: "child",
        parentRef: "parent",
        expectedParentHead,
      },
    ],
  };
}

function evidence({ head, parentHead, mergeBase = parentHead }) {
  return {
    version: 1,
    headRef: "child",
    parentRef: "parent",
    head,
    parentHead,
    mergeBase,
  };
}

test("a child containing the exact current parent passes", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.repo, { recursive: true, force: true }));
  const result = checkStackTopology({
    repo: state.repo,
    manifest: manifest(state.parent),
    headRef: "child",
    headRevision: state.head,
    parentRevision: state.parent,
    evidence: evidence({ head: state.head, parentHead: state.parent }),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, "pass");
  assert.equal(result.behind, 0);
  assert.equal(result.ahead, 1);
});

test("a stale declared parent head fails after the parent moves", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.repo, { recursive: true, force: true }));
  git(state.repo, "switch", "parent");
  const currentParent = commit(state.repo, "parent remediation");
  const result = checkStackTopology({
    repo: state.repo,
    manifest: manifest(state.parent),
    headRef: "child",
    headRevision: state.head,
    parentRevision: currentParent,
    requireEvidence: false,
  });
  assert.ok(result.errors.includes("declared_parent_head_is_stale"));
  assert.equal(result.actualParentHead, currentParent);
});

test("PR263-style false ancestry reports merge-base and behind count", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.repo, { recursive: true, force: true }));
  git(state.repo, "switch", "parent");
  commit(state.repo, "parent remediation one");
  const currentParent = commit(state.repo, "parent remediation two");
  const result = checkStackTopology({
    repo: state.repo,
    manifest: manifest(currentParent),
    headRef: "child",
    headRevision: state.head,
    parentRevision: currentParent,
    requireEvidence: false,
  });
  assert.ok(result.errors.includes("head_does_not_contain_current_parent"));
  assert.equal(result.mergeBase, state.parent);
  assert.equal(result.behind, 2);
  assert.equal(result.ahead, 1);
});

test("evidence is superseded when the child head changes", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.repo, { recursive: true, force: true }));
  const oldEvidence = evidence({ head: state.head, parentHead: state.parent });
  const currentHead = commit(state.repo, "review remediation");
  const result = checkStackTopology({
    repo: state.repo,
    manifest: manifest(state.parent),
    headRef: "child",
    headRevision: currentHead,
    parentRevision: state.parent,
    evidence: oldEvidence,
  });
  assert.deepEqual(result.errors, ["evidence_head_is_superseded"]);
});

test("a non-main PR cannot omit its stack declaration", () => {
  const result = validatePullRequestDeclaration({
    manifest: {
      version: 1,
      repository: "saviii/meelni-prep",
      stacks: [],
    },
    prNumber: 998,
    headRef: "undeclared-child",
    headRepository: "saviii/meelni-prep",
    baseRef: "parent",
  });
  assert.deepEqual(result.errors, ["stack_relationship_missing_from_manifest"]);
});

test("the GitHub base must match the declared parent ref", () => {
  const result = validatePullRequestDeclaration({
    manifest: manifest("a".repeat(40)),
    prNumber: 999,
    headRef: "child",
    headRepository: "saviii/meelni-prep",
    baseRef: "different-parent",
  });
  assert.deepEqual(result.errors, ["github_base_differs_from_declared_parent"]);
});

test("the manifest PR number is part of the declaration identity", () => {
  const result = validatePullRequestDeclaration({
    manifest: manifest("a".repeat(40)),
    prNumber: 998,
    headRef: "child",
    headRepository: "saviii/meelni-prep",
    baseRef: "parent",
  });
  assert.deepEqual(result.errors, ["github_pr_differs_from_manifest_entry"]);
});

test("a fork head-name collision does not consume a main PR declaration", () => {
  const result = validatePullRequestDeclaration({
    manifest: manifest("a".repeat(40)),
    prNumber: 998,
    headRef: "child",
    headRepository: "contributor/meelni-prep",
    baseRef: "main",
  });
  assert.equal(result.entry, null);
  assert.deepEqual(result.errors, []);
});

test("a fork cannot declare a stack against a non-main branch", () => {
  const result = validatePullRequestDeclaration({
    manifest: manifest("a".repeat(40)),
    prNumber: 999,
    headRef: "child",
    headRepository: "contributor/meelni-prep",
    baseRef: "parent",
  });
  assert.deepEqual(result.errors, [
    "stacked_pr_must_originate_from_manifest_repository",
  ]);
});

test("the repository manifest and GitHub-event evidence are machine-readable", () => {
  const repositoryManifest = loadStackManifest();
  assert.ok(repositoryManifest.stacks.length > 0);
  const expected = evidence({
    head: "c".repeat(40),
    parentHead: "d".repeat(40),
  });
  const event = JSON.stringify({
    pull_request: {
      body: `<!-- meelni-stack-evidence\n${JSON.stringify(expected)}\n-->`,
    },
  });
  assert.deepEqual(extractStackEvidence(event), expected);
});
