import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { parse as parseDotenv } from "dotenv";

import {
  buildRefreshedEnv,
  inferSupabaseAnonProjectRef,
  normalizeEnvValue,
  readEnvValue,
  refreshEnvironment,
  validateRefreshedEnv,
  validateTarget,
} from "./pull-vercel-env.mjs";

const previewRef = "previewprojectref123";
const productionRef = "productionproject12";

test("normalizeEnvValue only strips matched quote pairs", () => {
  assert.equal(
    normalizeEnvValue('"wss://host.livekit.cloud"'),
    "wss://host.livekit.cloud"
  );
  assert.equal(
    normalizeEnvValue("'wss://host.livekit.cloud'"),
    "wss://host.livekit.cloud"
  );
  assert.equal(
    normalizeEnvValue("'wss://host.livekit.cloud\""),
    "'wss://host.livekit.cloud\""
  );
});

test("public defaults containing replacement tokens are written literally", () => {
  const posthogHost = "https://example.com/ingest?$capture=$&";
  const env = buildRefreshedEnv({
    defaults: { NEXT_PUBLIC_POSTHOG_HOST: posthogHost },
    environment: "preview",
    pulledText: scopedEnv(previewRef, { NEXT_PUBLIC_POSTHOG_HOST: '""' }),
  });

  assert.equal(readEnvValue(env, "NEXT_PUBLIC_POSTHOG_HOST"), posthogHost);
});

test("blank encrypted values preserve existing Preview secrets", () => {
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText: scopedEnv(previewRef, {
      DATABASE_URL: databaseUrl(previewRef, "previous-password"),
      SUPABASE_SERVICE_ROLE_KEY: "previous-service-role",
    }),
    pulledText: scopedEnv(previewRef, {
      DATABASE_URL: '""',
      SUPABASE_SERVICE_ROLE_KEY: '""',
    }),
  });

  assert.equal(
    readEnvValue(env, "DATABASE_URL"),
    databaseUrl(previewRef, "previous-password")
  );
  assert.equal(
    readEnvValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
    "previous-service-role"
  );
});

test("preserved quoted secrets round-trip without exposing comment syntax", () => {
  const rawCredential =
    '"{\\"type\\":\\"service_account\\",\\"private_key\\":\\"line1\\\\nline2\\"}"';
  const previousText = `${scopedEnv(previewRef)}GOOGLE_SHEETS_CREDENTIALS=${rawCredential}\n`;
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText,
    pulledText: `${scopedEnv(previewRef)}GOOGLE_SHEETS_CREDENTIALS=""\n`,
  });

  assert.equal(
    parseDotenv(env).GOOGLE_SHEETS_CREDENTIALS,
    parseDotenv(previousText).GOOGLE_SHEETS_CREDENTIALS
  );
  assert.match(
    env,
    new RegExp(`GOOGLE_SHEETS_CREDENTIALS=${escapeRegExp(rawCredential)}`)
  );
});

test("true multiline private keys are preserved byte-for-byte", () => {
  const rawPrivateKey =
    '"-----BEGIN PRIVATE KEY-----\nline-one\nline-two\n-----END PRIVATE KEY-----"';
  const previousText = `${scopedEnv(previewRef)}GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=${rawPrivateKey}\n`;
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText,
    pulledText: `${scopedEnv(previewRef)}GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=""\n`,
  });

  assert.equal(
    parseDotenv(env).GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    parseDotenv(previousText).GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
  assert.match(
    env,
    new RegExp(
      `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=${escapeRegExp(rawPrivateKey)}`
    )
  );
});

test("usable pulled values win over existing values", () => {
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText: scopedEnv(previewRef, {
      DATABASE_URL: databaseUrl(previewRef, "old-password"),
    }),
    pulledText: scopedEnv(previewRef, {
      DATABASE_URL: databaseUrl(previewRef, "new-password"),
    }),
  });

  assert.equal(
    readEnvValue(env, "DATABASE_URL"),
    databaseUrl(previewRef, "new-password")
  );
});

test("an absent pulled credential is not resurrected from the previous file", () => {
  const pulled = scopedEnv(previewRef);
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText: `${pulled}RESEND_API_KEY=previous-resend-secret\n`,
    pulledText: pulled,
  });

  assert.equal(readEnvValue(env, "RESEND_API_KEY"), undefined);
});

test("public defaults fill blanks but never overwrite scoped values", () => {
  const env = buildRefreshedEnv({
    defaults: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_POSTHOG_HOST: "https://default.posthog.example",
    },
    environment: "production",
    pulledText: `${scopedEnv(productionRef, {}, "production")}NEXT_PUBLIC_APP_URL=https://meelni.com\nNEXT_PUBLIC_POSTHOG_HOST=\"\"\n`,
  });

  assert.equal(readEnvValue(env, "NEXT_PUBLIC_APP_URL"), "https://meelni.com");
  assert.equal(
    readEnvValue(env, "NEXT_PUBLIC_POSTHOG_HOST"),
    "https://default.posthog.example"
  );
  assert.equal(
    readEnvValue(env, "NEXT_PUBLIC_STATSIG_ENVIRONMENT"),
    "production"
  );
});

