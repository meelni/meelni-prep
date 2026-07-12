import assert from "node:assert/strict";
import test from "node:test";

import { getAccountAccessDecision } from "./account-access";

test("durable deletion intent immediately denies password reauthentication and existing sessions", () => {
  for (const requiresAuthentication of [true, false]) {
    assert.equal(
      getAccountAccessDecision({
        requiresAuthentication,
        authenticatedUserId: "user-1",
        hasDeletionTombstone: true,
      }),
      "account_deletion_pending"
    );
  }
});

test("normal authentication decisions remain unchanged", () => {
  assert.equal(
    getAccountAccessDecision({
      requiresAuthentication: true,
      hasDeletionTombstone: false,
    }),
    "unauthenticated"
  );
  assert.equal(
    getAccountAccessDecision({
      requiresAuthentication: true,
      authenticatedUserId: "user-1",
      hasDeletionTombstone: false,
    }),
    "allow"
  );
});
