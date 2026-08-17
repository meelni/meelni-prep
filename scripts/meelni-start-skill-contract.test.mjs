import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const skillRoot = ".agents/skills/meelni-start";
const skill = readFileSync(`${skillRoot}/SKILL.md`, "utf8");
const routing = readFileSync(`${skillRoot}/references/routing.md`, "utf8");
const operations = readFileSync("docs/operations/skills.md", "utf8");
const agentGuide = readFileSync("AGENTS.md", "utf8");

test("Meelni start is discoverable from every canonical agent harness", () => {
  for (const path of [
    ".codex/skills/meelni-start",
    ".claude/skills/meelni-start",
  ]) {
    assert.equal(
      lstatSync(path).isSymbolicLink(),
      true,
      `${path} should be a symlink`
    );
    assert.equal(
      realpathSync(path),
      realpathSync(skillRoot),
      `${path} should resolve to the canonical skill`
    );
  }
  assert.match(operations, /`meelni-start`/);
  assert.match(agentGuide, /`meelni-start`/);
});

test("Meelni start routes every canonical specialist skill", () => {
  const skillNames = readdirSync(".agents/skills", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "meelni-start")
    .map((entry) => entry.name);

  for (const name of skillNames) {
    assert.match(
      routing,
      new RegExp(`\\b${name.replaceAll("-", "\\-")}\\b`),
      `routing reference should include ${name}`
    );
  }

  assert.match(
    routing,
    /secondary skill only for a concrete unresolved question/i
  );
});

test("Meelni start preserves intent and Production authority boundaries", () => {
  assert.match(skill, /Do not implement a fix unless requested/i);
  assert.match(skill, /Only the human owner decides launch GO\/NO-GO/i);
  assert.match(skill, /does not authorize a[\s\S]*Production action/i);
  assert.match(skill, /Do not create Linear issues[\s\S]*simple\s+question/i);
  assert.match(
    skill,
    /Do not create or update tracking for a\s+read-only answer, review, diagnosis, or recommendation/i
  );
});

test("orientation script returns bounded repository and product truth", () => {
  const rawOutput = execFileSync(
    process.execPath,
    [`${skillRoot}/scripts/orient.mjs`],
    { encoding: "utf8" }
  );
  const output = JSON.parse(rawOutput);

  assert.ok(Buffer.byteLength(rawOutput) <= 8_192);
  assert.equal(output.contract, "meelni.start-orientation.v1");
  assert.equal(output.serialization.maxBytes, 8_192);
  assert.equal(typeof output.serialization.truncated, "boolean");
  assert.match(output.repository.head, /^[0-9a-f]{40}$/);
  assert.equal(typeof output.repository.clean, "boolean");
  assert.ok(Array.isArray(output.repository.changedPaths.items));
  assert.equal(typeof output.repository.changedPaths.truncated, "boolean");
  assert.ok(
    output.repository.changedPaths.items.length <= 32,
    "changed-path previews must remain capped at 32 items"
  );
  assert.equal(
    output.repository.changedPaths.truncated,
    output.repository.changedPaths.count >
      output.repository.changedPaths.items.length ||
      output.repository.changedPaths.valuesTruncated > 0,
    "truncated is the explicit marker for path overflow or bounded values"
  );
  assert.equal(output.productTruth.category, "live PM interview practice");
  assert.ok(output.skills.items.includes("meelni-start"));
  assert.equal(output.skills.truncated, false);
  assert.ok(
    output.currentDecisions.items.length > 0,
    "orientation should include current decisions"
  );
});

