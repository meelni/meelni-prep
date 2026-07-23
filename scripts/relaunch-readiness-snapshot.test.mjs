import assert from "node:assert/strict";
import test from "node:test";

import {
  V6_LEDGER_REF,
  buildRelaunchReadinessSnapshot,
} from "./relaunch-readiness-snapshot.mjs";

test("relaunch readiness snapshot reports clean queue and exact v6 guardrails", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    now: new Date("2026-07-23T04:00:00.000Z"),
    runCommand: fixtureRunner({
      ledgerRefPresent: true,
      rulesetsExact: true,
    }),
  });

  assert.equal(snapshot.generatedAt, "2026-07-23T04:00:00.000Z");
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.launchAuthority.launchGoNoGoOwnerOnly, true);
  assert.equal(snapshot.launchAuthority.relaunchDefaultOnAuthorized, false);
  assert.equal(snapshot.launchAuthority.providerMutationAuthorized, false);
  assert.equal(snapshot.git.localMatchesOriginMain, true);
  assert.equal(snapshot.git.dirty, false);
  assert.equal(snapshot.github.queueClean, true);
  assert.equal(snapshot.github.openPullRequestCount, 0);
  assert.equal(snapshot.github.openIssueCount, 0);
  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, true);
  assert.equal(snapshot.calibrationV6Guardrails.ledgerRef.present, true);
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    true
  );
});

test("relaunch readiness snapshot tolerates an absent v6 ledger ref", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: false,
      rulesetsExact: true,
    }),
  });

  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, true);
  assert.equal(snapshot.calibrationV6Guardrails.ledgerRef.present, false);
  assert.equal(snapshot.calibrationV6Guardrails.ledgerRef.reason, "not_found");
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

test("relaunch readiness snapshot marks non-exact rulesets as not ready", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: true,
      rulesetsExact: false,
    }),
  });

  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, false);
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.activationActor.exact,
    false
  );
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

test("relaunch readiness snapshot rejects a non-user activation bypass actor", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: true,
      rulesetsExact: true,
      activationActorType: "RepositoryRole",
    }),
  });

  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, false);
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.activationActor.exact,
    false
  );
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

test("relaunch readiness snapshot fetches detailed rulesets before exactness checks", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: false,
      rulesetsExact: true,
      rulesetListSummariesOnly: true,
    }),
  });

  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, true);
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.ledgerImmutable.exact,
    true
  );
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.activationActor.exact,
    true
  );
  assert.equal(snapshot.calibrationV6Guardrails.ledgerRef.present, false);
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

test("relaunch readiness snapshot fails closed when ruleset detail fetch fails", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: true,
      rulesetsExact: true,
      rulesetListSummariesOnly: true,
      rulesetDetailLookupFails: true,
    }),
  });

  assert.equal(snapshot.calibrationV6Guardrails.rulesets.allExact, false);
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.ledgerImmutable.exact,
    false
  );
  assert.equal(
    snapshot.calibrationV6Guardrails.rulesets.required.ledgerImmutable
      .detailLookupFailed,
    true
  );
  assert.equal(
    snapshot.calibrationV6Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

function fixtureRunner({
  ledgerRefPresent,
  rulesetsExact,
  activationActorType = "User",
  rulesetListSummariesOnly = false,
  rulesetDetailLookupFails = false,
}) {
  return async (file, args) => {
    const command = [file, ...args].join(" ");

    if (command === "git rev-parse --abbrev-ref HEAD") {
      return "main\n";
    }
    if (command === "git rev-parse HEAD") {
      return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n";
    }
    if (command === "git rev-parse origin/main") {
      return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n";
    }
    if (command === "git status --porcelain") {
      return "";
    }
    if (command.startsWith("gh pr list ")) {
      return "[]";
    }
    if (command.startsWith("gh issue list ")) {
      return "[]";
    }
    if (command.includes("/rulesets?")) {
      const rulesets = buildRulesets({
        exact: rulesetsExact,
        activationActorType,
      });
      return JSON.stringify(
        rulesetListSummariesOnly ? rulesets.map(toRulesetSummary) : rulesets
      );
    }
    if (command.includes("/rulesets/")) {
      if (rulesetDetailLookupFails) {
        const error = new Error("HTTP 404: Not Found");
        error.stderr = "Not Found";
        throw error;
      }

      const id = Number(command.match(/\/rulesets\/(\d+)/)?.[1]);
      const ruleset = buildRulesets({
        exact: rulesetsExact,
        activationActorType,
      }).find((candidate) => candidate.id === id);

      if (!ruleset) {
        const error = new Error("HTTP 404: Not Found");
        error.stderr = "Not Found";
        throw error;
      }

      return JSON.stringify(ruleset);
    }
    if (command.includes("/git/ref/heads/meelni-ledger/")) {
      if (!ledgerRefPresent) {
        const error = new Error("HTTP 404: Not Found");
        error.stderr = "Not Found";
        throw error;
      }

      return JSON.stringify({
        ref: V6_LEDGER_REF,
        object: {
          sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          type: "commit",
        },
      });
    }

    throw new Error(`Unexpected command: ${command}`);
  };
}

function toRulesetSummary(ruleset) {
  return {
    id: ruleset.id,
    name: ruleset.name,
    target: ruleset.target,
    enforcement: ruleset.enforcement,
    conditions: null,
    bypass_actors: null,
    rules: null,
  };
}

function buildRulesets({ exact, activationActorType }) {
  return [
    {
      id: 101,
      name: "Meelni SAV-248 v6 calibration ledger immutable",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: [V6_LEDGER_REF],
          exclude: [],
        },
      },
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
    {
      id: 102,
      name: "Meelni SAV-248 v6 calibration activation actor",
      target: "branch",
      enforcement: exact ? "active" : "evaluate",
      conditions: {
        ref_name: {
          include: [V6_LEDGER_REF],
          exclude: [],
        },
      },
      bypass_actors: [
        {
          actor_id: 24397508,
          actor_type: activationActorType,
          bypass_mode: "always",
        },
      ],
      rules: [{ type: "creation" }, { type: "update" }],
    },
  ];
}
