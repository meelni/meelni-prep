import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const JOURNAL_PATH = "lib/db/migrations/meta/_journal.json";
const HISTORY_PATH = "docs/operations/migration-history.md";
const RUNBOOK_PATH = "docs/operations/runtime-transcript-ingest.md";
const TRANSCRIPT_CONTRACT_PATH = "docs/contracts/transcript-events.md";
const LIFECYCLE_CONTRACT_PATH = "docs/contracts/interview-session-lifecycle.md";
const COMPLETION_CONTRACT_PATH =
  "docs/contracts/interview-session-completion.md";
const ROOM_METADATA_CONTRACT_PATH = "docs/contracts/livekit-room-metadata.md";
const RECONNECT_RUNBOOK_PATH = "docs/operations/interview-session-reconnect.md";
const DEADLINE_RUNBOOK_PATH = "docs/operations/interview-session-deadline.md";
const SUPABASE_MIGRATION_DIRECTORY = "supabase/migrations";

test("migration operations docs match the ordered Drizzle journal", async () => {
  const [
    journalRaw,
    history,
    runbook,
    transcriptContract,
    lifecycleContract,
    completionContract,
    roomMetadataContract,
    reconnectRunbook,
    deadlineRunbook,
  ] = await Promise.all([
    readFile(JOURNAL_PATH, "utf8"),
    readFile(HISTORY_PATH, "utf8"),
    readFile(RUNBOOK_PATH, "utf8"),
    readFile(TRANSCRIPT_CONTRACT_PATH, "utf8"),
    readFile(LIFECYCLE_CONTRACT_PATH, "utf8"),
    readFile(COMPLETION_CONTRACT_PATH, "utf8"),
    readFile(ROOM_METADATA_CONTRACT_PATH, "utf8"),
    readFile(RECONNECT_RUNBOOK_PATH, "utf8"),
    readFile(DEADLINE_RUNBOOK_PATH, "utf8"),
  ]);
  const journal = JSON.parse(journalRaw);
  const entries = journal.entries;
  const section = history.match(
    /<!-- migration-journal:start -->([\s\S]*?)<!-- migration-journal:end -->/
  );

  assert.ok(section, "migration history must contain its journal inventory");
  const documentedTags = Array.from(
    section[1].matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|$/gm),
    (match) => match[1]
  );
  const journalTags = entries.map((entry) => entry.tag);

  assert.deepEqual(documentedTags, journalTags);
  assert.equal(entries.length, 39);
  assert.equal(
    entries.at(-1).tag,
    "0038_sav_440_verified_prefix_partial_scorecards"
  );
  assert.match(history, /thirty-nine-entry inventory/);
  assert.match(runbook, /thirty-nine-entry schema\s+preflight/);
  assert.match(
    runbook,
    /through\s+`0038_sav_440_verified_prefix_partial_scorecards`/
  );
  assert.match(runbook, /isolated `meelni-preview` Supabase project/);
  assert.match(
    await readFile("docs/operations/database-migrations.md", "utf8"),
    /thirty-nine\s+ledger entries, 41\s+RLS-enabled tables/i
  );
  assert.match(
    await readFile("docs/operations/database-migrations.md", "utf8"),
    /strict preflight[\s\S]*migrationCount: 39[\s\S]*3ff3223a059e3dd0f8891745f7fd06ff178fb95ae7bbe81de824515b24a2799b/i
  );

  assert.match(history, /`transcript_runtime_writer` registry/);
  assert.match(history, /every registered writer generation/);
  assert.match(history, /standalone Supabase helpers/);
  assert.match(history, /no doctor, runbook, rollback, or deployment path/i);
  assert.match(transcriptContract, /`writer_generation`/);
  assert.match(transcriptContract, /before producing any audible output/i);
  assert.match(transcriptContract, /every registered generation/i);
  assert.match(transcriptContract, /semantic cutoff `D`/);
  assert.match(transcriptContract, /reserves\s+control capacity/i);
  assert.match(runbook, /before audible output/i);
  assert.match(runbook, /reserves one control slot/i);
  assert.match(runbook, /before room\s+deletion/i);
  assert.match(
    lifecycleContract,
    /reliable trusted metadata-only settlement request/i
  );
  assert.match(lifecycleContract, /before room deletion/i);
  assert.match(completionContract, /every registered\s+generation/i);
  assert.match(completionContract, /before deleting the room/i);
  assert.match(
    roomMetadataContract,
    /awaits durable acknowledgement before room deletion/i
  );
  assert.match(
    reconnectRunbook,
    /reliable\s+trusted metadata-only settlement request/i
  );
  assert.match(reconnectRunbook, /room deletion only afterward/i);
  assert.match(deadlineRunbook, /no evidence at\s+`D \+ 1ms` is accepted/i);

  for (const document of [lifecycleContract, reconnectRunbook]) {
    assert.doesNotMatch(
      document,
      /room deletion, waits a bounded two seconds/i
    );
    assert.doesNotMatch(document, /two-second transcript drain/i);
  }
});

test("Supabase RLS migrations recreate policies through replay-safe guards", async () => {
  const migrationFileNames = (await readdir(SUPABASE_MIGRATION_DIRECTORY))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const createPolicyPattern =
    /CREATE POLICY "([^"]+)"\s+ON ([a-z_][a-z0-9_]*)/gi;
  const createdPolicies = [];

  for (const fileName of migrationFileNames) {
    const path = `${SUPABASE_MIGRATION_DIRECTORY}/${fileName}`;
    const migration = await readFile(path, "utf8");

    for (const match of migration.matchAll(createPolicyPattern)) {
      createdPolicies.push({ name: match[1], path, table: match[2] });
    }

    for (const { name, table } of createdPolicies.filter(
      (policy) => policy.path === path
    )) {
      assert.match(
        migration,
        new RegExp(
          `DROP POLICY IF EXISTS "${escapeForRegex(name)}" ON ${table};[\\s\\S]*?CREATE POLICY "${escapeForRegex(name)}"\\s+ON ${table}`,
          "i"
        ),
        `${path}: ${name} on ${table} must be dropped before it is recreated`
      );
    }
  }

  assert.ok(createdPolicies.length > 0);
});

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
