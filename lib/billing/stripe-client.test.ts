import assert from "node:assert/strict";
import test from "node:test";

import { createStripeRuntimeClient } from "./stripe-client";

test("Stripe client construction is denied before provider initialization", () => {
  let constructions = 0;
  class FakeStripe {
    constructor() {
      constructions += 1;
    }
  }

  assert.throws(() =>
    createStripeRuntimeClient(
      {
        VERCEL_ENV: "preview",
        STRIPE_SECRET_KEY: "sk_live_forbidden",
      },
      FakeStripe as never
    )
  );
  assert.equal(constructions, 0);
});

test("account cleanup can initialize with an isolated server key only", () => {
  let constructions = 0;
  class FakeStripe {
    constructor() {
      constructions += 1;
    }
  }

  createStripeRuntimeClient(
    {
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: "rk_test_cleanup",
    },
    FakeStripe as never
  );
  assert.equal(constructions, 1);
});
