import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const previewRef = "previewprojectref123";
const productionRef = "productionproject123";

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

test("environment validation accepts a restricted Preview Stripe key", () => {
  const result = validateWith({
    DATABASE_URL: databaseUrl(previewRef),
    MEELNI_ENV_PULL_ENVIRONMENT: "preview",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    STRIPE_SECRET_KEY: "rk_test_restricted",
    VERCEL_ENV: "preview",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
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

test("environment validation rejects conflicting Meelni and Vercel markers", () => {
  const previewClaimedAsProduction = validateWith({
    DATABASE_URL: databaseUrl(productionRef),
    MEELNI_ENV_PULL_ENVIRONMENT: "production",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    VERCEL_ENV: "preview",
  });
  assert.equal(previewClaimedAsProduction.status, 1);
  assert.match(
    `${previewClaimedAsProduction.stdout}\n${previewClaimedAsProduction.stderr}`,
    /does not match expected preview/
  );

  const productionClaimedAsPreview = validateWith({
    DATABASE_URL: databaseUrl(previewRef),
    MEELNI_ENV_PULL_ENVIRONMENT: "preview",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    VERCEL_ENV: "production",
  });
  assert.equal(productionClaimedAsPreview.status, 1);
  assert.match(
    `${productionClaimedAsPreview.stdout}\n${productionClaimedAsPreview.stderr}`,
    /does not match expected production/
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
        NEXT_PUBLIC_LIVEKIT_URL: "wss://preview.livekit.cloud",
        MEELNI_PRODUCTION_LIVEKIT_URL: "wss://production.livekit.cloud",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJvalid",
        NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
        OPENAI_API_KEY: "sk-valid",
        STRIPE_SECRET_KEY: "sk_test_valid",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_valid",
        STRIPE_WEBHOOK_SECRET: "whsec_valid",
        STRIPE_INTERVIEW_PASS_PRICE_ID: "price_pass",
        STRIPE_STARTER_MONTHLY_PRICE_ID: "price_starter",
        STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro",
        ...overrides,
      },
      timeout: 10_000,
    }
  );
}

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}