test("Preview and Production markers cannot be mixed", () => {
  assert.throws(
    () =>
      buildRefreshedEnv({
        environment: "preview",
        previousText: "MEELNI_ENV_PULL_ENVIRONMENT=production\n",
        pulledText: scopedEnv(previewRef),
      }),
    /Refusing to reuse production values/
  );
});

test("database and public Supabase project mismatch is rejected", () => {
  const env = scopedEnv(previewRef, {
    NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
  });

  assert.throws(
    () => validateRefreshedEnv(env, "preview"),
    /target different Supabase projects/
  );
});

test("a same-project service-role JWT is rejected as a browser anon key", () => {
  const env = scopedEnv(previewRef, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonJwt(previewRef, "service_role"),
  });

  assert.throws(
    () => validateRefreshedEnv(env, "preview"),
    /not an anon-role token/
  );
});

test("anon JWT project mismatch is rejected when its ref is available", () => {
  const env = scopedEnv(previewRef, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonJwt(productionRef),
  });

  assert.throws(
    () => validateRefreshedEnv(env, "preview"),
    /ANON_KEY targets a different Supabase project/
  );
  assert.equal(inferSupabaseAnonProjectRef(anonJwt(previewRef)), previewRef);
});

test("anon JWT issuer must use the canonical Supabase auth path", () => {
  const env = scopedEnv(previewRef, {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonJwt(
      previewRef,
      "anon",
      `https://${previewRef}.supabase.co/not-the-issuer/auth/v1`
    ),
  });

  assert.throws(
    () => validateRefreshedEnv(env, "preview"),
    /unexpected issuer/
  );
});

test("refresh validates before replacement, writes mode 0600, and never logs secrets", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const oldSecret = "old-password-not-for-logs";
  const newSecret = "new-password-not-for-logs";
  await writeFile(
    target,
    scopedEnv(previewRef, { DATABASE_URL: databaseUrl(previewRef, oldSecret) })
  );
  await chmod(target, 0o644);
  const logs = [];

  await refreshEnvironment({
    environment: "preview",
    logger: { log: (message) => logs.push(message) },
    pull: () =>
      scopedEnv(previewRef, {
        DATABASE_URL: databaseUrl(previewRef, newSecret),
      }),
    root,
    target: ".env.local",
  });

  assert.equal(
    readEnvValue(await readFile(target, "utf8"), "DATABASE_URL"),
    databaseUrl(previewRef, newSecret)
  );
  assert.equal((await lstat(target)).mode & 0o777, 0o600);
  assert.doesNotMatch(
    logs.join("\n"),
    new RegExp(`${oldSecret}|${newSecret}|eyJ`)
  );
});

test("failed validation keeps the prior target byte-for-byte", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const previous = `${scopedEnv(previewRef)}PRESERVED_FORMATTING=\"value with spaces\"\n`;
  await writeFile(target, previous);

  await assert.rejects(
    refreshEnvironment({
      environment: "preview",
      pull: () =>
        scopedEnv(previewRef, {
          NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
        }),
      root,
      target: ".env.local",
    }),
    /target different Supabase projects/
  );
  assert.equal(await readFile(target, "utf8"), previous);
  assert.equal((await lstat(target)).mode & 0o777, 0o600);
});

test("blank pulled public Supabase config never reuses old public values", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const previous = scopedEnv(productionRef, { VERCEL_ENV: "preview" });
  await writeFile(target, previous);

  await assert.rejects(
    refreshEnvironment({
      environment: "preview",
      pull: () =>
        scopedEnv(previewRef, {
          NEXT_PUBLIC_SUPABASE_ANON_KEY: '""',
          NEXT_PUBLIC_SUPABASE_URL: '""',
        }),
      root,
      target: ".env.local",
    }),
    /did not provide usable/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("unmarked files cannot donate encrypted values to Preview", () => {
  const unmarked = scopedEnv(productionRef)
    .replace("VERCEL_ENV=preview\n", "")
    .replace(
      `https://${productionRef}.supabase.co`,
      `https://${previewRef}.supabase.co`
    );

  assert.throws(
    () =>
      buildRefreshedEnv({
        defaults: {},
        environment: "preview",
        previousText: unmarked,
        pulledText: scopedEnv(previewRef, { DATABASE_URL: '""' }),
      }),
    /Refusing to preserve unverified existing values/
  );
});

test("an unmarked restored Preview database is adopted only after project verification", () => {
  const previous = scopedEnv(previewRef).replace("VERCEL_ENV=preview\n", "");
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText: previous,
    pulledText: scopedEnv(previewRef, { DATABASE_URL: '""' }),
  });

  assert.equal(
    readEnvValue(env, "DATABASE_URL"),
    databaseUrl(previewRef, "secret")
  );
  assert.equal(readEnvValue(env, "MEELNI_ENV_PULL_ENVIRONMENT"), "preview");
});

