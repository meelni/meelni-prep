import assert from "node:assert/strict";
import test from "node:test";

import {
  obtainSerializedSubscriptionCheckout,
  subscriptionCheckoutIdempotencyKey,
  type SubscriptionCheckoutSession,
  type SubscriptionCheckoutState,
} from "./subscription-checkout";

test("concurrent subscription Checkout calls reuse one customer and open session", async () => {
  const harness = checkoutHarness();
  const run = () => harness.run("starter", "price_starter");

  const [first, second] = await Promise.all([run(), run()]);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(harness.customerCreates(), 1);
  assert.equal(harness.sessionCreates(), 1);
  assert.equal(second.allowed && second.reused, true);
});

test("an expired session permits a fresh same-plan creation attempt", async () => {
  const harness = checkoutHarness();
  const first = await harness.run("starter", "price_starter");
  harness.expireAllOpenSessions();
  const second = await harness.run("starter", "price_starter");

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(harness.sessionCreates(), 2);
  assert.notEqual(harness.creationKeys()[0], harness.creationKeys()[1]);
});

test("switching plans after expiration cannot reuse incompatible provider parameters", async () => {
  const harness = checkoutHarness();
  assert.equal((await harness.run("starter", "price_starter")).allowed, true);
  harness.expireAllOpenSessions();
  assert.equal((await harness.run("pro", "price_pro")).allowed, true);
  assert.equal(harness.sessionCreates(), 2);
  assert.notEqual(harness.creationKeys()[0], harness.creationKeys()[1]);
});

test("an ambiguous create timeout retries once with the exact attempt key", async () => {
  const harness = checkoutHarness({ failFirstCreateAfterPersist: true });
  const result = await harness.run("starter", "price_starter");

  assert.equal(result.allowed, true);
  assert.equal(harness.createCalls(), 2);
  assert.equal(harness.sessionCreates(), 1);
  assert.deepEqual(harness.creationKeys(), [
    harness.creationKeys()[0],
    harness.creationKeys()[0],
  ]);
});

test("provider activation during create expires and withholds the candidate", async () => {
  const harness = checkoutHarness({ activateDuringCreate: true });
  const result = await harness.run("starter", "price_starter");

  assert.deepEqual(result, { allowed: false, reason: "state_changed" });
  assert.equal(harness.providerChecks(), 2);
  assert.deepEqual(harness.expiredSessionIds(), ["cs_1"]);
});

test("scheduled or initially provider-active subscriptions never create Checkout", async () => {
  for (const scenario of ["scheduled", "provider"] as const) {
    const harness = checkoutHarness({
      initialState:
        scenario === "scheduled"
          ? { status: "active", cancelAtPeriodEnd: true }
          : {},
      providerActive: scenario === "provider",
    });
    const result = await harness.run("starter", "price_starter");
    assert.equal(result.allowed, false);
    assert.equal(harness.sessionCreates(), 0);
  }
});

test("a local state change after provider creation expires and withholds the session", async () => {
  const harness = checkoutHarness({ changeStateAfterCreate: true });
  const result = await harness.run("starter", "price_starter");
  assert.deepEqual(result, { allowed: false, reason: "state_changed" });
  assert.deepEqual(harness.expiredSessionIds(), ["cs_1"]);
});

test("attempt keys bind user, plan, price, and nonce", () => {
  const input = {
    userId: "user-1",
    catalogId: "starter" as const,
    priceId: "price_starter",
    attemptNonce: "attempt-one",
  };
  assert.equal(
    subscriptionCheckoutIdempotencyKey(input),
    subscriptionCheckoutIdempotencyKey(input)
  );
  assert.notEqual(
    subscriptionCheckoutIdempotencyKey(input),
    subscriptionCheckoutIdempotencyKey({
      ...input,
      attemptNonce: "attempt-two",
    })
  );
  assert.notEqual(
    subscriptionCheckoutIdempotencyKey(input),
    subscriptionCheckoutIdempotencyKey({
      ...input,
      catalogId: "pro",
      priceId: "price_pro",
    })
  );
});

function checkoutHarness(
  options: {
    activateDuringCreate?: boolean;
    changeStateAfterCreate?: boolean;
    failFirstCreateAfterPersist?: boolean;
    initialState?: Partial<SubscriptionCheckoutState>;
    providerActive?: boolean;
  } = {}
) {
  let current = state(options.initialState);
  let providerActive = options.providerActive ?? false;
  let customerCreateCount = 0;
  let sessionCreateCount = 0;
  let createCallCount = 0;
  let providerCheckCount = 0;
  let nonce = 0;
  let openSessions: SubscriptionCheckoutSession[] = [];
  const sessionByKey = new Map<string, string>();
  const keys: string[] = [];
  const expired: string[] = [];
  const withUserLock = serializedUserLock(
    () => current,
    (customerId) => {
      current = { ...current, stripeCustomerId: customerId };
    }
  );

  return {
    run(catalogId: "starter" | "pro", priceId: string) {
      return obtainSerializedSubscriptionCheckout({
        userId: "user-1",
        catalogId,
        priceId,
        withUserLock,
        createAttemptNonce: () => `attempt-${++nonce}`,
        createCustomer: async () => {
          customerCreateCount += 1;
          return "cus_1";
        },
        hasProviderActiveSubscription: async () => {
          providerCheckCount += 1;
          return providerActive;
        },
        listOpenSessions: async () => [...openSessions],
        createSession: async (key, customerId) => {
          createCallCount += 1;
          keys.push(key);
          let existing = openSessions.find(
            (session) => session.id === sessionByKey.get(key)
          );
          if (!existing) {
            sessionCreateCount += 1;
            existing = {
              id: `cs_${sessionCreateCount}`,
              url: `https://checkout.example.invalid/${sessionCreateCount}`,
              catalogId,
              userId: "user-1",
              customerId,
            };
            openSessions.push(existing);
            sessionByKey.set(key, existing.id);
            if (options.activateDuringCreate) providerActive = true;
            if (options.changeStateAfterCreate) {
              current = { ...current, version: current.version + 1 };
            }
            if (options.failFirstCreateAfterPersist && createCallCount === 1) {
              throw new Error("provider_timeout");
            }
          }
          return { ...existing };
        },
        expireSession: async (sessionId) => {
          expired.push(sessionId);
          openSessions = openSessions.filter(({ id }) => id !== sessionId);
        },
      });
    },
    expireAllOpenSessions() {
      openSessions = [];
    },
    createCalls: () => createCallCount,
    customerCreates: () => customerCreateCount,
    sessionCreates: () => sessionCreateCount,
    creationKeys: () => [...keys],
    expiredSessionIds: () => [...expired],
    providerChecks: () => providerCheckCount,
  };
}

function state(
  overrides: Partial<SubscriptionCheckoutState> = {}
): SubscriptionCheckoutState {
  return {
    version: 0,
    tier: null,
    status: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...overrides,
  };
}

function serializedUserLock(
  readCurrent: () => SubscriptionCheckoutState,
  recordCustomer: (customerId: string) => void
) {
  let tail = Promise.resolve();
  return async <T>(
    work: (context: {
      readState: () => Promise<SubscriptionCheckoutState>;
      recordCustomerId: (customerId: string) => Promise<void>;
    }) => Promise<T>
  ): Promise<T> => {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work({
        readState: async () => ({ ...readCurrent() }),
        recordCustomerId: async (customerId) => recordCustomer(customerId),
      });
    } finally {
      release();
    }
  };
}
