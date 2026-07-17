import assert from "node:assert/strict";
import test from "node:test";

import { createStripeCatalogReader } from "./stripe-catalog-reader";

test("reads the account that owns the Stripe credential", async () => {
  let currentAccountReads = 0;
  const reader = createStripeCatalogReader("rk_test_fixture", {
    accounts: {
      async retrieveCurrent() {
        currentAccountReads += 1;
        return { id: "acct_fixture" };
      },
    },
    prices: {
      async retrieve() {
        throw new Error("price lookup not expected");
      },
    },
  });

  assert.equal(await reader.readAccountId(), "acct_fixture");
  assert.equal(currentAccountReads, 1);
});
