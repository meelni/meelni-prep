import assert from "node:assert/strict";
import test from "node:test";

import {
  V4_LEDGER_REF,
  buildRelaunchReadinessSnapshot,
} from "./relaunch-readiness-snapshot.mjs";

test("relaunch readiness snapshot reports clean queue and exact v4 guardrails", async () => {
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
  assert.equal(snapshot.calibrationV4Guardrails.rulesets.allExact, true);
  assert.equal(snapshot.calibrationV4Guardrails.ledgerRef.present, true);
  assert.equal(
    snapshot.calibrationV4Guardrails.readyForOwnerAuthorizedCalibration,
    true
  );
});

test("relaunch readiness snapshot tolerates an absent v4 ledger ref", async () => {
  const snapshot = await buildRelaunchReadinessSnapshot({
    fetch: false,
    runCommand: fixtureRunner({
      ledgerRefPresent: false,
      rulesetsExact: true,
    }),
  });

  assert.equal(snapshot.calibrationV4Guardrails.rulesets.allExact, true);
  assert.equal(snapshot.calibrationV4Guardrails.ledgerRef.present, false);
  assert.equal(snapshot.calibrationV4Guardrails.ledgerRef.reason, "not_found");
  assert.equal(
    snapshot.calibrationV4Guardrails.readyForOwnerAuthorizedCalibration,
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

  assert.equal(snapshot.calibrationV4Guardrails.rulesets.allExact, false);
  assert.equal(
    snapshot.calibrationV4Guardrails.rulesets.required.activationActor.exact,
    false
  );
  assert.equal(
    snapshot.calibrationV4Guardrails.readyForOwnerAuthorizedCalibration,
    false
  );
});

function fixtureRunner({ ledgerRefPresent, rulesetsExact }) {
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
      return JSON.stringify(buildRulesets({ exact: rulesetsExact }));
    }
    if (command.includes("/git/ref/heads/meelni-ledger/")) {
      if (!ledgerRefPresent) {
        const error = new Error("HTTP 404: Not Found");
        error.stderr = "Not Found";
        throw error;
      }

      return JSON.stringify({
        ref: V4_LEDGER_REF,
        object: {
          sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          type: "commit",
        },
      });
    }

    throw new Error(`Unexpected command: ${command}`);
  };
}

function buildRulesets({ exact }) {
  return [
    {
      id: 101,
      name: "Meelni SAV-248 v4 calibration ledger immutable",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: [V4_LEDGER_REF],
          exclude: [],
        },
      },
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    },
    {
      id: 102,
      name: "Meelni SAV-248 v4 calibration activation actor",
      target: "branch",
      enforcement: exact ? "active" : "evaluate",
      conditions: {
        ref_name: {
          include: [V4_LEDGER_REF],
          exclude: [],
        },
      },
      bypass_actors: [
        {
          actor_id: 24397508,
          actor_type: "RepositoryRole",
          bypass_mode: "always",
        },
      ],
      rules: [{ type: "creation" }, { type: "update" }],
    },
  ];
}