test("orientation preserves the first path from a dirty Git worktree", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "meelni-start-orientation-"));
  try {
    mkdirSync(join(fixtureRoot, ".agents/skills/example"), { recursive: true });
    mkdirSync(join(fixtureRoot, "docs/decisions"), { recursive: true });
    writeFileSync(join(fixtureRoot, "AGENTS.md"), "# Agent guide\n");
    writeFileSync(
      join(fixtureRoot, ".agents/skills/example/SKILL.md"),
      "---\nname: example\ndescription: Example skill.\n---\n"
    );
    writeFileSync(
      join(fixtureRoot, "docs/decisions/current.md"),
      "- [Example](example.md): Current example decision.\n"
    );
    gitFixture(fixtureRoot, ["init", "-q"]);
    gitFixture(fixtureRoot, ["add", "."]);
    gitFixture(fixtureRoot, [
      "-c",
      "user.name=Meelni Test",
      "-c",
      "user.email=test@invalid.example",
      "commit",
      "-qm",
      "fixture",
    ]);
    writeFileSync(join(fixtureRoot, "AGENTS.md"), "# Updated agent guide\n");

    const output = JSON.parse(
      execFileSync(
        process.execPath,
        [`${skillRoot}/scripts/orient.mjs`, fixtureRoot],
        { encoding: "utf8" }
      )
    );

    assert.deepEqual(output.repository.changedPaths.items, ["AGENTS.md"]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("orientation enforces its byte budget for adversarial repository metadata", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "meelni-start-bounded-"));
  try {
    mkdirSync(join(fixtureRoot, ".agents/skills"), { recursive: true });
    mkdirSync(join(fixtureRoot, "docs/decisions"), { recursive: true });
    mkdirSync(join(fixtureRoot, "openspec/changes"), { recursive: true });
    writeFileSync(join(fixtureRoot, "AGENTS.md"), "# Agent guide\n");

    for (let index = 0; index < 40; index += 1) {
      const name = `example-skill-${String(index).padStart(2, "0")}`;
      mkdirSync(join(fixtureRoot, ".agents/skills", name), { recursive: true });
      writeFileSync(
        join(fixtureRoot, ".agents/skills", name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Example skill.\n---\n`
      );

      const dirtyPath = join(
        fixtureRoot,
        "dirty",
        `path-${String(index).padStart(2, "0")}.txt`
      );
      mkdirSync(join(fixtureRoot, "dirty"), { recursive: true });
      writeFileSync(dirtyPath, "original\n");

      const changeName = `change-${String(index).padStart(2, "0")}`;
      mkdirSync(join(fixtureRoot, "openspec/changes", changeName), {
        recursive: true,
      });
    }

    const longComponent = `nested-${"x".repeat(180)}`;
    const longPath = join(
      fixtureRoot,
      "dirty",
      longComponent,
      longComponent,
      "long-path.txt"
    );
    mkdirSync(join(longPath, ".."), { recursive: true });
    writeFileSync(longPath, "original\n");

    const decisions = Array.from({ length: 40 }, (_, index) => {
      const summary = index === 0 ? "x".repeat(12_000) : "Current decision.";
      return `- [Decision ${index}](decision-${index}.md): ${summary}`;
    });
    writeFileSync(
      join(fixtureRoot, "docs/decisions/current.md"),
      `${decisions.join("\n")}\n`
    );

    gitFixture(fixtureRoot, ["init", "-q"]);
    gitFixture(fixtureRoot, ["add", "."]);
    gitFixture(fixtureRoot, [
      "-c",
      "user.name=Meelni Test",
      "-c",
      "user.email=test@invalid.example",
      "commit",
      "-qm",
      "fixture",
    ]);
    for (let index = 0; index < 40; index += 1) {
      writeFileSync(
        join(
          fixtureRoot,
          "dirty",
          `path-${String(index).padStart(2, "0")}.txt`
        ),
        "updated\n"
      );
    }
    writeFileSync(longPath, "updated\n");

    const rawOutput = execFileSync(
      process.execPath,
      [`${skillRoot}/scripts/orient.mjs`, fixtureRoot],
      { encoding: "utf8" }
    );
    const output = JSON.parse(rawOutput);

    assert.ok(Buffer.byteLength(rawOutput) <= output.serialization.maxBytes);
    assert.equal(output.serialization.truncated, true);
    assert.equal(output.repository.changedPaths.count, 41);
    assert.equal(output.repository.changedPaths.items.length, 32);
    assert.equal(output.repository.changedPaths.truncated, true);
    assert.equal(
      output.repository.changedPaths.count -
        output.repository.changedPaths.items.length,
      9
    );
    assert.equal(output.repository.changedPaths.valuesTruncated, 1);
    assert.equal(output.activeOpenSpecChanges.count, 40);
    assert.equal(output.activeOpenSpecChanges.truncated, true);
    assert.equal(output.currentDecisions.count, 40);
    assert.equal(output.currentDecisions.truncated, true);
    assert.ok(output.currentDecisions.valuesTruncated >= 1);
    assert.equal(output.skills.count, 40);
    assert.equal(output.skills.truncated, true);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function gitFixture(cwd, args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
