import assert from "node:assert/strict";
import test from "node:test";

import { shouldApplyStripeSubscriptionState } from "./stripe-event-ordering";
import {
  nextProviderCancellationState,
  reconcileAuthoritativeProviderSnapshot,
  retrieveAuthoritativeSubscription,
  shouldApplyAuthoritativeProviderSnapshot,
} from "./subscription-state";

const PERIOD_END = new Date("2026-08-01T12:00:00.000Z");

test("provider cancellation observations advance version and establish a same-second fence", () => {
  const next = nextProviderCancellationState(snapshot(), {
    userId: "user-1",
    stripeSubscriptionId: "sub_current",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: PERIOD_END,
    observedAt: new Date("2026-07-12T06:20:10.987Z"),
  });

  assert.equal(next.cancelAtPeriodEnd, true);
  assert.equal(next.currentPeriodEnd, PERIOD_END);
  assert.equal(next.version, 8);
  assert.equal(
    next.lastEventTimestamp.toISOString(),
    "2026-07-12T06:20:10.000Z"
  );
});

test("reactivation removes only the subscription boundary and preserves the paid-through date", () => {
  const next = nextProviderCancellationState(
    snapshot({ cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END }),
    {
      userId: "user-1",
      stripeSubscriptionId: "sub_current",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END,
      observedAt: new Date("2026-07-12T06:20:11.100Z"),
    }
  );

  assert.equal(next.cancelAtPeriodEnd, false);
  assert.equal(next.currentPeriodEnd, PERIOD_END);
  assert.equal(next.version, 8);
});

test("older local clocks cannot move the webhook ordering fence backward", () => {
  const lastEventTimestamp = new Date("2026-07-12T06:20:12.000Z");
  const next = nextProviderCancellationState(snapshot({ lastEventTimestamp }), {
    userId: "user-1",
    stripeSubscriptionId: "sub_current",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: PERIOD_END,
    observedAt: new Date("2026-07-12T06:20:11.900Z"),
  });
  assert.equal(next.lastEventTimestamp, lastEventTimestamp);
});

test("provider observations fail closed on wrong resources or ended subscriptions", () => {
  assert.throws(
    () =>
      nextProviderCancellationState(snapshot(), {
        userId: "user-1",
        stripeSubscriptionId: "sub_other",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: PERIOD_END,
        observedAt: new Date(),
      }),
    /billing_subscription_provider_mismatch/
  );
  assert.throws(
    () =>
      nextProviderCancellationState(snapshot({ status: "canceled" }), {
        userId: "user-1",
        stripeSubscriptionId: "sub_current",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: PERIOD_END,
        observedAt: new Date(),
      }),
    /billing_subscription_already_ended/
  );
});

test("authoritative retrieval is one time-bounded read and fails closed", async () => {
  let calls = 0;
  const snapshot = { id: "sub_current" };
  assert.equal(
    await retrieveAuthoritativeSubscription(
      {
        retrieve: async (...args: unknown[]) => {
          calls += 1;
          const [id, options] = args as [string, { timeout?: number }?];
          assert.equal(id, "sub_current");
          assert.equal(options?.timeout, 10_000);
          return snapshot as never;
        },
      },
      "sub_current"
    ),
    snapshot
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      retrieveAuthoritativeSubscription(
        { retrieve: async () => ({ id: "sub_other" }) as never },
        "sub_current"
      ),
    /stripe_subscription_snapshot_mismatch/
  );
  await assert.rejects(
    () =>
      retrieveAuthoritativeSubscription(
        {
          retrieve: async () => {
            throw new Error("provider unavailable");
          },
        },
        "sub_current"
      ),
    /provider unavailable/
  );
});

test("cancel and reactivate observations fence delayed payloads while same-second retrieval converges", () => {
  const cancel = nextProviderCancellationState(snapshot(), {
    userId: "user-1",
    stripeSubscriptionId: "sub_current",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: PERIOD_END,
    observedAt: new Date("2026-07-12T06:20:10.900Z"),
  });
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "subscription_updated",
      eventTimestamp: new Date("2026-07-12T06:20:09.000Z"),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: cancel.lastEventTimestamp,
    }),
    false
  );
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "subscription_retrieved",
      eventTimestamp: new Date("2026-07-12T06:20:10.000Z"),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: cancel.lastEventTimestamp,
    }),
    true
  );

  const reactivate = nextProviderCancellationState(
    snapshot({
      cancelAtPeriodEnd: cancel.cancelAtPeriodEnd,
      currentPeriodEnd: cancel.currentPeriodEnd,
      version: cancel.version,
      lastEventTimestamp: cancel.lastEventTimestamp,
    }),
    {
      userId: "user-1",
      stripeSubscriptionId: "sub_current",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: PERIOD_END,
      observedAt: new Date("2026-07-12T06:20:11.100Z"),
    }
  );
  assert.equal(reactivate.cancelAtPeriodEnd, false);
  assert.equal(
    shouldApplyStripeSubscriptionState({
      currentStatus: "active",
      currentStripeSubscriptionId: "sub_current",
      event: "subscription_updated",
      eventTimestamp: new Date("2026-07-12T06:20:10.000Z"),
      incomingStripeSubscriptionId: "sub_current",
      lastEventTimestamp: reactivate.lastEventTimestamp,
    }),
    false
  );
});

