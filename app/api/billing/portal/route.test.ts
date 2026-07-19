import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
  getUser: vi.fn(),
  limit: vi.fn(),
  report: vi.fn(),
  retrieveCustomer: vi.fn(),
  select: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    customers = { retrieve: mocks.retrieveCustomer };
    billingPortal = { sessions: { create: mocks.createPortalSession } };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

vi.mock("@/lib/operations/operational-events", () => ({
  reportOperationalFailure: mocks.report,
}));

import { POST } from "./route";

describe("POST /api/billing/portal operational failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user_fixture" } },
      error: null,
    });
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: mocks.limit }),
      }),
    });
    mocks.limit.mockResolvedValue([{ stripeCustomerId: "cus_fixture" }]);
    mocks.retrieveCustomer.mockResolvedValue({ id: "cus_fixture" });
    mocks.createPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test/session",
    });
  });

  it("reports a subscription-store failure without changing the 500 response", async () => {
    mocks.select.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create portal session",
    });
    expect(mocks.report).toHaveBeenCalledWith({
      operation: "billing_portal",
      errorCode: "billing_portal_subscription_read_failed",
      retryable: true,
    });
    expect(mocks.retrieveCustomer).not.toHaveBeenCalled();
  });

  it("keeps an untyped Stripe lookup rejection redacted and retryable", async () => {
    mocks.retrieveCustomer.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error:
        "Stripe customer not found. Your subscription may need to be recreated.",
      code: "CUSTOMER_NOT_FOUND",
    });
    expect(mocks.report).toHaveBeenCalledWith({
      operation: "billing_portal",
      errorCode: "billing_portal_customer_lookup_failed",
      retryable: true,
    });
  });

  it("keeps a portal-session provider failure redacted and retryable", async () => {
    mocks.createPortalSession.mockRejectedValue(
      new Error("provider unavailable")
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create portal session",
    });
    expect(mocks.report).toHaveBeenCalledWith({
      operation: "billing_portal",
      errorCode: "billing_portal_session_failed",
      retryable: true,
    });
  });

  it("preserves the successful canonical portal response", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      portalUrl: "https://billing.stripe.test/session",
    });
    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: "cus_fixture",
      return_url: "https://preview.meelni.test/dashboard/subscription",
    });
    expect(mocks.report).not.toHaveBeenCalled();
  });
});

function request() {
  return new Request("https://preview.meelni.test/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      returnUrl: "https://preview.meelni.test/dashboard/subscription",
    }),
  });
}
