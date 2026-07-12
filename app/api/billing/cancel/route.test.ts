import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stripeMocks = vi.hoisted(() => ({
  update: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
}));
const stateMocks = vi.hoisted(() => ({
  getReadSnapshot: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    subscriptions = stripeMocks;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/billing/subscription-state", () => ({
  getCancellationReadSnapshot: stateMocks.getReadSnapshot,
  reconcileProviderCancellationState: stateMocks.reconcile,
  retrieveAuthoritativeSubscription: (
    provider: { retrieve: (...args: unknown[]) => Promise<unknown> },
    id: string
  ) => provider.retrieve(id, { timeout: 10_000 }),
  reconcileVersionedProviderMutation: async (input: {
    initialExpectedVersion: number;
    initialSnapshot: unknown;
    readVersion(): Promise<number>;
    retrieve(): Promise<unknown>;
    commit(value: {
      expectedVersion: number;
      snapshot: unknown;
    }): Promise<{ status: string; value?: unknown }>;
  }) => {
    let expectedVersion = input.initialExpectedVersion;
    let snapshot = input.initialSnapshot;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await input.commit({ expectedVersion, snapshot });
      if (result.status === "applied") {
        return { snapshot, value: result.value };
      }
      expectedVersion = await input.readVersion();
      snapshot = await input.retrieve();
    }
    throw new Error("billing_subscription_reconciliation_retry_exhausted");
  },
}));

import { createClient } from "@/lib/supabase/server";
import { DELETE, POST } from "./route";

const PERIOD_END_SECONDS = 1_800_000_000;
const PERIOD_END = new Date(PERIOD_END_SECONDS * 1000);

describe("period-end subscription cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-one" } },
          error: null,
        }),
      },
    } as never);
    readSubscription();
    stripeMocks.update.mockResolvedValue(providerSubscription(true));
    stripeMocks.retrieve.mockResolvedValue(providerSubscription(true));
    stateMocks.reconcile.mockImplementation(async (input) => ({
      status: "applied",
      value: {
        ...input,
        updatedAt: new Date("2026-07-12T00:00:01.000Z"),
      },
    }));
  });

  it("rejects the retired immediate-cancellation request before provider work", async () => {
    const response = await POST(request({ cancelImmediately: true }));

    expect(response.status).toBe(400);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(stateMocks.getReadSnapshot).not.toHaveBeenCalled();
  });

  it("schedules period-end cancellation and retains access and credits", async () => {
    const response = await POST(request({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: true,
    });
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(stateMocks.reconcile.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: PERIOD_END,
      })
    );
    expect(body).toMatchObject({
      status: "cancel_at_period_end",
      accessUntil: PERIOD_END.toISOString(),
      unusedCreditsRetainedUntil: PERIOD_END.toISOString(),
      automaticRefundCreated: false,
    });
  });

  it("replays an already scheduled cancellation without another provider call", async () => {
    readSubscription({ cancelAtPeriodEnd: true });

    const response = await POST(request({ cancelImmediately: false }));

    expect(response.status).toBe(200);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });

  it("fails closed when an already scheduled paid-through date is stale", async () => {
    readSubscription({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2020-01-01T00:00:00Z"),
    });

    const response = await POST(request({}));

    expect(response.status).toBe(409);
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it("denies exact-cutoff replay using database time despite app-clock rollback", async () => {
    readSubscription(
      { cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END },
      PERIOD_END
    );
    const appClock = vi.spyOn(Date, "now").mockReturnValue(1);

    const response = await POST(request({}));

    expect(response.status).toBe(409);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    appClock.mockRestore();
  });

  it("fails closed when Stripe does not confirm the paid-through period", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stripeMocks.update.mockResolvedValue({
      ...providerSubscription(true),
      items: { data: [] },
    });

    const response = await POST(request({}));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Failed to cancel/);
    expect(stateMocks.reconcile).not.toHaveBeenCalled();
  });

  it("does not persist a provider-confirmed cutoff that has already passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stripeMocks.update.mockResolvedValue({
      ...providerSubscription(true),
      items: { data: [{ current_period_end: 1 }] },
    });
    stateMocks.reconcile.mockRejectedValue(
      new Error("billing_subscription_observation_invalid")
    );

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    expect(stateMocks.reconcile).toHaveBeenCalledWith(
      {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(1_000),
        stripeSubscriptionId: "sub_test",
        userId: "user-one",
      },
      7
    );
  });

  it("reactivates only by clearing the period-end schedule", async () => {
    readSubscription({ cancelAtPeriodEnd: true });
    stripeMocks.update.mockResolvedValue(providerSubscription(false));

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: false,
    });
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(stateMocks.reconcile.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ cancelAtPeriodEnd: false })
    );
  });

  it("does not persist reactivation unless Stripe confirms it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    readSubscription({ cancelAtPeriodEnd: true });
    stripeMocks.update.mockResolvedValue(providerSubscription(true));

    const response = await DELETE();

    expect(response.status).toBe(500);
    expect(stateMocks.reconcile).not.toHaveBeenCalled();
  });

  it.each([
    { method: "cancel", desired: true, authoritative: false },
    { method: "reactivate", desired: false, authoritative: true },
  ])(
    "fails truthfully when a same-resource webhook inverts $method during the provider call",
    async ({ method, desired, authoritative }) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      readSubscription({
        cancelAtPeriodEnd: method === "reactivate",
        version: 7,
      });
      stateMocks.getReadSnapshot
        .mockResolvedValueOnce({
          subscription: subscriptionFixture({
            cancelAtPeriodEnd: method === "reactivate",
            version: 7,
          }),
          observedAt: new Date("2026-07-12T00:00:00.000Z"),
        })
        .mockResolvedValueOnce({
          subscription: subscriptionFixture({
            cancelAtPeriodEnd: authoritative,
            version: 8,
          }),
          observedAt: new Date("2026-07-12T00:00:01.000Z"),
        });
      stripeMocks.update.mockResolvedValue(providerSubscription(desired));
      stripeMocks.retrieve.mockResolvedValue(
        providerSubscription(authoritative)
      );
      stateMocks.reconcile
        .mockResolvedValueOnce({ status: "retry" })
        .mockImplementationOnce(async (input) => ({
          status: "applied",
          value: {
            ...input,
            updatedAt: new Date("2026-07-12T00:00:02.000Z"),
          },
        }));

      const response =
        method === "cancel" ? await POST(request({})) : await DELETE();
      expect(response.status).toBe(500);
      expect(stripeMocks.retrieve).toHaveBeenCalledOnce();
      expect(stateMocks.reconcile.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({ cancelAtPeriodEnd: authoritative })
      );
      expect(stateMocks.reconcile.mock.calls[1]?.[1]).toBe(8);
    }
  );
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/billing/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function subscriptionFixture(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-one",
    tier: "starter",
    status: "active",
    stripeSubscriptionId: "sub_test",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: PERIOD_END,
    version: 7,
    lastEventTimestamp: new Date("2026-07-11T00:00:00.000Z"),
    ...overrides,
  };
}

function readSubscription(
  overrides: Record<string, unknown> = {},
  observedAt = new Date("2026-07-12T00:00:00.000Z")
) {
  stateMocks.getReadSnapshot.mockResolvedValue({
    subscription: subscriptionFixture(overrides),
    observedAt,
  });
}

function providerSubscription(cancelAtPeriodEnd: boolean) {
  return {
    id: "sub_test",
    status: "active",
    cancel_at_period_end: cancelAtPeriodEnd,
    items: { data: [{ current_period_end: PERIOD_END_SECONDS }] },
  };
}
