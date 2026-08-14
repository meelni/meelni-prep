import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_sync";
  return {
    cancelMissing: vi.fn(),
    retrieveSubscription: vi.fn(),
    selectResponses: [] as unknown[][],
    updateSet: vi.fn(),
  };
});

vi.mock("stripe", () => ({
  default: class StripeMock {
    subscriptions = {
      retrieve: state.retrieveSubscription,
    };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user_sync" } },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.selectResponses.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (value: unknown) => {
        state.updateSet(value);
        return {
          where: () => ({
            returning: async () => [{ id: "subscription_sync" }],
          }),
        };
      },
    }),
  },
}));

vi.mock("@/lib/db/stripe-subscription-sync", () => ({
  cancelObservedMissingStripeSubscription: state.cancelMissing,
}));

import { POST } from "./route";

describe("POST /api/billing/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectResponses = [[existingSubscription()]];
    state.retrieveSubscription.mockRejectedValue(
      Object.assign(new Error("missing"), {
        code: "resource_missing",
      })
    );
  });

  it("returns retryable conflict when the observed missing resource was superseded", async () => {
    state.cancelMissing.mockResolvedValue({ status: "conflict" });

    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      synced: false,
      message: "Subscription changed while syncing; retry required",
    });
    expect(state.cancelMissing).toHaveBeenCalledWith({
      userId: "user_sync",
      observedStripeSubscriptionId: "sub_observed_a",
      observedVersion: 7,
    });
  });

  it.each(["incomplete", "incomplete_expired", "unpaid"] as const)(
    "persists authoritative Stripe %s as non-entitling paused during manual sync",
    async (stripeStatus) => {
      state.selectResponses = [
        [existingSubscription()],
        [existingSubscription()],
      ];
      state.retrieveSubscription.mockResolvedValue({
        id: "sub_observed_a",
        status: stripeStatus,
        created: 1_000,
        customer: "cus_sync",
        items: {
          data: [
            {
              price: {
                id: "price_unmapped_sync_fixture",
                recurring: { interval: "month" },
              },
              current_period_start: 1_000,
              current_period_end: 2_000,
            },
          ],
        },
        trial_end: null,
        canceled_at: null,
        cancel_at_period_end: false,
      });

      const response = await POST();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        synced: true,
        subscription: { tier: "starter", status: "paused" },
      });
      expect(state.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused", version: 8 })
      );
    }
  );
});

function existingSubscription() {
  return {
    userId: "user_sync",
    tier: "starter",
    status: "active",
    stripeSubscriptionId: "sub_observed_a",
    stripeCustomerId: "cus_sync",
    stripeResourceCreatedAt: new Date(1_000_000),
    stripeResourceCreatedEventTimestamp: null,
    stripeResourceCreatedEventId: null,
    retiredStripeSubscriptionIds: [],
    version: 7,
  };
}