test("database project matching does not adopt unrelated provider secrets", () => {
  const previous = `${scopedEnv(previewRef).replace("VERCEL_ENV=preview\n", "")}STRIPE_SECRET_KEY=sk_live_wrong-environment\nSTRIPE_STARTER_MONTHLY_PRICE_ID=price_wrong-environment\n`;
  const pulled = scopedEnv(previewRef, {
    DATABASE_URL: '""',
    OPENAI_API_KEY: '""',
    STRIPE_SECRET_KEY: '""',
    STRIPE_STARTER_MONTHLY_PRICE_ID: '""',
  });
  const env = buildRefreshedEnv({
    defaults: {},
    environment: "preview",
    previousText: previous,
    pulledText: pulled,
  });

  assert.equal(
    readEnvValue(env, "DATABASE_URL"),
    databaseUrl(previewRef, "secret")
  );
  assert.equal(readEnvValue(env, "OPENAI_API_KEY"), "");
  assert.equal(readEnvValue(env, "STRIPE_SECRET_KEY"), "");
  assert.equal(readEnvValue(env, "STRIPE_STARTER_MONTHLY_PRICE_ID"), "");
});

test("explicit adoption requires project alignment before preserving provider secrets", () => {
  const previous = `${scopedEnv(previewRef).replace("VERCEL_ENV=preview\n", "")}STRIPE_SECRET_KEY=sk_test_preview\n`;
  const pulled = scopedEnv(previewRef, {
    DATABASE_URL: '""',
    OPENAI_API_KEY: '""',
    STRIPE_SECRET_KEY: '""',
  });
  const env = buildRefreshedEnv({
    adoptExisting: true,
    defaults: {},
    environment: "preview",
    previousText: previous,
    pulledText: pulled,
  });

  assert.equal(readEnvValue(env, "OPENAI_API_KEY"), "openai-api-key");
  assert.equal(readEnvValue(env, "STRIPE_SECRET_KEY"), "sk_test_preview");

  assert.throws(
    () =>
      buildRefreshedEnv({
        adoptExisting: true,
        defaults: {},
        environment: "preview",
        previousText: previous.replaceAll(previewRef, productionRef),
        pulledText: pulled,
      }),
    /Refusing to preserve unverified existing values/
  );
});

