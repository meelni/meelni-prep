import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stripeMocks = vi.hoisted(() => ({ update: vi.fn(), cancel: vi.fn() }));
const stateMocks = vi.hoisted(() => ({ withSerialized: vi.fn() }));

vi.mock("stripe", () => ({
  default: class StripeMock {
    subscriptions = stripeMocks;
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/billing/subscription-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/subscription-state")>();
  return {
    ...actual,
    withSerializedCancellationState: stateMocks.withSerialized,
  };
});

import { createClient } from "@/lib/supabase/server";
import { BillingAccountBusyError } from "@/lib/billing/subscription-state";
import { DELETE, POST } from "./route";

const PERIOD_END_SECONDS = 1_800_000_000;
const PERIOD_END = new Date(PERIOD_END_SECONDS * 1000);
const OBSERVED_AT = new Date("2026-07-12T00:00:00.000Z");

describe("period-end subscription cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = "preview";
    process.env.MEELNI_ENV_PULL_ENVIRONMENT = "preview";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
    process.env.STRIPE_INTERVIEW_PASS_PRICE_ID = "price_fixture_pass";
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_fixture_starter";
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = "price_fixture_pro";
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
  });

  it("rejects retired immediate cancellation before provider work", async () => {
    const response = await POST(request({ cancelImmediately: true }));
    expect(response.status).toBe(400);
    expect(stripeMocks.update).not.toHaveBeenCalled();
    expect(stateMocks.withSerialized).not.toHaveBeenCalled();
  });

  it("schedules period-end cancellation with deterministic bounded provider mutation", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith(
      "sub_test",
      { cancel_at_period_end: true },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^subscription-cancel:.*:v7$/),
        timeout: 10_000,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "cancel_at_period_end",
      automaticRefundCreated: false,
    });
  });

  it("replays scheduled cancellation without another provider call", async () => {
    readSubscription({ cancelAtPeriodEnd: true });
    expect((await POST(request({}))).status).toBe(200);
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it("denies exact-cutoff replay using the locked database time", async () => {
    readSubscription({ cancelAtPeriodEnd: true }, PERIOD_END);
    expect((await POST(request({}))).status).toBe(409);
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe does not confirm the requested state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stripeMocks.update.mockResolvedValue(providerSubscription(false));
    expect((await POST(request({}))).status).toBe(500);
  });

  it("does not commit a provider cutoff that has already passed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stripeMocks.update.mockResolvedValue({
      ...providerSubscription(true),
      items: { data: [{ current_period_end: 1 }] },
    });
    setCommitFailure(new Error("billing_subscription_observation_invalid"));
    expect((await POST(request({}))).status).toBe(500);
  });

  it("reactivates with a separate deterministic action key", async () => {
    readSubscription({ cancelAtPeriodEnd: true });
    stripeMocks.update.mockResolvedValue(providerSubscription(false));
    expect((await DELETE()).status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledWith(
      "sub_test",
      { cancel_at_period_end: false },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^subscription-reactivate:.*:v7$/
        ),
        timeout: 10_000,
      })
    );
  });

  it("repeated reactivation observes completed state and makes no provider call", async () => {
    readSubscription({ cancelAtPeriodEnd: false });
    expect((await DELETE()).status).toBe(400);
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it("returns immediate retry backpressure when another account mutation owns the lock", async () => {
    stateMocks.withSerialized.mockRejectedValue(new BillingAccountBusyError());
    const response = await POST(request({}));
    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(stripeMocks.update).not.toHaveBeenCalled();
  });

  it("serializes concurrent duplicates so the loser performs zero provider mutations", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    stateMocks.withSerialized
      .mockImplementationOnce(async (_userId, work) => {
        await held;
        return work(serializedState(subscriptionFixture()));
      })
      .mockRejectedValueOnce(new BillingAccountBusyError());

    const first = POST(request({}));
    const second = await POST(request({}));
    expect(second.status).toBe(409);
    release?.();
    expect((await first).status).toBe(200);
    expect(stripeMocks.update).toHaveBeenCalledOnce();
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
    version: 7,
    lastEventTimestamp: new Date("2026-07-11T00:00:00.000Z"),
    ...overrides,
  };
}

function serializedState(
  subscription: ReturnType<typeof subscriptionFixture>,
  observedAt = OBSERVED_AT,
  commitError?: Error
) {
  return {
    subscription,
    observedAt,
    commitProviderObservation: vi.fn(async (observation) => {
      if (commitError) throw commitError;
      return {
        ...observation,
        lastEventTimestamp: subscription.lastEventTimestamp,
        version: subscription.version + 1,
        updatedAt: new Date("2026-07-12T00:00:01.000Z"),
      };
    }),
  };
}

function readSubscription(
  overrides: Record<string, unknown> = {},
  observedAt = OBSERVED_AT
) {
  stateMocks.withSerialized.mockImplementation(async (_userId, work) =>
    work(serializedState(subscriptionFixture(overrides), observedAt))
  );
}

function setCommitFailure(error: Error) {
  stateMocks.withSerialized.mockImplementation(async (_userId, work) =>
    work(serializedState(subscriptionFixture(), OBSERVED_AT, error))
  );
}

function providerSubscription(cancelAtPeriodEnd: boolean) {
  return {
    id: "sub_test",
    status: "active",
    cancel_at_period_end: cancelAtPeriodEnd,
    items: { data: [{ current_period_end: PERIOD_END_SECONDS }] },
  };
}
