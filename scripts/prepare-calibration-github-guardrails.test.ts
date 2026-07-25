import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  SAV_248_V15_ACTOR_RULESET_NAME,
  SAV_248_V15_GIT_LEDGER_REF,
  SAV_248_V15_GITHUB_ACTIVATION_ACTOR_ID,
  SAV_248_V15_IMMUTABLE_RULESET_NAME,
} from "@/lib/evaluation/calibration-run-ledger";

import {
  buildSAV248V10GitHubGuardrailPayloads,
  writeSAV248V10GitHubGuardrailPacket,
} from "./prepare-calibration-github-guardrails";

test("builds the exact SAV-248 v15 GitHub ruleset payloads", () => {
  const { immutableRuleset, activationActorRuleset } =
    buildSAV248V10GitHubGuardrailPayloads();

  assert.deepEqual(immutableRuleset, {
    name: SAV_248_V15_IMMUTABLE_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    conditions: {
      ref_name: {
        include: [SAV_248_V15_GIT_LEDGER_REF],
        exclude: [],
      },
    },
    rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    bypass_actors: [],
  });

  assert.deepEqual(activationActorRuleset, {
    name: SAV_248_V15_ACTOR_RULESET_NAME,
    target: "branch",
    enforcement: "active",
    conditions: {
      ref_name: {
        include: [SAV_248_V15_GIT_LEDGER_REF],
        exclude: [],
      },
    },
    rules: [{ type: "creation" }, { type: "update" }],
    bypass_actors: [
      {
        actor_id: SAV_248_V15_GITHUB_ACTIVATION_ACTOR_ID,
        actor_type: "User",
        bypass_mode: "always",
      },
    ],
  });
});

test("writes a non-mutating guardrail packet with owner-approval instructions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-sav198-guardrails-"));
  try {
    await writeSAV248V10GitHubGuardrailPacket(dir, "a".repeat(40));

    const immutable = JSON.parse(
      await readFile(join(dir, "immutable-ruleset-payload.json"), "utf8")
    );
    const activation = JSON.parse(
      await readFile(join(dir, "activation-actor-ruleset-payload.json"), "utf8")
    );
    const readme = await readFile(join(dir, "README.md"), "utf8");

    assert.equal(immutable.name, SAV_248_V15_IMMUTABLE_RULESET_NAME);
    assert.equal(activation.name, SAV_248_V15_ACTOR_RULESET_NAME);
    assert.match(
      readme,
      /Do not apply it without exact\s+owner authorization/i
    );
    assert.match(readme, /Do not manually\s+create the ledger ref/i);
    assert.match(readme, /gh api \\\n  --method POST/i);
    assert.match(readme, new RegExp(SAV_248_V15_GIT_LEDGER_REF));

    assert.equal((await stat(join(dir, "README.md"))).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
