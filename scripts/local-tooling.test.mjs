import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorktree,
  evaluateHandoffSnapshot,
  parseWorktreePorcelain,
  summarizePorcelainStatus,
} from "./developer-workflow.mjs";
import { createNodeInstallPlan } from "./local-setup-plan.mjs";

test("fresh setup uses npm ci while retries stay incremental", () => {
  assert.deepEqual(
    createNodeInstallPlan({
      nodeModulesExists: false,
      packageLockExists: true,
    }),
    {
      label: "clean npm ci",
      args: ["ci", "--no-audit", "--no-fund"],
    }
  );
  assert.deepEqual(
    createNodeInstallPlan({
      nodeModulesExists: true,
      packageLockExists: true,
    }),
    {
      label: "incremental npm install",
      args: ["install", "--no-audit", "--no-fund"],
    }
  );
  assert.throws(
    () =>
      createNodeInstallPlan({
        nodeModulesExists: false,
        packageLockExists: false,
      }),
    /package-lock\.json is required/
  );
});

test("handoff fails closed for dirty, detached, unpushed, or stale branches", () => {
  const cleanChanges = summarizePorcelainStatus("");
  assert.deepEqual(
    evaluateHandoffSnapshot({
      branch: "codex/example",
      upstream: "origin/codex/example",
      ahead: 0,
      behind: 0,
      changes: cleanChanges,
    }),
    { ready: true, problems: [] }
  );

  const blocked = evaluateHandoffSnapshot({
    branch: undefined,
    upstream: "origin/codex/example",
    ahead: 2,
    behind: 1,
    changes: summarizePorcelainStatus(" M package.json\n?? notes.txt"),
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.problems.length, 4);
  assert.match(blocked.problems.join("\n"), /detached/);
  assert.match(blocked.problems.join("\n"), /2 uncommitted/);
  assert.match(blocked.problems.join("\n"), /2 unpushed/);
  assert.match(blocked.problems.join("\n"), /1 commit\(s\) behind/);
});

test("porcelain summaries expose counts without filenames", () => {
  assert.deepEqual(
    summarizePorcelainStatus(
      "M  tracked.ts\n M unstaged.ts\nMM both.ts\n?? private-name.txt"
    ),
    {
      total: 4,
      staged: 2,
      unstaged: 2,
      untracked: 1,
    }
  );
});

test("worktree inventory parses records and prioritizes unsafe states", () => {
  assert.deepEqual(
    parseWorktreePorcelain(
      [
        "worktree /repo",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /repo-feature",
        "HEAD def456",
        "detached",
        "",
      ].join("\n")
    ),
    [
      { path: "/repo", HEAD: "abc123", branch: "refs/heads/main" },
      { path: "/repo-feature", HEAD: "def456", detached: true },
    ]
  );

  assert.equal(
    classifyWorktree({
      missing: true,
      dirtyCount: 0,
      mergedIntoDefault: false,
      upstreamState: "none",
      detached: false,
    }),
    "missing"
  );
  assert.equal(
    classifyWorktree({
      dirtyCount: 1,
      mergedIntoDefault: true,
      upstreamState: "gone",
      detached: false,
    }),
    "dirty"
  );
  assert.equal(
    classifyWorktree({
      dirtyCount: 0,
      mergedIntoDefault: true,
      upstreamState: "present",
      detached: false,
    }),
    "merged"
  );
  assert.equal(
    classifyWorktree({
      dirtyCount: 0,
      mergedIntoDefault: false,
      upstreamState: "gone",
      detached: false,
    }),
    "gone"
  );
});
