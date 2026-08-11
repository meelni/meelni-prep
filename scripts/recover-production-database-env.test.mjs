import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

import { parse as parseDotenv } from "dotenv";

import {
  buildProductionDatabaseEnv,
  recoverProductionDatabaseEnvironment,
} from "./recover-production-database-env.mjs";
import {
  pullVercelEnvironment,
  validateRefreshedEnv,
} from "./pull-vercel-env.mjs";

const productionRef = "rarrrwkjuhfyfatcmrkw";
const previewRef = "kxpvidtxznllfosfemdl";

test("recovers only the closed database/preflight key set with private permissions", async (t) => {
  const root = await fixtureRoot(t);
  const source = resolve(root, "owner-production.env");
  const target = resolve(root, ".env.production.local");
  const databaseSecret = "database-secret-never-log";
  const unrelatedSecret = "provider-secret-never-copy";
  await writePrivate(
    source,
    `${databaseLine(productionRef, databaseSecret)}\nOPENAI_API_KEY=${unrelatedSecret}\nSUPABASE_SERVICE_ROLE_KEY=service-role-never-copy\n`
  );
  await writePrivate(target, "old-target-content\n");
  const logs = [];

  await recoverProductionDatabaseEnvironment({
    logger: { log: (message) => logs.push(message) },
    pull: () => pulledProductionEnv(),
    root,
    sourceFile: source,
  });

  const recoveredText = await readFile(target, "utf8");
  const recovered = parseDotenv(recoveredText);
  assert.deepEqual(Object.keys(recovered), [
    "MEELNI_ENV_PULL_ENVIRONMENT",
    "VERCEL_ENV",
    "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
    "DATABASE_URL",
  ]);
  assert.equal(
    recovered.DATABASE_URL,
    databaseUrl(productionRef, databaseSecret)
  );
  assert.equal(recovered.MEELNI_ENV_PULL_ENVIRONMENT, "production");
  assert.equal(recovered.VERCEL_ENV, "production");
  assert.equal((await lstat(target)).mode & 0o777, 0o600);
  assert.doesNotMatch(
    logs.join("\n"),
    /database-secret|provider-secret|service-role/
  );
});

test("fresh pull is scoped to Production in a private temporary area", async (t) => {
  const root = await fixtureRoot(t);
  let tempTarget;
  const result = pullVercelEnvironment({
    environment: "production",
    execute: (_command, args) => {
      assert.equal(args.includes("--environment=production"), true);
      assert.deepEqual(args.slice(-2), ["--scope", "meelni"]);
      tempTarget = args[4];
      assert.equal(
        resolve(tempTarget).startsWith(resolve(root, ".context/tmp")),
        true
      );
      writeFileSync(tempTarget, pulledProductionEnv());
    },
    root,
    scope: "meelni",
  });

  assert.equal(result, pulledProductionEnv());
  assert.equal(
    (await lstat(resolve(root, ".context/tmp"))).mode & 0o777,
    0o700
  );
  await assert.rejects(readFile(tempTarget, "utf8"), /ENOENT/);
});

test("accepts the real raw pull shape without generated environment markers", () => {
  const recovered = buildProductionDatabaseEnv({
    pulledText: pulledProductionEnv({
      VERCEL_ENV: undefined,
      VERCEL_TARGET_ENV: undefined,
    }),
    sourceText: databaseLine(productionRef),
  });

  assert.equal(
    parseDotenv(recovered).MEELNI_ENV_PULL_ENVIRONMENT,
    "production"
  );
  assert.equal(parseDotenv(recovered).VERCEL_ENV, "production");
});

test("fails closed for a wrong linked Vercel target", async (t) => {
  const root = await fixtureRoot(t, { projectId: "prj_wrong" });
  await writePrivate(
    resolve(root, ".env.production.local"),
    databaseLine(productionRef)
  );

  await assert.rejects(
    recoverProductionDatabaseEnvironment({
      pull: () => pulledProductionEnv(),
      root,
    }),
    /wrong Vercel team or project/
  );
});

