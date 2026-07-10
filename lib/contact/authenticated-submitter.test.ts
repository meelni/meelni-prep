import assert from "node:assert/strict";
import test from "node:test";

import { matchingAuthenticatedContactUserId } from "./authenticated-submitter";

test("links only a server-authenticated matching-email submitter", () => {
  const user = { id: "user-1", email: "Person@Example.invalid" };
  assert.equal(
    matchingAuthenticatedContactUserId(user, "person@example.invalid"),
    "user-1"
  );
  assert.equal(
    matchingAuthenticatedContactUserId(user, "other@example.invalid"),
    null
  );
  assert.equal(
    matchingAuthenticatedContactUserId(null, "person@example.invalid"),
    null
  );
});
