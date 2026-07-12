import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreditLedgerService,
  createMemoryCreditLedgerStore,
} from "./credits";
import { applyCurrentSubscriptionInvoice } from "./subscription-invoice";

const USER_ID = "user-1";
const EVENT_TIME = new Date("2026-08-01T12:00:00.000Z");

test("old-resource invoice after replacement grants and rolls zero credits", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => EVENT_TIME });
  await ledger.grantCredits({
    userId: USER_ID,
    catalogId: "starter",
    source: "subscription_renewal",
    includedCredits: 2,
    idempotencyKey: "existing:new-resource",
  });

  const result = await applyCurrentSubscriptionInvoice({
    current: currentSubscription({ stripeSubscriptionId: "sub_new" }),
    incomingStripeSubscriptionId: "sub_old",
    eventTimestamp: new Date(EVENT_TIME.getTime() + 1_000),
    invoiceId: "in_old",
    catalogId: "starter",
    userId: USER_ID,
    ledger,
    applySubscriptionState: async () => {
      throw new Error("stale invoice reached state mutation");
    },
  });

  assert.equal(result, "skipped");
  const grants = await store.listUserGrants(USER_ID);
  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.remainingCredits, 2);
  assert.equal(
    await store.findGrantByIdempotencyKey("stripe:invoice:in_old:starter"),
    null
  );
});

test("delayed and same-second terminal invoice events grant zero credits", async () => {
  for (const current of [
    currentSubscription({ lastEventTimestamp: EVENT_TIME }),
    currentSubscription({ status: "canceled", lastEventTimestamp: EVENT_TIME }),
  ]) {
    const store = createMemoryCreditLedgerStore();
    const ledger = createCreditLedgerService({ store, now: () => EVENT_TIME });
    const eventTimestamp =
      current.status === "canceled"
        ? EVENT_TIME
        : new Date(EVENT_TIME.getTime() - 1_000);

    assert.equal(
      await applyCurrentSubscriptionInvoice({
        current,
        incomingStripeSubscriptionId: "sub_current",
        eventTimestamp,
        invoiceId: `in_${current.status}`,
        catalogId: "starter",
        userId: USER_ID,
        ledger,
        applySubscriptionState: async () => {
          throw new Error("ordered-out invoice reached state mutation");
        },
      }),
      "skipped"
    );
    assert.equal((await store.listUserGrants(USER_ID)).length, 0);
  }
});

test("current subscription invoice grants once across duplicate fulfillment replay", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => EVENT_TIME });
  let stateApplications = 0;
  const input = {
    current: currentSubscription(),
    incomingStripeSubscriptionId: "sub_current",
    eventTimestamp: EVENT_TIME,
    invoiceId: "in_current",
    catalogId: "starter" as const,
    userId: USER_ID,
    ledger,
    applySubscriptionState: async () => {
      stateApplications += 1;
    },
  };

  assert.equal(await applyCurrentSubscriptionInvoice(input), "applied");
  assert.equal(await applyCurrentSubscriptionInvoice(input), "applied");

  const grants = await store.listUserGrants(USER_ID);
  assert.equal(
    grants.filter(({ source }) => source === "subscription_renewal").length,
    1
  );
  assert.equal(grants[0]?.originalCredits, 4);
  assert.equal(stateApplications, 2);
});

function currentSubscription(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    stripeSubscriptionId: "sub_current",
    lastEventTimestamp: new Date(EVENT_TIME.getTime() - 1_000),
    ...overrides,
  };
}
