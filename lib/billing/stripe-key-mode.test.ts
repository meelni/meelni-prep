import assert from "node:assert/strict";
import test from "node:test";

import { isStripeLiveServerKey } from "./stripe-key-mode";

test("Stripe live-mode detection accepts full and restricted server keys", () => {
  assert.equal(isStripeLiveServerKey("sk_live_example"), true);
  assert.equal(isStripeLiveServerKey("rk_live_example"), true);
  assert.equal(isStripeLiveServerKey("sk_test_example"), false);
  assert.equal(isStripeLiveServerKey("rk_test_example"), false);
  assert.equal(isStripeLiveServerKey(undefined), false);
});