test("delayed and same-second events converge from an authoritative current-resource snapshot", () => {
  const current = snapshot({
    lastEventTimestamp: new Date("2026-07-12T06:20:12.000Z"),
  });
  for (const eventTimestamp of [
    new Date("2026-07-12T06:20:01.000Z"),
    new Date("2026-07-12T06:20:12.000Z"),
  ]) {
    assert.equal(
      shouldApplyAuthoritativeProviderSnapshot({
        current,
        incomingStatus: "active",
        incomingStripeSubscriptionId: "sub_current",
        triggeringEvent: "subscription_updated",
        eventTimestamp,
      }),
      true
    );
  }
});

test("authoritative snapshots preserve terminal and resource-replacement rules", () => {
  assert.equal(
    shouldApplyAuthoritativeProviderSnapshot({
      current: snapshot({ status: "canceled" }),
      incomingStatus: "active",
      incomingStripeSubscriptionId: "sub_current",
      triggeringEvent: "subscription_updated",
      eventTimestamp: new Date("2026-07-12T06:20:20.000Z"),
    }),
    false
  );
  assert.equal(
    shouldApplyAuthoritativeProviderSnapshot({
      current: snapshot({ status: "canceled" }),
      incomingStatus: "active",
      incomingStripeSubscriptionId: "sub_replacement",
      triggeringEvent: "subscription_updated",
      eventTimestamp: new Date("2026-07-12T06:20:20.000Z"),
    }),
    false
  );
});

test("route mutation during provider retrieval forces a fresh snapshot retry", async () => {
  let version = 7;
  let cancelAtPeriodEnd = false;
  let retrievals = 0;
  const applied: boolean[] = [];

  const result = await reconcileAuthoritativeProviderSnapshot({
    readVersion: async () => version,
    retrieve: async () => {
      retrievals += 1;
      const snapshotValue = cancelAtPeriodEnd;
      if (retrievals === 1) {
        // Route mutation commits after the webhook captured version 7 and
        // while its first provider read is in flight.
        version = 8;
        cancelAtPeriodEnd = true;
      }
      return { cancelAtPeriodEnd: snapshotValue };
    },
    commit: async ({ expectedVersion, snapshot: providerSnapshot }) => {
      if (version !== expectedVersion) return "retry";
      applied.push(providerSnapshot.cancelAtPeriodEnd);
      version += 1;
      return "applied";
    },
  });

  assert.equal(result, "applied");
  assert.equal(retrievals, 2);
  assert.deepEqual(applied, [true]);
});

test("authoritative reconciliation fails closed after bounded conflicts", async () => {
  let retrievals = 0;
  await assert.rejects(
    () =>
      reconcileAuthoritativeProviderSnapshot({
        readVersion: async () => 7,
        retrieve: async () => {
          retrievals += 1;
          return { id: "sub_current" };
        },
        commit: async () => "retry",
        maxAttempts: 3,
      }),
    /billing_subscription_reconciliation_retry_exhausted/
  );
  assert.equal(retrievals, 3);
});

test("authoritative reconciliation propagates provider failure without committing", async () => {
  let commits = 0;
  await assert.rejects(
    () =>
      reconcileAuthoritativeProviderSnapshot({
        readVersion: async () => 7,
        retrieve: async () => {
          throw new Error("provider unavailable");
        },
        commit: async () => {
          commits += 1;
          return "applied";
        },
      }),
    /provider unavailable/
  );
  assert.equal(commits, 0);
});

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    status: "active",
    stripeSubscriptionId: "sub_current",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z"),
    version: 7,
    lastEventTimestamp: new Date("2026-07-12T06:20:09.000Z"),
    ...overrides,
  };
}
