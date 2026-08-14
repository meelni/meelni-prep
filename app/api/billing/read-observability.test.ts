import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  report: vi.fn(),
  select: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user_fixture",
            email: "fixture@meelni.test",
            user_metadata: {},
          },
        },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/billing/credit-ledger-reporting", () => ({
  getCreditBalanceReadModel: mocks.getBalance,
}));
vi.mock("@/lib/billing/credit-ledger-store", () => ({
  createDrizzleCreditLedgerStore: vi.fn(() => ({})),
}));
vi.mock("@/lib/billing/local-dev-bypass", () => ({
  getLocalDevCreditBalanceResponse: vi.fn(),
  isLocalDevCreditBypassEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/db/users", () => ({ upsertUser: mocks.upsertUser }));
vi.mock("@/lib/operations/operational-events", () => ({
  reportOperationalFailure: mocks.report,
}));

import { GET as getCredits } from "./credits/route";
import { GET as getPaymentHistory } from "./payment-history/route";
import { GET as getSubscription } from "./subscription/route";
import { GET as getUsage } from "./usage/route";

describe("billing read operational failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBalance.mockRejectedValue(new Error("database unavailable"));
    mocks.upsertUser.mockResolvedValue({ id: "user_fixture" });
    mocks.select.mockImplementation(() => {
      throw new Error("database unavailable");
    });
  });

  it.each([
    ["credit balance", () => getCredits(), "billing_credit_read_failed"],
    [
      "payment history",
      () =>
        getPaymentHistory(
          new Request("https://meelni.test/api/billing/payment-history")
        ),
      "billing_payment_history_read_failed",
    ],
    [
      "subscription",
      () => getSubscription(),
      "billing_subscription_read_failed",
    ],
    ["usage compatibility", () => getUsage(), "billing_usage_read_failed"],
  ])(
    "reports a redacted %s failure without changing the 500 response",
    async (_name, execute, errorCode) => {
      const response = await execute();

      expect(response.status).toBe(500);
      expect(mocks.report).toHaveBeenCalledWith({
        operation: "billing_read",
        errorCode,
        retryable: true,
      });
    }
  );

  it("syncs the authenticated app user before reading credit balance", async () => {
    mocks.getBalance.mockResolvedValue({
      availableCredits: 0,
      reservedCredits: 0,
      expiringCredits: 0,
      nextCreditExpiresAt: null,
      trialAvailable: true,
      grants: [],
    });

    const response = await getCredits();

    expect(response.status).toBe(200);
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      id: "user_fixture",
      email: "fixture@meelni.test",
      name: null,
    });
    expect(mocks.getBalance).toHaveBeenCalledWith({
      store: {},
      userId: "user_fixture",
    });
  });

  it("marks a synthetic free subscription as ineligible for the billing portal", async () => {
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    });

    const response = await getSubscription();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ tier: "free", portalAvailable: false });
  });
});
