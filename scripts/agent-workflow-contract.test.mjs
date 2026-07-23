import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const files = {
  linearSkill: ".agents/skills/meelni-linear-workstream/SKILL.md",
  prPrepSkill: ".agents/skills/meelni-pr-prep/SKILL.md",
  toolingDocs: "docs/operations/tooling.md",
};

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
