import assert from "node:assert/strict";
import test from "node:test";

import { authorizeProductionQuestionSync } from "./run-question-sync";
import type { ProductionActionAuthorizationInput } from "./run-question-sync";

const PRODUCTION_DATABASE =
  "postgresql://postgres.production@production.example.test:5432/postgres";

test("Preview and dry-run question sync do not require Production authorization", async () => {
  let calls = 0;
  const authorize = async () => {
    calls += 1;
  };

  assert.equal(
    await authorizeProductionQuestionSync({
      dryRun: false,
      env: {
        VERCEL_ENV: "preview",
        MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      },
      authorize,
    }),
    "not-required"
  );
  assert.equal(
    await authorizeProductionQuestionSync({
      dryRun: true,
      env: {
        VERCEL_ENV: "production",
        DATABASE_URL: PRODUCTION_DATABASE,
      },
      authorize,
    }),
    "not-required"
  );
  assert.equal(calls, 0);
});

test("Production live question sync binds exact source and database scope", async () => {
  const inputs: ProductionActionAuthorizationInput[] = [];
  const env = {
    VERCEL_ENV: "production",
    MEELNI_ENV_PULL_ENVIRONMENT: "production",
    DATABASE_URL: PRODUCTION_DATABASE,
    GOOGLE_SHEET_ID: "approved-sheet",
    GOOGLE_SHEET_NAME: "approved-tab",
    MEELNI_PRODUCTION_ACTION_AUTHORIZATION: "/private/authorization.json",
  };

  assert.equal(
    await authorizeProductionQuestionSync({
      dryRun: false,
      env,
      authorize: async (value) => {
        inputs.push(value);
      },
    }),
    "authorized"
  );
  const input = inputs[0];
  assert.ok(input);
  assert.equal(input?.authorizationPath, "/private/authorization.json");
  assert.deepEqual(input?.expected.action, "production-question-sync-manual");
  assert.deepEqual(input?.expected.provider, "google-sheets");
  assert.match(input?.expected.configurationSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(input?.expected.targetFingerprint ?? "", /^[a-f0-9]{64}$/);

  const changedInputs: ProductionActionAuthorizationInput[] = [];
  await authorizeProductionQuestionSync({
    dryRun: false,
    env: { ...env, GOOGLE_SHEET_ID: "different-sheet" },
    authorize: async (value) => {
      changedInputs.push(value);
    },
  });
  const changed = changedInputs[0];
  assert.ok(changed);
  assert.notEqual(
    changed?.expected.configurationSha256,
    input?.expected.configurationSha256
  );
  assert.notEqual(
    changed?.expected.targetFingerprint,
    input?.expected.targetFingerprint
  );
});

test("Production question sync rejects ambient conflicts before authorization", async () => {
  let calls = 0;
  for (const env of [
    {
      VERCEL_ENV: "production",
      MEELNI_ENV_PULL_ENVIRONMENT: "preview",
      DATABASE_URL: PRODUCTION_DATABASE,
    },
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "prod", DATABASE_URL: PRODUCTION_DATABASE },
  ]) {
    await assert.rejects(
      authorizeProductionQuestionSync({
        dryRun: false,
        env,
        authorize: async () => {
          calls += 1;
        },
      })
    );
  }
  assert.equal(calls, 0);
});
