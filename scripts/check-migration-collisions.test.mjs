import assert from "node:assert/strict";
import test from "node:test";

import {
  detectMigrationCollisions,
  evaluateMigrationInventories,
  inventoryPullRequestMigrations,
  parseDrizzleMigrationPath,
} from "./check-migration-collisions.mjs";

function pullRequest(number, sha = String(number).padStart(40, "a")) {
  return {
    number,
    state: "open",
    head: { sha: sha.slice(-40), ref: `branch-${number}` },
    base: { ref: "main" },
  };
}

test("parses only direct numeric Drizzle SQL migration paths", () => {
  assert.deepEqual(
    parseDrizzleMigrationPath("lib/db/migrations/0008_interview_recovery.sql"),
    {
      sequence: "0008",
      name: "interview_recovery",
      path: "lib/db/migrations/0008_interview_recovery.sql",
    }
  );
  assert.equal(
    parseDrizzleMigrationPath("lib/db/migrations/meta/0008_snapshot.json"),
    null
  );
  assert.equal(
    parseDrizzleMigrationPath("supabase/migrations/20260711000001_contact.sql"),
    null
  );
  assert.equal(parseDrizzleMigrationPath("lib/db/migrations/notes.md"), null);
  assert.equal(
    parseDrizzleMigrationPath("lib/db/migrations/0008_bad\nsummary.sql"),
    null
  );
});

test("inventory counts every non-removed changed migration as ownership", () => {
  const result = inventoryPullRequestMigrations({
    pullRequest: pullRequest(10, "a".repeat(40)),
    files: [
      {
        filename: "lib/db/migrations/0009_new.sql",
        status: "added",
      },
      {
        filename: "lib/db/migrations/0010_renumbered.sql",
        status: "renamed",
        previous_filename: "lib/db/migrations/0009_old.sql",
      },
      {
        filename: "lib/db/migrations/0007_existing.sql",
        status: "modified",
      },
      {
        filename: "lib/db/migrations/0011_copied.sql",
        status: "copied",
      },
      {
        filename: "lib/db/migrations/meta/0009_snapshot.json",
        status: "added",
      },
    ],
  });
  assert.deepEqual(
    result.migrations.map((migration) => migration.sequence),
    ["0007", "0009", "0010", "0011"]
  );
  assert.deepEqual(result.violations, [
    {
      type: "migration_history_renamed_away",
      path: "lib/db/migrations/0009_old.sql",
      sequence: "0009",
      replacementPath: "lib/db/migrations/0010_renumbered.sql",
    },
  ]);
});

test("removed and renamed-away migration history fail closed", () => {
  const removed = inventoryPullRequestMigrations({
    pullRequest: pullRequest(15, "a".repeat(40)),
    files: [
      {
        filename: "lib/db/migrations/0006_history.sql",
        status: "removed",
      },
    ],
  });
  const renamed = inventoryPullRequestMigrations({
    pullRequest: pullRequest(16, "b".repeat(40)),
    files: [
      {
        filename: "lib/db/migrations/0016_replacement.sql",
        previous_filename: "lib/db/migrations/0007_history.sql",
        status: "renamed",
      },
    ],
  });
  const results = evaluateMigrationInventories([removed, renamed]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fail", "fail"]
  );
  assert.equal(results[0].violations[0].type, "migration_history_removed");
  assert.equal(results[1].violations[0].type, "migration_history_renamed_away");
});

test("detects sibling and standalone PRs owning the same numeric sequence", () => {
  const inventories = [
    inventoryPullRequestMigrations({
      pullRequest: pullRequest(20, "b".repeat(40)),
      files: [
        {
          filename: "lib/db/migrations/0008_demo.sql",
          status: "added",
        },
      ],
    }),
    inventoryPullRequestMigrations({
      pullRequest: {
        ...pullRequest(21, "c".repeat(40)),
        base: { ref: "feature-parent" },
      },
      files: [
        {
          filename: "lib/db/migrations/8_contact.sql",
          status: "modified",
        },
      ],
    }),
  ];
  const collisions = detectMigrationCollisions(inventories);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].sequence, "0008");
  assert.deepEqual(
    collisions[0].owners.map((owner) => owner.pr),
    [20, 21]
  );
  const results = evaluateMigrationInventories(inventories);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fail", "fail"]
  );
});

test("detects two different files with the same sequence inside one PR", () => {
  const inventory = inventoryPullRequestMigrations({
    pullRequest: pullRequest(30, "d".repeat(40)),
    files: [
      {
        filename: "lib/db/migrations/0012_first.sql",
        status: "added",
      },
      {
        filename: "lib/db/migrations/0012_second.sql",
        status: "added",
      },
    ],
  });
  const [result] = evaluateMigrationInventories([inventory]);
  assert.equal(result.status, "fail");
  assert.equal(result.collisions[0].owners.length, 2);
});

test("marks unique owners pass and non-migration PRs not applicable", () => {
  const results = evaluateMigrationInventories([
    inventoryPullRequestMigrations({
      pullRequest: pullRequest(40, "e".repeat(40)),
      files: [
        {
          filename: "lib/db/migrations/0013_unique.sql",
          status: "added",
        },
      ],
    }),
    inventoryPullRequestMigrations({
      pullRequest: pullRequest(41, "f".repeat(40)),
      files: [{ filename: "app/page.tsx", status: "modified" }],
    }),
  ]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["pass", "not_applicable"]
  );
});

test("malformed pull requests, files, and inventories fail closed", () => {
  assert.throws(
    () => inventoryPullRequestMigrations({ pullRequest: {}, files: [] }),
    /migration_collision_pull_request_invalid/
  );
  assert.throws(
    () =>
      inventoryPullRequestMigrations({
        pullRequest: pullRequest(50, "a".repeat(40)),
        files: [{}],
      }),
    /migration_collision_file_invalid/
  );
  assert.throws(
    () => detectMigrationCollisions([{ pr: 50, migrations: [{}] }]),
    /migration_collision_inventory_invalid/
  );
});