test("pull failure keeps the prior target byte-for-byte", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const previous = scopedEnv(previewRef);
  await writeFile(target, previous);

  await assert.rejects(
    refreshEnvironment({
      environment: "preview",
      pull: () => {
        throw new Error("simulated pull failure");
      },
      root,
      target: ".env.local",
    }),
    /simulated pull failure/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("concurrent refreshes are rejected without touching the target", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const previous = scopedEnv(previewRef);
  await writeFile(target, previous);
  await writeFile(`${target}.lock`, "another-process\n", { mode: 0o600 });

  await assert.rejects(
    refreshEnvironment({
      environment: "preview",
      pull: () => scopedEnv(previewRef),
      root,
      target: ".env.local",
    }),
    /already be running/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("a dead process lock is recovered safely", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  await writeFile(target, scopedEnv(previewRef));
  await writeFile(
    `${target}.lock`,
    JSON.stringify({ pid: 2_147_483_647, startedAt: 1, token: "stale" }),
    { mode: 0o600 }
  );

  await refreshEnvironment({
    environment: "preview",
    pull: () => scopedEnv(previewRef),
    root,
    target: ".env.local",
  });
  await assert.rejects(readFile(`${target}.lock`, "utf8"), /ENOENT/);
});

test("an expired lock is recovered even when its PID has been reused", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  await writeFile(target, scopedEnv(previewRef));
  await writeFile(
    `${target}.lock`,
    JSON.stringify({ pid: process.pid, startedAt: 1, token: "expired" }),
    { mode: 0o600 }
  );

  await refreshEnvironment({
    environment: "preview",
    logger: { log: () => {} },
    pull: () => scopedEnv(previewRef),
    root,
    target: ".env.local",
  });
  await assert.rejects(readFile(`${target}.lock`, "utf8"), /ENOENT/);
});

test("missing required scoped values fail without logging values", async (t) => {
  const root = await fixtureRoot(t);
  const target = resolve(root, ".env.local");
  const previous = "# existing file without recoverable secrets\n";
  await writeFile(target, previous);

  await assert.rejects(
    refreshEnvironment({
      environment: "preview",
      pull: () =>
        'DATABASE_URL=""\nNEXT_PUBLIC_SUPABASE_URL=""\nNEXT_PUBLIC_SUPABASE_ANON_KEY=""\nVERCEL_ENV=preview\n',
      root,
      target: ".env.local",
    }),
    /did not provide usable/
  );
  assert.equal(await readFile(target, "utf8"), previous);
});

test("only the canonical target is accepted for each environment", () => {
  assert.doesNotThrow(() => validateTarget("/tmp/.env.local", "preview"));
  assert.doesNotThrow(() =>
    validateTarget("/tmp/.env.production.local", "production")
  );
  assert.throws(
    () => validateTarget("/tmp/.env.local", "production"),
    /may only be written/
  );
  assert.throws(
    () => validateTarget("/tmp/.env.production.local", "preview"),
    /may only be written/
  );
  assert.throws(
    () => validateTarget("/tmp/nested/.env.local", "preview", "/tmp"),
    /root \.env\.local file/
  );
});

test("Production requires a Production-scoped application URL", () => {
  const env = buildRefreshedEnv({
    defaults: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    environment: "production",
    pulledText: scopedEnv(productionRef, {}, "production"),
  });

  assert.throws(
    () => validateRefreshedEnv(env, "production"),
    /NEXT_PUBLIC_APP_URL/
  );
  assert.equal(readEnvValue(env, "NEXT_PUBLIC_APP_URL"), undefined);
});

test("Production rejects loopback application URLs and Stripe test keys", () => {
  const localhost = scopedEnv(
    productionRef,
    { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    "production"
  );
  assert.throws(
    () => validateRefreshedEnv(localhost, "production"),
    /public HTTPS URL/
  );

  const testStripe = scopedEnv(
    productionRef,
    {
      NEXT_PUBLIC_APP_URL: "https://meelni.com",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_not-production",
      STRIPE_SECRET_KEY: "sk_test_not-production",
    },
    "production"
  );
  assert.throws(
    () => validateRefreshedEnv(testStripe, "production"),
    /valid live-mode key/
  );

  const privateHost = scopedEnv(
    productionRef,
    { NEXT_PUBLIC_APP_URL: "https://127.0.0.2" },
    "production"
  );
  assert.throws(
    () => validateRefreshedEnv(privateHost, "production"),
    /public HTTPS URL/
  );

  const restrictedTestKey = scopedEnv(
    productionRef,
    {
      NEXT_PUBLIC_APP_URL: "https://www.meelni.com",
      STRIPE_SECRET_KEY: "rk_test_not-production",
    },
    "production"
  );
  assert.throws(
    () => validateRefreshedEnv(restrictedTestKey, "production"),
    /valid live-mode key/
  );
});

test("Production accepts a least-privilege restricted live Stripe key", () => {
  const restrictedLive = scopedEnv(
    productionRef,
    {
      NEXT_PUBLIC_APP_URL: "https://meelni.com",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
      STRIPE_SECRET_KEY: "rk_live_example",
    },
    "production"
  );

  assert.doesNotThrow(() => validateRefreshedEnv(restrictedLive, "production"));
});

test("symlink targets are rejected", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "meelni-env-symlink-"));
  t.after(async () =>
    (await import("node:fs/promises")).rm(root, {
      recursive: true,
      force: true,
    })
  );
  await writeFile(resolve(root, "real.env"), scopedEnv(previewRef));
  await symlink(resolve(root, "real.env"), resolve(root, ".env.local"));

  assert.throws(
    () => validateTarget(resolve(root, ".env.local"), "preview"),
    /symlinked/
  );
});

async function fixtureRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), "meelni-env-test-"));
  t.after(async () =>
    (await import("node:fs/promises")).rm(root, {
      recursive: true,
      force: true,
    })
  );
  await writeFile(
    resolve(root, ".env.example"),
    "NEXT_PUBLIC_APP_URL=http://localhost:3000\nNEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com\nNEXT_PUBLIC_STATSIG_CLIENT_KEY=client-test\n"
  );
  return root;
}

function scopedEnv(ref, overrides = {}, environment = "preview") {
  return (
    Object.entries({
      DATABASE_URL: databaseUrl(ref, "secret"),
      LIVEKIT_API_KEY: "livekit-api-key",
      LIVEKIT_API_SECRET: "livekit-api-secret",
      NEXT_PUBLIC_LIVEKIT_URL: "wss://meelni.livekit.cloud",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonJwt(ref),
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      OPENAI_API_KEY: "openai-api-key",
      VERCEL_ENV: environment,
      ...overrides,
    })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"
  );
}

function databaseUrl(ref, password) {
  return `postgresql://postgres.${ref}:${password}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}

function anonJwt(ref, role = "anon", issuer = "supabase") {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: issuer, ref, role })}.signature`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
