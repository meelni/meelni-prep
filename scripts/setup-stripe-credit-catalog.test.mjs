import assert from "node:assert/strict";
import test from "node:test";

import {
  runStripeCatalogSetup,
  STRIPE_LIVE_CATALOG_CONFIGURATION_SHA256,
  STRIPE_LIVE_TARGET_FINGERPRINT,
} from "./setup-stripe-credit-catalog.mjs";

test("catalog setup rejects cross-environment Stripe keys before initialization", async () => {
  const unsafe = [
    { VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_live_forbidden" },
    { VERCEL_ENV: "production", STRIPE_SECRET_KEY: "rk_test_forbidden" },
    {
      VERCEL_ENV: "preview",
      MEELNI_ENV_PULL_ENVIRONMENT: "production",
      STRIPE_SECRET_KEY: "sk_test_conflict",
    },
    { NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_untrusted" },
  ];

  for (const env of unsafe) {
    let constructions = 0;
    class FakeStripe {
      constructor() {
        constructions += 1;
      }
    }
    await assert.rejects(
      runStripeCatalogSetup({ env, StripeClient: FakeStripe, log: () => {} })
    );
    assert.equal(constructions, 0);
  }
});

test("catalog dry-run remains provider-free and live setup requires owner authorization", async () => {
  let constructions = 0;
  class FakeStripe {
    constructor() {
      constructions += 1;
      this.accounts = {
        retrieve: async () => ({ id: "acct_1SSreECdoT5hfbsF" }),
      };
      this.prices = {
        list: async () => ({ data: [] }),
        create: async ({ lookup_key: lookupKey }) => ({
          id: `price_${lookupKey}`,
        }),
      };
      this.products = {
        search: async () => ({ data: [{ id: "prod_existing" }] }),
      };
    }
  }

  await runStripeCatalogSetup({
    argv: ["--dry-run"],
    env: {},
    StripeClient: FakeStripe,
    log: () => {},
  });
  assert.equal(constructions, 0);

  const production = {
    VERCEL_ENV: "production",
    STRIPE_SECRET_KEY: "rk_live_confirmed",
  };
  await assert.rejects(
    runStripeCatalogSetup({
      env: production,
      StripeClient: FakeStripe,
      log: () => {},
    }),
    /--confirm-live/
  );
  assert.equal(constructions, 0);

  await assert.rejects(
    runStripeCatalogSetup({
      argv: ["--confirm-live"],
      env: production,
      StripeClient: FakeStripe,
      log: () => {},
    }),
    /authorization_file_path_invalid/
  );
  assert.equal(constructions, 0);

  let authorizationInput;
  await runStripeCatalogSetup({
    argv: ["--confirm-live"],
    env: production,
    StripeClient: FakeStripe,
    authorizeProductionAction: async (input) => {
      authorizationInput = input;
    },
    log: () => {},
  });
  assert.equal(constructions, 1);
  assert.deepEqual(authorizationInput.expected, {
    action: "stripe-live-catalog",
    provider: "stripe",
    configurationSha256: STRIPE_LIVE_CATALOG_CONFIGURATION_SHA256,
    targetFingerprint: STRIPE_LIVE_TARGET_FINGERPRINT,
  });
});

test("an authorized live action still rejects the wrong Stripe account before mutation", async () => {
  let mutations = 0;
  class WrongAccountStripe {
    constructor() {
      this.accounts = {
        retrieve: async () => ({ id: "acct_wrong" }),
      };
      this.prices = {
        list: async () => {
          mutations += 1;
          return { data: [] };
        },
      };
    }
  }
  await assert.rejects(
    runStripeCatalogSetup({
      argv: ["--confirm-live"],
      env: {
        VERCEL_ENV: "production",
        STRIPE_SECRET_KEY: "rk_live_confirmed",
      },
      StripeClient: WrongAccountStripe,
      authorizeProductionAction: async () => {},
      log: () => {},
    }),
    /authorized account/
  );
  assert.equal(mutations, 0);
});

test("Preview catalog setup does not require the Production Stripe account", async () => {
  class PreviewStripe {
    constructor() {
      this.prices = {
        list: async () => ({ data: [] }),
        create: async ({ lookup_key: lookupKey }) => ({
          id: `price_${lookupKey}`,
        }),
      };
      this.products = {
        search: async () => ({ data: [{ id: "prod_preview" }] }),
      };
    }
  }
  const result = await runStripeCatalogSetup({
    env: {
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: "sk_test_preview",
    },
    StripeClient: PreviewStripe,
    log: () => {},
  });
  assert.equal(result.disposition, "ready");
});

test("unknown or conflicting catalog arguments fail before provider initialization", async () => {
  let constructions = 0;
  class FakeStripe {
    constructor() {
      constructions += 1;
    }
  }
  for (const argv of [
    ["--live"],
    ["--confirm-live", "--confirm-live"],
    ["--dry-run", "--confirm-live"],
  ]) {
    await assert.rejects(
      runStripeCatalogSetup({
        argv,
        env: {},
        StripeClient: FakeStripe,
        log: () => {},
      })
    );
  }
  assert.equal(constructions, 0);
});
