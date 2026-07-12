import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stripeMocks = vi.hoisted(() => ({
  update: vi.fn(),
  cancel: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));
const stateMocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    subscriptions = stripeMocks;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/billing/subscription-state", () => ({
  reconcileProviderCancellationState: stateMocks.reconcile,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: dbMocks.selectLimit })),
      })),
    })),
    update: vi.fn(() => ({ set: dbMocks.updateSet })),
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
    dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
    dbMocks.updateWhere.mockResolvedValue(undefined);
    dbMocks.selectLimit.mockResolvedValue([subscriptionFixture()]);
    stripeMocks.update.mockResolvedValue(providerSubscription(true));
    stateMocks.reconcile.mockResolvedValue(undefined);
  });

  it("rejects the retired immediate-cancellation request before provider work", async () => {
    const response = await POST(request({ cancelImmediately: true }));

    expect(response.status).toBe(400);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(dbMocks.selectLimit).not.toHaveBeenCalled();
  });

  it("schedules period-end cancellation and retains access and credits", async () => {
    const response = await POST(request({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: true,
    });
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(stateMocks.reconcile).toHaveBeenCalledWith(
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
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({ cancelAtPeriodEnd: true }),
    ]);

    const response = await POST(request({ cancelImmediately: false }));

    expect(response.status).toBe(200);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });

  it("fails closed when an already scheduled paid-through date is stale", async () => {
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2020-01-01T00:00:00Z"),
      }),
    ]);

    const response = await POST(request({}));

    expect(response.status).toBe(409);
    expect(stripeMocks.update).not.toHaveBeenCalled();
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

    const response = await POST(request({}));

    expect(response.status).toBe(500);
    expect(stateMocks.reconcile).not.toHaveBeenCalled();
  });

  it("reactivates only by clearing the period-end schedule", async () => {
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({ cancelAtPeriodEnd: true }),
    ]);
    stripeMocks.update.mockResolvedValue(providerSubscription(false));

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith("sub_test", {
      cancel_at_period_end: false,
    });
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(stateMocks.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ cancelAtPeriodEnd: false })
    );
  });

  it("does not persist reactivation unless Stripe confirms it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({ cancelAtPeriodEnd: true }),
    ]);
    stripeMocks.update.mockResolvedValue(providerSubscription(true));

    const response = await DELETE();

    expect(response.status).toBe(500);
    expect(stateMocks.reconcile).not.toHaveBeenCalled();
  });
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
    ...overrides,
  };
}

function providerSubscription(cancelAtPeriodEnd: boolean) {
  return {
    id: "sub_test",
    cancel_at_period_end: cancelAtPeriodEnd,
    items: { data: [{ current_period_end: PERIOD_END_SECONDS }] },
  };
}
