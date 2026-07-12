import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountIdentityBusyError,
  tryLockAccountIdentity,
} from "./account-identity-lock";

test("account provider mutations acquire immediately or fail with backpressure", async () => {
  let calls = 0;
  await tryLockAccountIdentity(
    { execute: async () => (calls += 1) && [{ acquired: true }] },
    "user-1"
  );
  assert.equal(calls, 1);

  await assert.rejects(
    () =>
      tryLockAccountIdentity(
        { execute: async () => [{ acquired: false }] },
        "user-1"
      ),
    AccountIdentityBusyError
  );
});
