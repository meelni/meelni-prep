import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DECISION = "docs/decisions/2026-07-13-human-owned-launch-decision.md";

async function source(file) {
  return readFile(new URL(`../${file}`, import.meta.url), "utf8");
}

test("active relaunch guidance reserves launch authority for the product owner", async () => {
  const [agents, prd, tooling, decision, current, log] = await Promise.all([
    source("AGENTS.md"),
    source(".claude/PRD.md"),
    source("docs/operations/tooling.md"),
    source(DECISION),
    source("docs/decisions/current.md"),
    source("docs/decisions/decision-log.md"),
  ]);

  assert.match(
    agents,
    /Only the human product owner makes the final launch GO\/NO-GO/
  );
  assert.match(
    agents,
    /must not infer the owner's decision or authorize default-on/
  );

  assert.match(
    prd,
    /Only the human product owner makes the final launch GO\/NO-GO for the exact candidate/
  );
  assert.match(prd, /passing criteria alone does not authorize the change/);

  assert.match(tooling, /product owner's explicit GO/);
  assert.match(
    tooling,
    /Passing technical gates alone does not authorize that change/
  );

  assert.match(decision, /^Status: accepted$/m);
  assert.match(
    decision,
    /Absence of GO is a rollout state, not an inferred owner NO-GO/
  );
  assert.match(decision, /authorizing bounded spend does not imply launch GO/);
  assert.match(decision, /separately authorized launch action/);

  for (const index of [current, log]) {
    assert.match(index, /Human-Owned Launch Decision/);
    assert.match(
      index,
      new RegExp(DECISION.split("/").at(-1).replaceAll(".", "\\."))
    );
  }
});

test("readiness evidence remains distinct from an owner launch decision", async () => {
  const decision = await source(DECISION);

  assert.match(decision, /launch-readiness recommendation/);
  assert.match(decision, /owner decision: pending/);
  assert.match(decision, /Passing them\s+does not create a launch decision/);
  assert.match(decision, /None can approve launch/);
});
