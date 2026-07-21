import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitContactRequest: vi.fn(),
}));

vi.mock("@/lib/workflows/contact-submission", () => ({
  submitContactRequest: mocks.submitContactRequest,
}));

import { POST } from "./route";

const originalSecret = process.env.DEMO_ABUSE_HMAC_SECRET;

describe("POST /api/contact", () => {
  afterAll(() => {
    process.env.DEMO_ABUSE_HMAC_SECRET = originalSecret;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_ABUSE_HMAC_SECRET = "s".repeat(43);
    mocks.submitContactRequest.mockResolvedValue({
      ok: true,
      status: 202,
      body: {
        receiptId: "11111111-1111-4111-8111-111111111111",
        receivedAt: "2026-07-21T23:00:00.000Z",
        duplicate: false,
      },
    });
  });

  it("stores a same-origin JSON request before claiming success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      receiptId: "11111111-1111-4111-8111-111111111111",
      receivedAt: "2026-07-21T23:00:00.000Z",
      duplicate: false,
    });
    expect(mocks.submitContactRequest).toHaveBeenCalledWith({
      name: "Savi",
      email: "savi@example.com",
      reason: "billing",
      message: "I need help with billing.",
      idempotencyKey: "contact-key-2026-07-21",
      ipAddress: "127.0.0.1",
      secret: "s".repeat(43),
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
  });

  it("rejects cross-site and non-JSON requests before parsing contact data", async () => {
    const crossSite = await POST(
      request(
        {},
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }
      )
    );
    expect(crossSite.status).toBe(403);

    const formPost = await POST(
      request({}, { "content-type": "application/x-www-form-urlencoded" })
    );
    expect(formPost.status).toBe(415);
    expect(mocks.submitContactRequest).not.toHaveBeenCalled();
  });

  it("fails invalid JSON without invoking durable storage", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
        },
        body: "{",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_contact_request",
    });
    expect(mocks.submitContactRequest).not.toHaveBeenCalled();
  });

  it("preserves retry guidance when durable storage rate-limits intake", async () => {
    mocks.submitContactRequest.mockResolvedValue({
      ok: false,
      status: 429,
      retryAfterSeconds: 600,
      body: { error: "contact_rate_limited" },
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    expect(await response.json()).toEqual({ error: "contact_rate_limited" });
  });
});

function request(
  body: Record<string, unknown> = {
    name: "Savi",
    email: "savi@example.com",
    reason: "billing",
    message: "I need help with billing.",
  },
  headers: Record<string, string> = {}
) {
  return new NextRequest("http://localhost:3000/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "idempotency-key": "contact-key-2026-07-21",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
