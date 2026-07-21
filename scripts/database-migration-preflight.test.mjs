import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyDatabaseBootstrapCatalog,
  inspectDatabaseBootstrapState,
} from "./database-bootstrap-preflight.mjs";

const productionRef = "productionproject123";
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

test("classifies an absent ledger and exactly empty public schema as a clean bootstrap", async () => {
  const result = await inspectDatabaseBootstrapState(
    catalogTransaction({
      migration_ledger_present: false,
      public_application_relations: 0,
      public_application_objects: 0,
    })
  );

  assert.deepEqual(result, { status: "ready_for_clean_bootstrap" });
});

test("blocks a partial public schema when the ledger is absent", async () => {
  await assert.rejects(
    inspectDatabaseBootstrapState(
      catalogTransaction({
        migration_ledger_present: false,
        public_application_relations: 1,
        public_application_objects: 2,
      })
    ),
    /public application schema is not empty/
  );
});

test("blocks an unexpected non-relation public object when the ledger is absent", () => {
  assert.throws(
    () =>
      classifyDatabaseBootstrapCatalog({
        migration_ledger_present: false,
        public_application_relations: 0,
        public_application_objects: 1,
      }),
    /public application schema is not empty/
  );
});

test("keeps a present ledger on the normal migration preflight path", async () => {
  const result = await inspectDatabaseBootstrapState(
    catalogTransaction({
      migration_ledger_present: true,
      public_application_relations: 29,
      public_application_objects: 120,
    })
  );

  assert.deepEqual(result, { status: "ledger_present" });
});

test("fails closed when the bootstrap catalog query fails or is ambiguous", async () => {
  await assert.rejects(
    inspectDatabaseBootstrapState(async () => {
      throw new Error("provider detail must not escape");
    }),
    new Error("Database preflight could not inspect bootstrap catalog")
  );
  await assert.rejects(
    inspectDatabaseBootstrapState(catalogTransaction({})),
    new Error("Database preflight could not inspect bootstrap catalog")
  );
  await assert.rejects(
    inspectDatabaseBootstrapState(async () => [
      {
        migration_ledger_present: false,
        public_application_relations: 0,
        public_application_objects: 0,
      },
      {
        migration_ledger_present: true,
        public_application_relations: 1,
        public_application_objects: 1,
      },
    ]),
    new Error("Database preflight could not inspect bootstrap catalog")
  );
});

test("Preview preflight rejects a Production-marked canonical env file before connecting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-preflight-identity-"));
  const envFile = join(directory, ".env.local");
  await writeFile(
    envFile,
    [
      `DATABASE_URL=${databaseUrl(productionRef)}`,
      "MEELNI_ENV_PULL_ENVIRONMENT=production",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "VERCEL_ENV=production",
      "",
    ].join("\n")
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        tsxCli,
        new URL("./database-migration-preflight.ts", import.meta.url).pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          MEELNI_ENV_FILE: ".env.local",
        },
        timeout: 10_000,
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 1);
    assert.match(output, /does not match expected preview/);
    assert.doesNotMatch(output, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}

function catalogTransaction(row) {
  return async () => [row];
}
