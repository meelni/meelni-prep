import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stripeMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  expire: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({ selectLimit: vi.fn() }));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: stripeMocks };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: dbMocks.selectLimit })),
      })),
    })),
  },
}));
vi.mock("@/lib/db/account-deletions", () => ({
  hasAccountDeletionTombstone: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { POST } from "./route";

describe("POST /api/checkout/create-session deletion guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_INTERVIEW_PASS_PRICE_ID = "price_test_pass";
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = "price_test_starter";
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "user@example.invalid",
            },
          },
          error: null,
        }),
      },
    } as never);
    stripeMocks.list.mockResolvedValue({ data: [] });
    stripeMocks.create.mockResolvedValue({
      id: "cs_test_created",
      url: "https://checkout.example.invalid/session",
    });
    stripeMocks.expire.mockResolvedValue({ id: "cs_test_created" });
    dbMocks.selectLimit.mockResolvedValue([]);
  });

  it("makes no Stripe request when the deletion tombstone already exists", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "account_deletion_pending",
    });
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("expires and withholds a Checkout URL when deletion wins after creation", async () => {
    vi.mocked(hasAccountDeletionTombstone)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(stripeMocks.create).toHaveBeenCalledOnce();
    expect(stripeMocks.expire).toHaveBeenCalledOnce();
    const expireOptions = stripeMocks.expire.mock.calls[0]?.[2];
    expect(expireOptions.idempotencyKey).toMatch(
      /^account-deletion:expire:[a-f0-9]{64}$/
    );
  });

  it("binds a bounded Checkout session to the verified account", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const input = stripeMocks.create.mock.calls[0]?.[0];
    expect(input.client_reference_id).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(input.metadata.userId).toBe(input.client_reference_id);
    expect(input.expires_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 29 * 60
    );
  });

  it("blocks overlapping subscription Checkout while cancellation is scheduled", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({ cancelAtPeriodEnd: true }),
    ]);

    const response = await POST(request("starter"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      reactivationRequired: true,
    });
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("continues to block an ordinary active subscription", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    dbMocks.selectLimit.mockResolvedValue([subscriptionFixture()]);

    const response = await POST(request("starter"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      reactivationRequired: false,
    });
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("allows subscription Checkout after the prior resource is truly canceled", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    dbMocks.selectLimit.mockResolvedValue([
      subscriptionFixture({ status: "canceled", cancelAtPeriodEnd: true }),
    ]);

    const response = await POST(request("starter"));

    expect(response.status).toBe(200);
    expect(stripeMocks.create).toHaveBeenCalledOnce();
  });
});

function request(catalogId = "interview_pass") {
  return new NextRequest("http://localhost/api/checkout/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalogId }),
  });
}

function subscriptionFixture(overrides: Record<string, unknown> = {}) {
  return {
    tier: "starter",
    status: "active",
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus_test",
    ...overrides,
  };
}
