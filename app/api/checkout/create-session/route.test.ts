import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const stripeMocks = vi.hoisted(() => ({
  list: vi.fn(),
  subscriptionList: vi.fn(),
  create: vi.fn(),
  expire: vi.fn(),
  customerCreate: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  transactionRows: [] as unknown[][],
  insertValues: vi.fn(),
  tryLock: vi.fn(),
}));
const gateMocks = vi.hoisted(() => ({
  resolveReactivationAccess: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = { sessions: stripeMocks };
    subscriptions = { list: stripeMocks.subscriptionList };
    customers = { create: stripeMocks.customerCreate };
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
    transaction: vi.fn(async (work) =>
      work({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  for: vi.fn(async () => dbMocks.transactionRows.shift() ?? []),
                })),
              })),
              limit: vi.fn(() => ({
                for: vi.fn(async () => dbMocks.transactionRows.shift() ?? []),
              })),
            })),
          })),
        })),
        insert: vi.fn(() => ({ values: dbMocks.insertValues })),
      })
    ),
  },
}));
vi.mock("@/lib/billing/subscription-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/subscription-state")>();
  return { ...actual, tryLockBillingUserUnlessDeleting: dbMocks.tryLock };
});
vi.mock("@/lib/db/account-deletions", () => ({
  hasAccountDeletionTombstone: vi.fn(),
}));
vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess: gateMocks.resolveReactivationAccess,
}));

import { createClient } from "@/lib/supabase/server";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { BillingAccountBusyError } from "@/lib/billing/subscription-state";
import { POST } from "./route";

describe("POST /api/checkout/create-session deletion guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateMocks.resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: true,
    });
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
    stripeMocks.list.mockResolvedValue({ data: [], has_more: false });
    stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
    stripeMocks.create.mockResolvedValue({
      id: "cs_test_created",
      url: "https://checkout.example.invalid/session",
      customer: "cus_test",
    });
    stripeMocks.customerCreate.mockResolvedValue({ id: "cus_test" });
    stripeMocks.expire.mockResolvedValue({ id: "cs_test_created" });
    dbMocks.selectLimit.mockResolvedValue([]);
    dbMocks.transactionRows.length = 0;
    dbMocks.insertValues.mockResolvedValue(undefined);
    dbMocks.tryLock.mockResolvedValue(undefined);
  });

  it("returns 403 before input, database, or Stripe work when relaunch is disabled", async () => {
    gateMocks.resolveReactivationAccess.mockResolvedValue({
      source: "configured-default",
      value: false,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "interview_practice_unavailable",
      message: "New purchases are unavailable before relaunch.",
      retryable: false,
    });
    expect(gateMocks.resolveReactivationAccess).toHaveBeenCalledWith({
      user: expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
      }),
      localOverride: undefined,
    });
    expect(hasAccountDeletionTombstone).not.toHaveBeenCalled();
    expect(dbMocks.selectLimit).not.toHaveBeenCalled();
    expect(dbMocks.tryLock).not.toHaveBeenCalled();
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(stripeMocks.create).not.toHaveBeenCalled();
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["an invalid catalog", JSON.stringify({ catalogId: "enterprise" })],
  ])("keeps the disabled boundary ahead of %s", async (_name, body) => {
    gateMocks.resolveReactivationAccess.mockResolvedValue({
      source: "configured-default",
      value: false,
    });
    const response = await POST(
      new NextRequest("http://localhost/api/checkout/create-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    );

    expect(response.status).toBe(403);
    expect(hasAccountDeletionTombstone).not.toHaveBeenCalled();
    expect(dbMocks.selectLimit).not.toHaveBeenCalled();
    expect(stripeMocks.create).not.toHaveBeenCalled();
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
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
    setTransactionSubscription(
      subscriptionFixture({ cancelAtPeriodEnd: true })
    );

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
    setTransactionSubscription(subscriptionFixture());

    const response = await POST(request("starter"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      reactivationRequired: false,
    });
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });

  it("allows subscription Checkout after the prior resource is truly canceled", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    setTransactionSubscription(
      subscriptionFixture({ status: "canceled", cancelAtPeriodEnd: true })
    );

    const response = await POST(request("starter"));

    expect(response.status).toBe(200);
    expect(stripeMocks.create).toHaveBeenCalledOnce();
  });

  it("returns immediate retry backpressure without provider work", async () => {
    vi.mocked(hasAccountDeletionTombstone).mockResolvedValue(false);
    dbMocks.tryLock.mockRejectedValue(new BillingAccountBusyError());

    const response = await POST(request("starter"));

    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(stripeMocks.subscriptionList).not.toHaveBeenCalled();
    expect(stripeMocks.create).not.toHaveBeenCalled();
  });
});

function request(catalogId = "interview_pass") {
  return new NextRequest("http://localhost/api/checkout/create-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalogId }),
  });
}

function setTransactionSubscription(
  row: ReturnType<typeof subscriptionFixture>
) {
  dbMocks.transactionRows.push([row], [], [row], []);
}

function subscriptionFixture(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tier: "starter",
    status: "active",
    cancelAtPeriodEnd: false,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    ...overrides,
  };
}
