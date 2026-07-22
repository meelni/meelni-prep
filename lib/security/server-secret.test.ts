import assert from "node:assert/strict";
import test from "node:test";

import { isValidServerSecret } from "./server-secret";

test("shared server-secret validation rejects weak deployment values", () => {
  assert.equal(
    isValidServerSecret("dedicated-secret-82^fQm19!contact-HMAC"),
    true
  );
  assert.equal(isValidServerSecret(undefined), false);
  assert.equal(isValidServerSecret("a".repeat(64)), false);
  assert.equal(
    isValidServerSecret("change-me-contact-secret-1234567890"),
    false
  );
  assert.equal(
    isValidServerSecret(" leading-secret-82^fQm19!contact-HMAC"),
    false
  );
});
