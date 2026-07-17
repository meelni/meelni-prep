import assert from "node:assert/strict";
import test from "node:test";

import { assertNonProductionScriptEnvironment } from "./non-production-script-guard";

test("legacy scripts allow local and explicitly Preview targets", () => {
  assert.doesNotThrow(() =>
    assertNonProductionScriptEnvironment({
      DATABASE_URL: "postgresql://local@127.0.0.1:5432/meelni",
    })
  );
  assert.doesNotThrow(() =>
    assertNonProductionScriptEnvironment({
      DATABASE_URL:
        "postgresql://postgres.previewref@preview.example.test:5432/postgres",
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: "productionref",
      VERCEL_ENV: "preview",
    })
  );
});

test("legacy scripts reject Production, ambient shared, and conflicting targets", () => {
  const denied = [
    { VERCEL_ENV: "production" },
    {
      DATABASE_URL:
        "postgresql://postgres.productionref@shared.example.test:5432/postgres",
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: "productionref",
      VERCEL_ENV: "preview",
    },
    {
      DATABASE_URL:
        "postgresql://postgres.previewref@shared.example.test:5432/postgres",
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
