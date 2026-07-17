import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_PREVIEW_SUPABASE_PROJECT_REF,
  EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF,
} from "../lib/supabase/supabase-jwt.mjs";
import { assertNonProductionScriptEnvironment } from "./non-production-script-guard";

function databaseUrl(projectRef: string): string {
  const value = new URL("postgresql://localhost/postgres");
  value.hostname = `db.${projectRef}.supabase.co`;
  value.port = "5432";
  return value.toString();
}

const PREVIEW_DATABASE = databaseUrl(EXPECTED_PREVIEW_SUPABASE_PROJECT_REF);
const PRODUCTION_DATABASE = databaseUrl(
  EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF
);
const CANONICAL_PRODUCTION_IDENTITY = {
  MEELNI_PRODUCTION_SUPABASE_PROJECT_REF:
    EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF,
};

test("legacy scripts allow local and explicitly Preview targets", () => {
  assert.doesNotThrow(() =>
    assertNonProductionScriptEnvironment({
      DATABASE_URL: "postgresql://local@127.0.0.1:5432/meelni",
    })
  );
  assert.doesNotThrow(() =>
    assertNonProductionScriptEnvironment({
      DATABASE_URL: PREVIEW_DATABASE,
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      ...CANONICAL_PRODUCTION_IDENTITY,
      VERCEL_ENV: "preview",
    })
  );
});

test("legacy scripts reject Production, ambient shared, and conflicting targets", () => {
  const denied = [
    { VERCEL_ENV: "production" },
    {
      DATABASE_URL: PRODUCTION_DATABASE,
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      ...CANONICAL_PRODUCTION_IDENTITY,
      VERCEL_ENV: "preview",
    },
    {
      DATABASE_URL: PREVIEW_DATABASE,
    },
    {
      DATABASE_URL: PREVIEW_DATABASE,
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      VERCEL_ENV: "preview",
    },
    {
      DATABASE_URL: PREVIEW_DATABASE,
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: "forgedproductionref",
      VERCEL_ENV: "preview",
    },
    {
      DATABASE_URL: databaseUrl("unrelatedprojectref00"),
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      ...CANONICAL_PRODUCTION_IDENTITY,
      VERCEL_ENV: "preview",
    },
    {
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      VERCEL_ENV: "development",
    },
  ];
  for (const env of denied) {
    assert.throws(() => assertNonProductionScriptEnvironment(env));
  }
});
