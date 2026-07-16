import assert from "node:assert/strict";
import test from "node:test";

import type { db as database } from "@/lib/db";
import { accountDeletionRequest, appUser, subscription } from "@/lib/db/schema";
import { cancelObservedMissingStripeSubscription } from "./stripe-subscription-sync";

type SubscriptionRow = typeof subscription.$inferSelect;

const USER_ID = "11111111-1111-4111-8111-111111111111";

test("resource-missing cancellation cannot clobber a successor subscription", async () => {
  const successor = subscriptionRow({
    stripeSubscriptionId: "sub_successor_b",
    version: 2,
    status: "active",
  });
  const harness = createHarness(successor);
  const result = await cancelObservedMissingStripeSubscription(
    {
      userId: USER_ID,
      observedStripeSubscriptionId: "sub_observed_a",
      observedVersion: 1,
    },
    harness.database
  );

  assert.deepEqual(result, { status: "conflict" });
  assert.equal(harness.current.stripeSubscriptionId, "sub_successor_b");
  assert.equal(harness.current.status, "active");
  assert.equal(harness.updateAttempts, 0);
  assert.deepEqual(harness.lockOrder, ["app_user", "subscription"]);
});

test("resource-missing cancellation uses exact observed resource and version CAS", async () => {
  const harness = createHarness(
    subscriptionRow({
      stripeSubscriptionId: "sub_observed_a",
      version: 1,
      status: "active",
    })
  );
  const result = await cancelObservedMissingStripeSubscription(
    {
      userId: USER_ID,
      observedStripeSubscriptionId: "sub_observed_a",
      observedVersion: 1,
    },
    harness.database
  );

  assert.deepEqual(result, { status: "canceled", tier: "starter" });
  assert.equal(harness.current.status, "canceled");
  assert.equal(harness.current.version, 2);
  assert.equal(harness.updateAttempts, 1);
});

test("a lost cancellation CAS reports retryable conflict", async () => {
  const harness = createHarness(
    subscriptionRow({
      stripeSubscriptionId: "sub_observed_a",
      version: 1,
      status: "active",
    }),
    { loseCas: true }
  );
  assert.deepEqual(
    await cancelObservedMissingStripeSubscription(
      {
        userId: USER_ID,
        observedStripeSubscriptionId: "sub_observed_a",
        observedVersion: 1,
      },
      harness.database
    ),
    { status: "conflict" }
  );
  assert.equal(harness.current.status, "active");
  assert.equal(harness.updateAttempts, 1);
});

function createHarness(initial: SubscriptionRow, options = { loseCas: false }) {
  let current = { ...initial };
  let updateAttempts = 0;
  const lockOrder: string[] = [];

  const transaction = async <T>(work: (tx: any) => Promise<T>) =>
    work({
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: () => {
              const rows =
                table === appUser
                  ? [{ id: USER_ID }]
                  : table === accountDeletionRequest
                    ? []
                    : [current];
              return Object.assign(Promise.resolve(rows), {
                for: async () => {
                  if (table === appUser) lockOrder.push("app_user");
                  if (table === subscription) lockOrder.push("subscription");
                  return rows;
                },
              });
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: Partial<SubscriptionRow>) => ({
          where: () => ({
            returning: async () => {
              updateAttempts += 1;
              if (options.loseCas) return [];
              current = { ...current, ...values };
              return [{ tier: current.tier }];
            },
          }),
        }),
      }),
    });

  return {
    database: { transaction } as unknown as typeof database,
    get current() {
      return current;
    },
    get updateAttempts() {
      return updateAttempts;
    },
    lockOrder,
  };
}

function subscriptionRow(overrides: Partial<SubscriptionRow>): SubscriptionRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: USER_ID,
    tier: "starter",
    status: "active",
    billingCycle: "monthly",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_observed_a",
    stripePriceId: "price_test",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null,
    planName: null,
    priceInCents: null,
    currency: "usd",
    proTrialUsed: false,
    lastEventTimestamp: null,
    lastEventPriority: null,
    lastEventId: null,
    stripeResourceCreatedAt: now,
    stripeResourceCreatedEventTimestamp: now,
    stripeResourceCreatedEventId: "evt_created",
    retiredStripeSubscriptionIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SubscriptionRow;
}
