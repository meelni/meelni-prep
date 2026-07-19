import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  report: vi.fn(),
  retrieveCustomer: vi.fn(),
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
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  })),
}));

vi.mock("@/lib/operations/operational-events", () => ({
  reportOperationalFailure: mocks.report,
}));

import { POST } from "./route";

describe("POST /api/customer-portal operational failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user_fixture" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.retrieveCustomer.mockResolvedValue({ id: "cus_fixture" });
    mocks.createPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test/session",
    });
  });

  it("keeps an expected account without a subscription as a quiet 404", async () => {
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.retrieveCustomer).not.toHaveBeenCalled();
  });

  it("separates a subscription-store outage from the expected empty state", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST_fixture" },
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

  it("classifies an untyped Stripe lookup rejection as retryable", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_fixture" },
      error: null,
    });
    mocks.retrieveCustomer.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.report).toHaveBeenCalledWith({
      operation: "billing_portal",
      errorCode: "billing_portal_customer_lookup_failed",
      retryable: true,
    });
  });

  it("keeps a portal-session provider failure redacted and retryable", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_fixture" },
      error: null,
    });
    mocks.createPortalSession.mockRejectedValue(
      new Error("provider unavailable")
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.report).toHaveBeenCalledWith({
      operation: "billing_portal",
      errorCode: "billing_portal_session_failed",
      retryable: true,
    });
  });

  it("preserves the successful portal response", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_fixture" },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    });
    expect(mocks.report).not.toHaveBeenCalled();
  });
});

function request() {
  return new NextRequest("https://preview.meelni.test/api/customer-portal", {
    method: "POST",
  });
}
