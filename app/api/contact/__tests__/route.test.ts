import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createContactRateLimitIdentities, submitContactRequest } = vi.hoisted(
  () => ({
    createContactRateLimitIdentities: vi.fn(),
    submitContactRequest: vi.fn(),
  })
);

vi.mock("@/lib/db/contact-submissions", () => ({
  createDrizzleContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/contact/authenticated-submitter", () => ({
  resolveAuthenticatedContactUserId: () => null,
}));
vi.mock("@/lib/security/contact-rate-limit-identity", () => ({
  createContactRateLimitIdentities,
}));
vi.mock("@/lib/workflows/submit-contact-request", () => ({
  submitContactRequest,
}));

import { POST } from "../route";

const validBody = {
  name: "Private Person",
  email: "private@example.invalid",
  reason: "support",
  subject: "Private subject",
  message: "This message must never appear in operational logs.",
};

describe("POST /api/contact", () => {
  beforeEach(() => {
    submitContactRequest.mockReset();
    createContactRateLimitIdentities.mockReset();
    createContactRateLimitIdentities.mockReturnValue({
      attempt: "d".repeat(64),
      client: "a".repeat(64),
      email: "b".repeat(64),
      global: "c".repeat(64),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 202 only after the workflow confirms durable storage", async () => {
    submitContactRequest.mockResolvedValue({
      ok: true,
      state: "stored",
      receiptId: "11111111-1111-4111-8111-111111111111",
      duplicate: false,
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "stored",
      receiptId: "11111111-1111-4111-8111-111111111111",
      duplicate: false,
    });
  });

  it("replays the same receipt with 200", async () => {
    submitContactRequest.mockResolvedValue({
      ok: true,
      state: "stored",
      receiptId: "11111111-1111-4111-8111-111111111111",
      duplicate: true,
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
  });

  it("returns retryable rate-limit semantics without logging PII", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    submitContactRequest.mockResolvedValue({
      ok: false,
      code: "rate_limited",
      retryable: true,
      retryAfterSeconds: 31,
    });

    const response = await POST(request(validBody));
    const serializedLogs = JSON.stringify(warning.mock.calls);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("31");
    expect(serializedLogs).not.toContain(validBody.name);
    expect(serializedLogs).not.toContain(validBody.email);
    expect(serializedLogs).not.toContain(validBody.subject);
    expect(serializedLogs).not.toContain(validBody.message);
    expect(warning).toHaveBeenCalledWith("contact_submission_rejected", {
      code: "rate_limited",
    });
  });

  it("does not call storage for invalid input or a missing idempotency key", async () => {
    const missingKey = await POST(request(validBody, false));
    const invalidBody = await POST(request({ ...validBody, message: "short" }));

    expect(missingKey.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before parsing or storage", async () => {
    const response = await POST(
      request({ ...validBody, message: "m".repeat(33 * 1024) })
    );

    expect(response.status).toBe(413);
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("returns 503 instead of false success when storage is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    submitContactRequest.mockResolvedValue({
      ok: false,
      code: "storage_unavailable",
      retryable: true,
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "storage_unavailable",
      retryable: true,
    });
    expect(log).toHaveBeenCalledWith("contact_submission_failed", {
      code: "storage_unavailable",
    });
  });

  it("fails closed before storage when trusted-edge identity is unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    createContactRateLimitIdentities.mockImplementation(() => {
      throw new Error("contact_trusted_edge_unavailable");
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(submitContactRequest).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("contact_submission_failed", {
      code: "security_configuration_unavailable",
    });
  });
});

function request(body: unknown, includeIdempotencyKey = true) {
  return new NextRequest("https://meelni.example/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeIdempotencyKey
        ? { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" }
        : {}),
    },
    body: JSON.stringify(body),
  });
}
