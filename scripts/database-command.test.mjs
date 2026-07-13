import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  databaseTargetSha256,
  getDatabaseCommandPolicy,
  runDatabaseCommand,
} from "./database-command.mjs";

const local = "postgresql://postgres:postgres@127.0.0.1:5432/meelni_test";
const previewRef = "previewprojectref123";
const productionRef = "productionproject123";
const remote = databaseUrl(previewRef, 5432);
const pooler = databaseUrl(previewRef, 6543);
const sessionPooler = databaseUrl(previewRef, 5432);

test("database commands allow normal local development", () => {
  for (const command of ["migrate", "push", "studio"]) {
    assert.equal(
      getDatabaseCommandPolicy({ command, databaseUrl: local }).allowed,
      true
    );
  }
});

test("database authorization target distinguishes Supabase project usernames", () => {
  assert.notEqual(
    databaseTargetSha256(databaseUrl(previewRef, 5432)),
    databaseTargetSha256(databaseUrl(productionRef, 5432))
  );
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
      envFile: ".env.local",
      allowRemoteMigration: true,
      environment: "preview",
      expectedEnvironment: "preview",
      productionProjectRef: productionRef,
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
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /direct or session/);
});

test("migrations allow explicitly selected session pooler connections", () => {
  const policy = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: sessionPooler,
    envFile: ".env.local",
    allowRemoteMigration: true,
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
  });
  assert.equal(policy.allowed, true);

  const productionPolicy = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: databaseUrl(productionRef, 5432),
    envFile: ".env.production.local",
    allowRemoteMigration: true,
    environment: "production",
    expectedEnvironment: "production",
    productionProjectRef: productionRef,
  });
  assert.equal(productionPolicy.allowed, true);
  assert.equal(productionPolicy.reason, "verified_production");
});

test("Production Studio is forbidden even with the remote Studio opt-in", () => {
  const policy = getDatabaseCommandPolicy({
    command: "studio",
    databaseUrl: databaseUrl(productionRef, 5432),
    envFile: ".env.production.local",
    allowRemoteStudio: true,
    environment: "production",
    expectedEnvironment: "production",
    productionProjectRef: productionRef,
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /Production Studio is forbidden/);

  const previewPolicy = getDatabaseCommandPolicy({
    command: "studio",
    databaseUrl: databaseUrl(previewRef, 5432),
    envFile: ".env.local",
    allowRemoteStudio: true,
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
  });
  assert.equal(previewPolicy.allowed, true);
});

test("remote migrations fail closed on missing or mismatched environment identity", () => {
  const missingDeclaration = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: remote,
    envFile: ".env.local",
    allowRemoteMigration: true,
    environment: "preview",
    expectedEnvironment: "preview",
  });
  assert.equal(missingDeclaration.allowed, false);
  assert.match(
    missingDeclaration.reason,
    /MEELNI_PRODUCTION_SUPABASE_PROJECT_REF/
  );

  const previewTargetsProduction = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: databaseUrl(productionRef, 5432),
    envFile: ".env.local",
    allowRemoteMigration: true,
    environment: "preview",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
  });
  assert.equal(previewTargetsProduction.allowed, false);
  assert.match(previewTargetsProduction.reason, /Preview database target/);

  const productionTargetsPreview = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: remote,
    envFile: ".env.production.local",
    allowRemoteMigration: true,
    environment: "production",
    expectedEnvironment: "production",
    productionProjectRef: productionRef,
  });
  assert.equal(productionTargetsPreview.allowed, false);
  assert.match(productionTargetsPreview.reason, /Production database target/);
});

