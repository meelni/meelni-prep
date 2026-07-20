import assert from "node:assert/strict";
import test from "node:test";

import { AuthSessionMissingError } from "@supabase/supabase-js";

import {
  authenticatedContactUserIdFromResult,
  matchingAuthenticatedContactUserId,
} from "./authenticated-submitter";

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

test("treats only a missing auth session as an anonymous submission", () => {
  assert.equal(
    authenticatedContactUserIdFromResult(
      { user: null, error: new AuthSessionMissingError() },
      "person@example.invalid"
    ),
    null
  );

  assert.throws(
    () =>
      authenticatedContactUserIdFromResult(
        { user: null, error: new Error("provider outage") },
        "person@example.invalid"
      ),
    /provider outage/
  );
});