test("fails closed when the fresh pull lacks public Supabase identity", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.production.local");
  const previous = `${databaseLine(productionRef)}\nUNCHANGED=true\n`;
  await writePrivate(target, previous);

  await assert.rejects(
    recoverProductionDatabaseEnvironment({
      pull: () => pulledProductionEnv({ NEXT_PUBLIC_SUPABASE_URL: "" }),
      root,
    }),
    /no verifiable public Supabase identity/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("a write failure preserves the previous target byte-for-byte", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.production.local");
  const previous = `${databaseLine(productionRef)}\nUNCHANGED=true\n`;
  await writePrivate(target, previous);

  await assert.rejects(
    recoverProductionDatabaseEnvironment({
      pull: () => pulledProductionEnv(),
      root,
      write: () => {
        throw new Error("simulated atomic write failure");
      },
    }),
    /simulated atomic write failure/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("fails closed for a blank owner-local database URL", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.production.local");
  const previous = 'DATABASE_URL=""\n';
  await writePrivate(target, previous);

  await assert.rejects(
    recoverProductionDatabaseEnvironment({
      pull: () => pulledProductionEnv(),
      root,
    }),
    /no verifiable DATABASE_URL/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("rejects Preview and Production cross-use in source and pull identities", () => {
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv({ VERCEL_ENV: "preview" }),
        sourceText: databaseLine(productionRef),
      }),
    /non-Production VERCEL_ENV/
  );
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv(),
        sourceText: `MEELNI_ENV_PULL_ENVIRONMENT=preview\n${databaseLine(productionRef)}`,
      }),
    /not marked for Production/
  );
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv({ VERCEL_TARGET_ENV: "preview" }),
        sourceText: databaseLine(productionRef),
      }),
    /non-Production VERCEL_TARGET_ENV/
  );
});

test("requires exact database, public, and canonical Production project identity", () => {
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv(),
        sourceText: databaseLine(previewRef),
      }),
    /identities do not match/
  );
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv({
          NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
        }),
        sourceText: databaseLine(productionRef),
      }),
    /identities do not match/
  );
  assert.throws(
    () =>
      buildProductionDatabaseEnv({
        pulledText: pulledProductionEnv({
          MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: previewRef,
        }),
        sourceText: databaseLine(productionRef),
      }),
    /identities do not match/
  );
});

test("rejects duplicate database assignments instead of validating and copying different values", () => {
  for (const secondAssignment of [
    `export ${databaseLine(productionRef, "production-secret")}`,
    `  ${databaseLine(productionRef, "production-secret")}`,
    `DATABASE_URL = ${databaseUrl(productionRef, "production-secret")}`,
    `DATABASE_URL: ${databaseUrl(productionRef, "production-secret")}`,
    `export DATABASE_URL: ${databaseUrl(productionRef, "production-secret")}`,
  ]) {
    const sourceText = `${databaseLine(previewRef, "preview-secret")}\n${secondAssignment}\n`;
    assert.throws(
      () =>
        buildProductionDatabaseEnv({
          pulledText: pulledProductionEnv(),
          sourceText,
        }),
      /exactly one DATABASE_URL assignment/
    );
  }
});

test("database-only recovery does not weaken the strict full-runtime Production pull", () => {
  const databaseOnly = buildProductionDatabaseEnv({
    pulledText: pulledProductionEnv(),
    sourceText: databaseLine(productionRef),
  });
  assert.throws(
    () => validateRefreshedEnv(databaseOnly, "production"),
    /did not provide usable/
  );
});

test("requires a private regular source file", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.production.local");
  await writeFile(target, databaseLine(productionRef), { mode: 0o644 });
  await chmod(target, 0o644);

  await assert.rejects(
    recoverProductionDatabaseEnvironment({
      pull: () => pulledProductionEnv(),
      root,
    }),
    /must not be group\/world accessible/
  );
});

async function fixtureRoot(t, linkOverrides = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "meelni-production-db-env-"));
  t.after(async () =>
    (await import("node:fs/promises")).rm(root, {
      recursive: true,
      force: true,
    })
  );
  await mkdir(resolve(root, ".vercel"), { recursive: true });
  await writeFile(
    resolve(root, ".vercel/project.json"),
    JSON.stringify({
      orgId: "team_rWHulu37yqEIUBTvTHqemRHU",
      projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
      projectName: "meelni",
      ...linkOverrides,
    })
  );
  return root;
}

async function writePrivate(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

function pulledProductionEnv(overrides = {}) {
  return (
    Object.entries({
      MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
      NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
      ...overrides,
    })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"
  );
}

function databaseLine(ref, secret = "database-password") {
  return `DATABASE_URL=${databaseUrl(ref, secret)}`;
}

function databaseUrl(ref, secret) {
  return `postgresql://postgres.${ref}:${secret}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}
