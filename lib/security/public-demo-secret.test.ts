import assert from "node:assert/strict";
import test from "node:test";

import { isValidPublicDemoSecret } from "./public-demo-secret";

test("public demo secret accepts exactly one 32-byte base64url value", () => {
  assert.equal(isValidPublicDemoSecret("s".repeat(43)), true);
  assert.equal(isValidPublicDemoSecret("s".repeat(42)), false);
  assert.equal(isValidPublicDemoSecret("s".repeat(44)), false);
  assert.equal(isValidPublicDemoSecret(`${"s".repeat(42)}+`), false);
  assert.equal(
    isValidPublicDemoSecret(
      "generate-a-32-byte-base64url-secret-before-deploy"
    ),
    false
  );
  assert.equal(isValidPublicDemoSecret(undefined), false);
});
