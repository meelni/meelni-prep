import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_sync";
  return {
    cancelMissing: vi.fn(),
  };
});

vi.mock("stripe", () => ({
  default: class StripeMock {
    subscriptions = {
      retrieve: vi.fn(async () => {
        throw Object.assign(new Error("missing"), {
          code: "resource_missing",
        });
      }),
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
          limit: async () => [
            {
              userId: "user_sync",
              tier: "starter",
              status: "active",
              stripeSubscriptionId: "sub_observed_a",
              stripeCustomerId: "cus_sync",
              version: 7,
            },
          ],
        }),
      }),
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
});
