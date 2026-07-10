import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const previewRef = "previewprojectref123";

test("environment validation keeps loopback database workflows provider-independent", () => {
  const result = validateWith({
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/meelni_test",
    MEELNI_ENV_PULL_ENVIRONMENT: undefined,
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: undefined,
    VERCEL_ENV: undefined,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /All required environment variables are set/);
});

test("environment validation requires the Production identity anchor for remote Preview", () => {
  const result = validateWith({
    DATABASE_URL: databaseUrl(previewRef),
    MEELNI_ENV_PULL_ENVIRONMENT: "preview",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: undefined,
    VERCEL_ENV: undefined,
  });

  assert.equal(result.status, 1);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /MEELNI_PRODUCTION_SUPABASE_PROJECT_REF/
  );
});

function validateWith(overrides) {
  return spawnSync(
    "npx",
    ["tsx", new URL("./validate-env.ts", import.meta.url).pathname],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5432/meelni_test",
        LIVEKIT_API_KEY: "livekit-api-key",
        LIVEKIT_API_SECRET: "livekit-api-secret",
        NEXT_PUBLIC_LIVEKIT_URL: "wss://meelni.livekit.cloud",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJvalid",
        NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
        OPENAI_API_KEY: "sk-valid",
        ...overrides,
      },
      timeout: 10_000,
    }
  );
}

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}
