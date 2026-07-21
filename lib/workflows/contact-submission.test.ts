import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { execute: mocks.execute },
}));

import {
  normalizeContactSubmission,
  submitContactRequest,
} from "./contact-submission";

describe("normalizeContactSubmission", () => {
  it("normalizes accepted fields without preserving whitespace noise", () => {
    const result = normalizeContactSubmission({
      name: "  Savi   Singh ",
      email: " Savi@Example.COM ",
      reason: "privacy",
      message: " hello\r\nthere ",
      idempotencyKey: "contact-key-2026-07-21",
      ipAddress: "127.0.0.1",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        name: "Savi Singh",
        email: "savi@example.com",
        reason: "privacy",
        message: "hello\nthere",
        idempotencyKey: "contact-key-2026-07-21",
        ipAddress: "127.0.0.1",
      },
    });
  });

  it("rejects unsupported reason, invalid email, invalid idempotency, and untrusted IP", () => {
    expect(
      normalizeContactSubmission({
        name: "Savi",
        email: "not-an-email",
        reason: "refund",
        message: "hello",
        idempotencyKey: "short",
        ipAddress: "unknown",
      })
    ).toEqual({ ok: false });
  });
});

describe("submitContactRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a durable receipt from the database function", async () => {
    mocks.execute.mockResolvedValue([
      {
        submission_id: "11111111-1111-4111-8111-111111111111",
        created_at: "2026-07-21T23:00:00.000Z",
        duplicate: false,
        rate_limited: false,
        limiting_scope: null,
        retry_after_seconds: 0,
      },
    ]);

    const result = await submitContactRequest(validInput());

    expect(result).toEqual({
      ok: true,
      status: 202,
      body: {
        receiptId: "11111111-1111-4111-8111-111111111111",
        receivedAt: "2026-07-21T23:00:00.000Z",
        duplicate: false,
      },
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("returns the same receipt semantics for duplicate exact retries", async () => {
    mocks.execute.mockResolvedValue([
      {
        submission_id: "11111111-1111-4111-8111-111111111111",
        created_at: new Date("2026-07-21T23:00:00.000Z"),
        duplicate: true,
        rate_limited: false,
        limiting_scope: null,
        retry_after_seconds: 0,
      },
    ]);

    const result = await submitContactRequest(validInput());

    expect(result).toMatchObject({
      ok: true,
      body: {
        receiptId: "11111111-1111-4111-8111-111111111111",
        duplicate: true,
      },
    });
  });

  it("fails closed when configuration or storage is unavailable", async () => {
    await expect(
      submitContactRequest({ ...validInput(), secret: undefined })
    ).resolves.toEqual({
      ok: false,
      status: 503,
      body: { error: "contact_configuration_unavailable" },
    });

    mocks.execute.mockRejectedValue(new Error("database unavailable"));
    await expect(submitContactRequest(validInput())).resolves.toEqual({
      ok: false,
      status: 503,
      body: { error: "contact_storage_unavailable" },
    });
  });

  it("passes through rate-limit retry guidance", async () => {
    mocks.execute.mockResolvedValue([
      {
        submission_id: null,
        created_at: null,
        duplicate: false,
        rate_limited: true,
        limiting_scope: "email",
        retry_after_seconds: 600,
      },
    ]);

    await expect(submitContactRequest(validInput())).resolves.toEqual({
      ok: false,
      status: 429,
      retryAfterSeconds: 600,
      body: { error: "contact_rate_limited" },
    });
  });
});

function validInput() {
  return {
    name: "Savi",
    email: "savi@example.com",
    reason: "billing" as const,
    message: "I need help with billing.",
    idempotencyKey: "contact-key-2026-07-21",
    ipAddress: "127.0.0.1",
    secret: "s".repeat(43),
  };
}
