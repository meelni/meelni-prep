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
const agentGuide = readFileSync("AGENTS.md", "utf8");
const localSetup = readFileSync("scripts/setup-local.mjs", "utf8");
const worktreeBootstrap = readFileSync("scripts/bootstrap-worktree.sh", "utf8");

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
    /\. "\$CODEX_WORKTREE_PATH\/scripts\/bootstrap-worktree\.sh"/,
    "Codex should source bootstrap behavior from the target worktree"
  );
  assert.doesNotMatch(
    setupScript,
    /fnm|npm run|vercel|doctor/,
    "the anchor checkout should not embed evolving setup behavior"
  );
  assert.match(
    codexEnvironment,
    /name = "Pull Env"[\s\S]*?--project meelni --scope meelni[\s\S]*?npm run env:pull[\s\S]*?npm run doctor:runtime/,
    "the environment should retain an explicit credential refresh action"
  );
  assert.doesNotMatch(
    localSetup,
    /vercel|env:pull|MEELNI_SKIP_ENV_PULL/,
    "ordinary local setup should never depend on provider credential refresh"
  );
  assert.match(
    worktreeBootstrap,
    /npm run setup:local[\s\S]*?npm run doctor:setup/,
    "target-worktree bootstrap should install and verify provider-free setup readiness"
  );
  assert.match(
    agentGuide,
    /fresh local worktrees, run `npm run bootstrap:worktree`/,
    "agent guidance should use the complete worktree bootstrap"
  );
  assert.match(
    codexEnvironment,
    /name = "Env Check"[\s\S]*?npm run doctor:runtime[\s\S]*?npm run validate:env/,
    "the environment should retain an explicit strict runtime check"
  );
});
