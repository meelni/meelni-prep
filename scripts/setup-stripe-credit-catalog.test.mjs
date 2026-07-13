import assert from "node:assert/strict";
import test from "node:test";

import { runStripeCatalogSetup } from "./setup-stripe-credit-catalog.mjs";

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

test("catalog dry-run remains provider-free and live setup keeps explicit confirmation", async () => {
  let constructions = 0;
  class FakeStripe {
    constructor() {
      constructions += 1;
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

  await runStripeCatalogSetup({
    argv: ["--confirm-live"],
    env: production,
    StripeClient: FakeStripe,
    log: () => {},
  });
  assert.equal(constructions, 1);
});
