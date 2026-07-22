import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeContactSubmissionAttemptBudget,
  createContactAttemptRateLimitIdentity,
  createContactRateLimitIdentities,
  resolveAuthenticatedContactUserId,
  resolveReactivationAccess,
  reportOperationalFailure,
  submitContactRequest,
} = vi.hoisted(() => ({
  consumeContactSubmissionAttemptBudget: vi.fn(),
  createContactAttemptRateLimitIdentity: vi.fn(),
  createContactRateLimitIdentities: vi.fn(),
  resolveAuthenticatedContactUserId: vi.fn(),
  resolveReactivationAccess: vi.fn(),
  reportOperationalFailure: vi.fn(),
  submitContactRequest: vi.fn(),
}));

vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess,
}));
vi.mock("@/lib/operations/operational-events", () => ({
  reportOperationalFailure,
}));

vi.mock("@/lib/db/contact-submissions", () => ({
  consumeContactSubmissionAttemptBudget,
  createDrizzleContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/contact/authenticated-submitter", () => ({
  resolveAuthenticatedContactUserId,
}));
vi.mock("@/lib/security/contact-rate-limit-identity", () => ({
  createContactAttemptRateLimitIdentity,
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
    consumeContactSubmissionAttemptBudget.mockReset();
    createContactAttemptRateLimitIdentity.mockReset();
    createContactRateLimitIdentities.mockReset();
    resolveAuthenticatedContactUserId.mockReset();
    resolveReactivationAccess.mockReset();
    reportOperationalFailure.mockReset();
    resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: true,
    });
    consumeContactSubmissionAttemptBudget.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    createContactAttemptRateLimitIdentity.mockReturnValue("d".repeat(64));
    resolveAuthenticatedContactUserId.mockResolvedValue(null);
    createContactRateLimitIdentities.mockReturnValue({
      attempt: "d".repeat(64),
      client: "a".repeat(64),
      email: "b".repeat(64),
      global: "c".repeat(64),
    });
  });

  it("rejects disabled relaunch access before identity, budget, or body reads", async () => {
    resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: false,
    });
    const unreadBody = new ReadableStream({
      pull() {
        throw new Error("body_must_not_be_read");
      },
    });

    const response = await POST(
      new NextRequest("https://meelni.example/api/contact", {
        method: "POST",
        body: unreadBody,
        duplex: "half",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "contact_unavailable",
      retryable: false,
    });
    expect(createContactAttemptRateLimitIdentity).not.toHaveBeenCalled();
    expect(consumeContactSubmissionAttemptBudget).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("fails closed and reports a fixed event when access resolution fails", async () => {
    resolveReactivationAccess.mockRejectedValue(new Error("statsig-secret"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(reportOperationalFailure).toHaveBeenCalledWith({
      operation: "contact_submission",
      errorCode: "contact_submission_access_check_failed",
      severity: "error",
      retryable: true,
    });
    expect(createContactAttemptRateLimitIdentity).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
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
    submitContactRequest.mockResolvedValue({
      ok: false,
      code: "rate_limited",
      retryable: true,
      retryAfterSeconds: 31,
    });

    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("31");
    expect(reportOperationalFailure).not.toHaveBeenCalled();
  });

  it("consumes the attempt budget before parsing or resolving authentication", async () => {
    const order: string[] = [];
    consumeContactSubmissionAttemptBudget.mockImplementation(async () => {
      order.push("attempt");
      return { allowed: true, retryAfterSeconds: 0 };
    });
    resolveAuthenticatedContactUserId.mockImplementation(async () => {
      order.push("auth");
      return null;
    });
    submitContactRequest.mockImplementation(async () => {
      order.push("storage");
      return {
        ok: true,
        state: "stored",
        receiptId: "11111111-1111-4111-8111-111111111111",
        duplicate: false,
      };
    });

    await POST(request(validBody));

    expect(order).toEqual(["attempt", "auth", "storage"]);
  });

  it("rejects an exhausted attempt budget before auth or storage", async () => {
    consumeContactSubmissionAttemptBudget.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 29,
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("29");
    expect(resolveAuthenticatedContactUserId).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("does not call storage for invalid input or a missing idempotency key", async () => {
    const missingKey = await POST(request(validBody, false));
    const invalidBody = await POST(request({ ...validBody, message: "short" }));

    expect(missingKey.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(consumeContactSubmissionAttemptBudget).toHaveBeenCalledTimes(2);
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before parsing or storage", async () => {
    const response = await POST(
      request({ ...validBody, message: "m".repeat(33 * 1024) })
    );

    expect(response.status).toBe(413);
    expect(consumeContactSubmissionAttemptBudget).toHaveBeenCalledTimes(1);
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("returns 503 instead of false success when storage is unavailable", async () => {
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
    expect(reportOperationalFailure).toHaveBeenCalledWith({
      operation: "contact_submission",
      errorCode: "contact_submission_storage_failed",
      severity: "error",
      retryable: true,
    });
  });

  it("fails closed before storage when trusted-edge identity is unavailable", async () => {
    createContactAttemptRateLimitIdentity.mockImplementation(() => {
      throw new Error("contact_trusted_edge_unavailable");
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(consumeContactSubmissionAttemptBudget).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
    expect(reportOperationalFailure).toHaveBeenCalledWith({
      operation: "contact_submission",
      errorCode: "contact_submission_security_configuration_failed",
      severity: "critical",
      retryable: false,
    });
  });

  it("fails closed after the attempt budget when accepted-request identities are unavailable", async () => {
    createContactRateLimitIdentities.mockImplementation(() => {
      throw new Error("contact_trusted_edge_unavailable");
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(consumeContactSubmissionAttemptBudget).toHaveBeenCalledTimes(1);
    expect(resolveAuthenticatedContactUserId).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
    expect(reportOperationalFailure).toHaveBeenCalledWith({
      operation: "contact_submission",
      errorCode: "contact_submission_security_configuration_failed",
      severity: "critical",
      retryable: false,
    });
  });

  it("fails closed with fixed-code telemetry when authenticated linkage cannot be verified", async () => {
    resolveAuthenticatedContactUserId.mockRejectedValue(
      new Error("supabase-provider-secret")
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(503);
    expect(submitContactRequest).not.toHaveBeenCalled();
    expect(reportOperationalFailure).toHaveBeenCalledWith({
      operation: "contact_submission",
      errorCode: "contact_submission_auth_link_failed",
      severity: "error",
      retryable: true,
    });
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("rejects unknown client fields instead of silently stripping them", async () => {
    const response = await POST(
      request({ ...validBody, userId: "attacker-controlled" })
    );

    expect(response.status).toBe(400);
    expect(resolveAuthenticatedContactUserId).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("denies a malformed request before reading its body when the attempt budget is exhausted", async () => {
    consumeContactSubmissionAttemptBudget.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 23,
    });
    const unreadBody = new ReadableStream({
      pull() {
        throw new Error("body_must_not_be_read");
      },
    });
    const response = await POST(
      new NextRequest("https://meelni.example/api/contact", {
        method: "POST",
        body: unreadBody,
        duplex: "half",
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(submitContactRequest).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON request after consuming the durable attempt budget", async () => {
    const response = await POST(
      new NextRequest("https://meelni.example/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          "x-vercel-forwarded-for": "203.0.113.8",
        },
        body: JSON.stringify(validBody),
      })
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "invalid_request",
      retryable: false,
    });
    expect(consumeContactSubmissionAttemptBudget).toHaveBeenCalledOnce();
    expect(resolveAuthenticatedContactUserId).not.toHaveBeenCalled();
    expect(submitContactRequest).not.toHaveBeenCalled();
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
