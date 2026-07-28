import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileOwnedInterviewPresenceWorkflow,
  type ReconcileOwnedInterviewPresenceDeps,
} from "./reconcile-owned-interview-presence";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("owner verification precedes provider reconciliation", async () => {
  const calls: string[] = [];
  const deps: ReconcileOwnedInterviewPresenceDeps = {
    isOwner: async (sessionId, userId) => {
      calls.push("owner");
      assert.equal(sessionId, SESSION_ID);
      assert.equal(userId, USER_ID);
      return true;
    },
    reconcile: async (input) => {
      calls.push("reconcile");
      assert.deepEqual(input, {
        sessionId: SESSION_ID,
        deliveryId: "browser-presence:test",
        env: ENV,
      });
      return { ok: true, disposition: "activated" };
    },
  };

  const result = await reconcileOwnedInterviewPresenceWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      deliveryId: "browser-presence:test",
      env: ENV,
    },
    deps
  );

  assert.deepEqual(calls, ["owner", "reconcile"]);
  assert.deepEqual(result, { ok: true, disposition: "activated" });
});

test("cross-user requests cannot inspect provider presence", async () => {
  let reconciliations = 0;
  const result = await reconcileOwnedInterviewPresenceWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      deliveryId: "browser-presence:test",
      env: ENV,
    },
    {
      isOwner: async () => false,
      reconcile: async () => {
        reconciliations += 1;
        return { ok: true, disposition: "activated" };
      },
    }
  );

  assert.equal(reconciliations, 0);
  assert.deepEqual(result, { ok: false, disposition: "not_found" });
});
