import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const files = {
  linearSkill: ".agents/skills/meelni-linear-workstream/SKILL.md",
  prPrepSkill: ".agents/skills/meelni-pr-prep/SKILL.md",
  toolingDocs: "docs/operations/tooling.md",
};
const codexEnvironment = readFileSync(
  ".codex/environments/environment.toml",
  "utf8"
);
const localSetup = readFileSync("scripts/setup-local.mjs", "utf8");

test("agent workflow docs protect long-running parent issues from child PR auto-close drift", () => {
  for (const [label, path] of Object.entries(files)) {
    const text = readFileSync(path, "utf8");

    assert.match(
      text,
      /long-running owner-gated parent|long-running owner-gated relaunch work/i,
      `${label} should name the long-running owner-gated parent concept`,
    );
    assert.match(
      text,
      /child issue|PR-sized child/i,
      `${label} should direct repo-only increments at child issues`,
    );
    assert.match(
      text,
      /closes|fixes|resolves/i,
      `${label} should warn about terminal PR keywords`,
    );
    assert.match(
      text,
      /remain[s]? open|non-terminal|prematurely/i,
      `${label} should keep the parent open until its own criteria are met`,
    );
  }
});

test("Codex worktree setup does not require provider credentials", () => {
  const setupScript = codexEnvironment.match(
    /\[setup\]\s+script = '''([\s\S]*?)'''/
  )?.[1];

  assert.ok(setupScript, "Codex environment should define a setup script");
  assert.match(
    setupScript,
    /MEELNI_SKIP_ENV_PULL=1 npm run setup:local/,
    "worktree bootstrap should install locally without pulling provider credentials"
  );
  assert.doesNotMatch(
    setupScript,
    /npm run doctor/,
    "strict runtime checks belong to the explicit Env Check action"
  );
  assert.match(
    codexEnvironment,
    /name = "Pull Env"[\s\S]*?--project meelni --scope meelni[\s\S]*?npm run env:pull[\s\S]*?npm run doctor/,
    "the environment should retain an explicit credential refresh action"
  );
  assert.match(
    localSetup,
    /"--project",\s+"meelni",\s+"--scope",\s+"meelni"/,
    "automatic Vercel linking should target the canonical Meelni team"
  );
  assert.match(
    codexEnvironment,
    /name = "Env Check"[\s\S]*?npm run doctor[\s\S]*?npm run validate:env/,
    "the environment should retain an explicit strict runtime check"
  );
});
