import assert from "node:assert/strict";
import test from "node:test";

import {
  obtainSerializedSubscriptionCheckout,
  subscriptionCheckoutIdempotencyKey,
  type SubscriptionCheckoutState,
} from "./subscription-checkout";

test("concurrent subscription Checkout calls share one provider session", async () => {
  const withUserLock = serializedUserLock();
  const sessions = new Map<string, { id: string; catalogId: string }>();
  let physicalCreates = 0;
  const run = () =>
    obtainSerializedSubscriptionCheckout({
      userId: "user-1",
      catalogId: "starter",
      withUserLock,
      hasProviderActiveSubscription: async () => false,
      listOpenSessions: async () => [],
      createSession: async (idempotencyKey) => {
        let session = sessions.get(idempotencyKey);
        if (!session) {
          physicalCreates += 1;
          session = { id: "cs_one", catalogId: "starter" };
          sessions.set(idempotencyKey, session);
        }
        return {
          id: session.id,
          url: "https://checkout.example.invalid/one",
          catalogId: session.catalogId,
          userId: "user-1",
        };
      },
      expireSession: async () => undefined,
    });

  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(physicalCreates, 1);
  assert.equal(
    subscriptionCheckoutIdempotencyKey("user-1", 0),
    subscriptionCheckoutIdempotencyKey("user-1", 0)
  );
});

test("one state version cannot create two different subscription plan sessions", async () => {
  const withUserLock = serializedUserLock();
  const requests = new Map<string, string>();
  let physicalCreates = 0;
  const run = (catalogId: "starter" | "pro") =>
    obtainSerializedSubscriptionCheckout({
      userId: "user-1",
      catalogId,
      withUserLock,
      hasProviderActiveSubscription: async () => false,
      listOpenSessions: async () => [],
      createSession: async (key) => {
        const existing = requests.get(key);
        if (existing && existing !== catalogId) {
          throw new Error("stripe_idempotency_parameter_mismatch");
        }
        if (!existing) physicalCreates += 1;
        requests.set(key, catalogId);
        return {
          id: `cs_${catalogId}`,
          url: `https://checkout.example.invalid/${catalogId}`,
          catalogId,
          userId: "user-1",
        };
      },
      expireSession: async () => undefined,
    });

  const outcomes = await Promise.allSettled([run("starter"), run("pro")]);
  assert.equal(
    outcomes.filter(({ status }) => status === "fulfilled").length,
    1
  );
  assert.equal(
    outcomes.filter(({ status }) => status === "rejected").length,
    1
  );
  assert.equal(physicalCreates, 1);
});

test("scheduled or provider-active subscriptions never return a Checkout", async () => {
  let creates = 0;
  for (const scenario of ["scheduled", "provider"] as const) {
    const result = await obtainSerializedSubscriptionCheckout({
      userId: "user-1",
      catalogId: "starter",
      withUserLock: async (work) =>
        work(async () =>
          state(
            scenario === "scheduled"
              ? { status: "active", cancelAtPeriodEnd: true }
              : { stripeCustomerId: "cus_test" }
          )
        ),
      hasProviderActiveSubscription: async () => scenario === "provider",
      listOpenSessions: async () => [],
      createSession: async () => {
        creates += 1;
        throw new Error("unexpected create");
      },
      expireSession: async () => undefined,
    });
    assert.equal(result.allowed, false);
  }
  assert.equal(creates, 0);
});

test("a local state change after provider creation expires and withholds the session", async () => {
  let reads = 0;
  const expired: string[] = [];
  const result = await obtainSerializedSubscriptionCheckout({
    userId: "user-1",
    catalogId: "starter",
    withUserLock: async (work) =>
      work(async () => {
        reads += 1;
        return reads === 1 ? state() : state({ version: 1, status: "active" });
      }),
    hasProviderActiveSubscription: async () => false,
    listOpenSessions: async () => [],
    createSession: async () => ({
      id: "cs_changed",
      url: "https://checkout.example.invalid/changed",
      catalogId: "starter",
      userId: "user-1",
    }),
    expireSession: async (sessionId) => {
      expired.push(sessionId);
    },
  });
  assert.deepEqual(result, { allowed: false, reason: "state_changed" });
  assert.deepEqual(expired, ["cs_changed"]);
});

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

function serializedUserLock() {
  let tail = Promise.resolve();
  return async <T>(
    work: (readState: () => Promise<SubscriptionCheckoutState>) => Promise<T>
  ): Promise<T> => {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work(async () => state());
    } finally {
      release();
    }
  };
}
