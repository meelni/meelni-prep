import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getDatabaseCommandPolicy } from "./database-command.mjs";

const local = "postgresql://postgres:postgres@127.0.0.1:5432/meelni_test";
const remote = "postgresql://postgres:secret@db.example.invalid:5432/postgres";
const pooler =
  "postgresql://postgres:secret@aws.example.pooler.invalid:6543/postgres";
const sessionPooler =
  "postgresql://postgres:secret@aws.example.pooler.invalid:5432/postgres";

test("database commands allow normal local development", () => {
  for (const command of ["migrate", "push", "studio"]) {
    assert.equal(
      getDatabaseCommandPolicy({ command, databaseUrl: local }).allowed,
      true
    );
  }
});

test("database commands never allow schema push against shared targets", () => {
  const policy = getDatabaseCommandPolicy({
    command: "push",
    databaseUrl: remote,
    envFile: ".env.production.local",
    allowRemoteMigration: true,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /forbidden/);
});

test("remote migrations require explicit env selection and confirmation", () => {
  assert.equal(
    getDatabaseCommandPolicy({ command: "migrate", databaseUrl: remote })
      .allowed,
    false
  );
  assert.equal(
    getDatabaseCommandPolicy({
      command: "migrate",
      databaseUrl: remote,
      envFile: ".env.production.local",
      allowRemoteMigration: true,
    }).allowed,
    true
  );
});

test("migrations reject transaction pooler connections", () => {
  const policy = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: pooler,
    envFile: ".env.production.local",
    allowRemoteMigration: true,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /direct or session/);
});

test("migrations allow explicitly selected session pooler connections", () => {
  const policy = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: sessionPooler,
    envFile: ".env.production.local",
    allowRemoteMigration: true,
  });
  assert.equal(policy.allowed, true);
});

test("a missing explicit env file fails closed despite an ambient database URL", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("./database-command.mjs", import.meta.url).pathname, "migrate"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: local,
        MEELNI_ENV_FILE: join(tmpdir(), "meelni-env-does-not-exist"),
      },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Could not load explicitly selected env file/);
});

test("an explicit env file wins over an ambient database URL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-db-env-"));
  const envFile = join(directory, ".env.production.local");
  await writeFile(envFile, `DATABASE_URL=${remote}\n`);
  try {
    const result = spawnSync(
      process.execPath,
      [new URL("./database-command.mjs", import.meta.url).pathname, "push"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: local,
          MEELNI_ENV_FILE: envFile,
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /db:push is forbidden/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