test("remote migrations bind the canonical env file to its expected environment", () => {
  const policy = getDatabaseCommandPolicy({
    command: "migrate",
    databaseUrl: databaseUrl(productionRef, 5432),
    envFile: ".env.local",
    allowRemoteMigration: true,
    environment: "production",
    expectedEnvironment: "preview",
    productionProjectRef: productionRef,
    vercelEnvironment: "preview",
  });
  assert.equal(policy.allowed, false);
  assert.match(policy.reason, /does not match expected preview/);
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

test("the selected env file supplies remote migration identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-db-identity-"));
  const envFile = join(directory, ".env.local");
  await writeFile(
    envFile,
    [
      `DATABASE_URL=${databaseUrl(productionRef, 5432)}`,
      "MEELNI_ENV_PULL_ENVIRONMENT=preview",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "",
    ].join("\n")
  );
  try {
    const result = spawnSync(
      process.execPath,
      [new URL("./database-command.mjs", import.meta.url).pathname, "migrate"],
      {
        encoding: "utf8",
        cwd: directory,
        env: {
          ...process.env,
          DATABASE_URL: local,
          MEELNI_ALLOW_REMOTE_MIGRATION: "1",
          MEELNI_ENV_FILE: ".env.local",
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Preview database target matches/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the Preview migration alias rejects a Production-marked env file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-db-file-marker-"));
  await writeFile(
    join(directory, ".env.local"),
    [
      `DATABASE_URL=${databaseUrl(productionRef, 5432)}`,
      "MEELNI_ENV_PULL_ENVIRONMENT=production",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "VERCEL_ENV=production",
      "",
    ].join("\n")
  );
  try {
    const result = spawnSync(
      process.execPath,
      [new URL("./database-command.mjs", import.meta.url).pathname, "migrate"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          MEELNI_ALLOW_REMOTE_MIGRATION: "1",
          MEELNI_ENV_FILE: ".env.local",
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match expected preview/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a selected env file cannot persist remote migration authorization", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-db-allow-flag-"));
  await writeFile(
    join(directory, ".env.production.local"),
    [
      `DATABASE_URL=${databaseUrl(productionRef, 5432)}`,
      "MEELNI_ALLOW_REMOTE_MIGRATION=1",
      "MEELNI_ENV_PULL_ENVIRONMENT=production",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "VERCEL_ENV=production",
      "",
    ].join("\n")
  );
  try {
    const result = spawnSync(
      process.execPath,
      [new URL("./database-command.mjs", import.meta.url).pathname, "migrate"],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          MEELNI_ALLOW_REMOTE_MIGRATION: undefined,
          MEELNI_ENV_FILE: ".env.production.local",
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MEELNI_ALLOW_REMOTE_MIGRATION=1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Production migration requires exact owner authorization before spawn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-db-owner-auth-"));
  const envFile = join(directory, ".env.production.local");
  const productionUrl = databaseUrl(productionRef, 5432);
  await writeFile(
    envFile,
    [
      `DATABASE_URL=${productionUrl}`,
      "MEELNI_ENV_PULL_ENVIRONMENT=production",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "VERCEL_ENV=production",
      "",
    ].join("\n")
  );
  let spawned = false;
  try {
    await assert.rejects(
      runDatabaseCommand({
        argv: ["migrate"],
        cwd: directory,
        env: {
          MEELNI_ALLOW_REMOTE_MIGRATION: "1",
          MEELNI_ENV_FILE: ".env.production.local",
        },
        authorizeProductionAction: async () => {
          throw new Error("authorization_required");
        },
        productionConfigurationSha256: () => "d".repeat(64),
        spawn: () => {
          spawned = true;
          return { status: 0 };
        },
      }),
      /authorization_required/
    );
    assert.equal(spawned, false);

    let authorizationInput;
    const status = await runDatabaseCommand({
      argv: ["migrate"],
      cwd: directory,
      env: {
        MEELNI_ALLOW_REMOTE_MIGRATION: "1",
        MEELNI_ENV_FILE: ".env.production.local",
      },
      authorizeProductionAction: async (input) => {
        authorizationInput = input;
      },
      productionConfigurationSha256: () => "d".repeat(64),
      spawn: () => {
        spawned = true;
        return { status: 0 };
      },
    });
    assert.equal(status, 0);
    assert.equal(spawned, true);
    assert.deepEqual(authorizationInput.expected, {
      action: "production-database-migrate",
      provider: "supabase",
      configurationSha256: "d".repeat(64),
      targetFingerprint: databaseTargetSha256(productionUrl),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function databaseUrl(ref, port) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:${port}/postgres`;
}
