import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  classifyChanges,
  isDocumentationPath,
  parseNameStatus,
  trackedTopLevelOwnership,
} from "./classify-ci-changes.mjs";

function entries(...paths) {
  return paths.map((path) => ({ status: "M", paths: [path] }));
}

test("documentation-only changes select one lightweight repository lane", () => {
  const result = classifyChanges(
    entries(
      "README.md",
      "docs/operations/ci-cost-control.md",
      "openspec/changes/ci/proposal.md",
      ".agents/skills/meelni-pr-prep/SKILL.md",
      "docs/evidence/timing.png"
    )
  );

  assert.equal(result.mode, "documentation");
  assert.deepEqual(result.selected, {
    repository: true,
    static: false,
    tests: false,
    database: false,
    production: false,
  });
});

test("agent-only changes skip database and production validation", () => {
  const result = classifyChanges(
    entries("agent/runtime.py", "docs/contracts/agent.md")
  );
  assert.equal(result.mode, "targeted");
  assert.deepEqual(result.selected, {
    repository: false,
    static: true,
    tests: true,
    database: false,
    production: false,
  });
});

test("migration-only changes add database validation without browser QA", () => {
  const result = classifyChanges(
    entries(
      "lib/db/migrations/0032_add_index.sql",
      "supabase/migrations/20260726_fix.sql"
    )
  );
  assert.equal(result.mode, "targeted");
  assert.equal(result.selected.database, true);
  assert.equal(result.selected.production, false);
});

test("application and browser paths add production validation without PostgreSQL", () => {
  for (const path of [
    "app/setup/page.tsx",
    "components/button.tsx",
    "content/blog/post.md",
    "public/logo.svg",
    "tests/browser/specs/flow.spec.ts",
    "next.config.ts",
  ]) {
    const result = classifyChanges(entries(path));
    assert.equal(result.mode, "targeted", path);
    assert.equal(result.selected.production, true, path);
    assert.equal(result.selected.database, false, path);
  }
});

test("mixed application and migration changes select both heavy lanes", () => {
  const result = classifyChanges(
    entries("app/setup/page.tsx", "lib/db/migrations/0032_add_index.sql")
  );
  assert.equal(result.selected.database, true);
  assert.equal(result.selected.production, true);
});

test("config, dependency, workflow, classifier, shared, and unknown paths force full coverage", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "package-lock.json",
    "scripts/classify-ci-changes.mjs",
    "lib/workflows/start-session.ts",
    "packages/core/src/index.ts",
    "brand-new-top-level/value.txt",
  ]) {
    const result = classifyChanges(entries(path));
    assert.equal(result.mode, "full", path);
    assert.deepEqual(result.selected, {
      repository: false,
      static: true,
      tests: true,
      database: true,
      production: true,
    });
  }
});

test("deletions, renames, copies, malformed paths, and empty diffs fail closed", () => {
  for (const changeSet of [
    [],
    [{ status: "D", paths: ["docs/removed.md"] }],
    [{ status: "R", paths: ["docs/old.md", "docs/new.md"] }],
    [{ status: "C", paths: ["docs/old.md", "docs/new.md"] }],
    [{ status: "M", paths: ["../outside.md"] }],
    [{ status: "M", paths: ["docs\\windows.md"] }],
  ]) {
    assert.equal(classifyChanges(changeSet).mode, "full");
  }
});

test("name-status parser preserves adversarial statuses and rejects malformed output", () => {
  assert.deepEqual(
    parseNameStatus(
      "M\0docs/readme.md\0R100\0docs/old.md\0docs/new.md\0D\0docs/gone.md\0"
    ),
    [
      { status: "M", paths: ["docs/readme.md"] },
      { status: "R", paths: ["docs/old.md", "docs/new.md"] },
      { status: "D", paths: ["docs/gone.md"] },
    ]
  );
  assert.throws(() => parseNameStatus("M\0"), /Incomplete/);
  assert.throws(() => parseNameStatus("not-a-status\0file\0"), /Malformed/);
});

test("documentation classification requires owned directories and safe extensions", () => {
  assert.equal(isDocumentationPath("docs/guide.md"), true);
  assert.equal(isDocumentationPath("docs/evidence/screenshot.webp"), true);
  assert.equal(isDocumentationPath("content/guide.md"), false);
  assert.equal(isDocumentationPath("docs/tool.sh"), false);
  assert.equal(isDocumentationPath(".claude/agent.md"), false);
});

test("every tracked top-level path has explicit conservative ownership", () => {
  const names = execFileSync("git", ["ls-tree", "--name-only", "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const allowed = new Set(["documentation", "agent", "application", "full"]);

  for (const name of names) {
    assert.ok(allowed.has(trackedTopLevelOwnership(name)), name);
  }
});
