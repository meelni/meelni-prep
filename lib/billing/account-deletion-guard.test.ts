import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutSessionAuthenticatedUserId,
  obtainCheckoutSessionUnlessDeleting,
  reconcileDeletedCheckoutSession,
} from "./account-deletion-guard";

test("checkout never calls the provider when deletion is already durable", async () => {
  let providerCalls = 0;
  const result = await obtainCheckoutSessionUnlessDeleting({
    hasDeletionTombstone: async () => true,
    obtainSession: async () => {
      providerCalls += 1;
      return { id: "cs_test_blocked", url: "https://checkout.invalid" };
    },
    expireSession: async () => {
      providerCalls += 1;
    },
  });

  assert.deepEqual(result, { allowed: false, stage: "before_provider" });
  assert.equal(providerCalls, 0);
});

test("checkout expires a session when deletion wins the provider race", async () => {
  const tombstones = [false, true];
  const expired: Array<{ id: string; key: string }> = [];
  const result = await obtainCheckoutSessionUnlessDeleting({
    hasDeletionTombstone: async () => tombstones.shift() ?? true,
    obtainSession: async () => ({
      id: "cs_test_race",
      url: "https://checkout.invalid",
    }),
    expireSession: async (id, key) => {
      expired.push({ id, key });
    },
  });

  assert.deepEqual(result, { allowed: false, stage: "after_provider" });
  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.id, "cs_test_race");
  assert.match(expired[0]?.key ?? "", /^account-deletion:expire:[a-f0-9]{64}$/);
});

test("checkout fulfillment requires matching authenticated correlation", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    checkoutSessionAuthenticatedUserId({
      client_reference_id: userId,
      metadata: { userId },
    }),
    userId
  );
  assert.equal(
    checkoutSessionAuthenticatedUserId({
      client_reference_id: "22222222-2222-4222-8222-222222222222",
      metadata: { userId },
    }),
    null
  );
  assert.equal(
    checkoutSessionAuthenticatedUserId({
      client_reference_id: null,
      metadata: { userId },
    }),
    null
  );
  assert.equal(
    checkoutSessionAuthenticatedUserId({
      client_reference_id: "not-a-uuid",
      metadata: { userId: "not-a-uuid" },
    }),
    null
  );
});

test("completed deleted subscription checkout is canceled without an automatic refund", async () => {
  const calls: Array<{ operation: string; key: string }> = [];
  const result = await reconcileDeletedCheckoutSession(
    {
      id: "cs_test_complete",
      status: "complete",
      payment_status: "paid",
      payment_intent: null,
      invoice: "in_test_complete",
      subscription: "sub_test_complete",
    },
    {
      expireCheckout: async () =>
        assert.fail("completed session must not expire"),
      cancelSubscription: async (_id, key) => {
        calls.push({ operation: "cancel", key });
      },
    }
  );

  assert.deepEqual(result, {
    status: "reconciled",
    subscriptionCanceled: true,
    paymentRefunded: false,
  });
  assert.deepEqual(
    calls.map(({ operation }) => operation),
    ["cancel"]
  );
  assert.equal(JSON.stringify(calls).includes("cs_test_complete"), false);
});

test("paid deleted checkout without a payment reference completes without refunding", async () => {
  const result = await reconcileDeletedCheckoutSession(
    {
      id: "cs_test_manual",
      status: "complete",
      payment_status: "paid",
      payment_intent: null,
      invoice: null,
      subscription: null,
    },
    {
      expireCheckout: async () => undefined,
      cancelSubscription: async () => undefined,
    }
  );

  assert.deepEqual(result, {
    status: "reconciled",
    subscriptionCanceled: false,
    paymentRefunded: false,
  });
});
