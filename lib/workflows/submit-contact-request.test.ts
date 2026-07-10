import assert from "node:assert/strict";
import test from "node:test";

import type { ContactSubmissionStore } from "./submit-contact-request";
import { submitContactRequest } from "./submit-contact-request";

const input = {
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  name: "Taylor",
  email: "taylor@example.invalid",
  reason: "support" as const,
  subject: "Account question",
  message: "I need help with my account settings.",
  rateLimitIdentities: {
    client: "a".repeat(64),
    email: "b".repeat(64),
    global: "c".repeat(64),
  },
};

test("reports a durable store commit and a replay without changing the receipt", async () => {
  const decisions = [
    { disposition: "stored" as const, receiptId: "receipt-1" },
    { disposition: "replayed" as const, receiptId: "receipt-1" },
  ];
  const store: ContactSubmissionStore = {
    async accept() {
      return decisions.shift()!;
    },
  };

  assert.deepEqual(await submitContactRequest(input, store), {
    ok: true,
    state: "stored",
    receiptId: "receipt-1",
    duplicate: false,
  });
  assert.deepEqual(await submitContactRequest(input, store), {
    ok: true,
    state: "stored",
    receiptId: "receipt-1",
    duplicate: true,
  });
});

test("preserves conflict and retry semantics", async () => {
  const conflict: ContactSubmissionStore = {
    async accept() {
      return { disposition: "idempotency_conflict" };
    },
  };
  const limited: ContactSubmissionStore = {
    async accept() {
      return { disposition: "rate_limited", retryAfterSeconds: 37 };
    },
  };

  assert.deepEqual(await submitContactRequest(input, conflict), {
    ok: false,
    code: "idempotency_conflict",
    retryable: false,
  });
  assert.deepEqual(await submitContactRequest(input, limited), {
    ok: false,
    code: "rate_limited",
    retryable: true,
    retryAfterSeconds: 37,
  });
});

test("maps storage exceptions to a retryable unavailable result", async () => {
  const unavailable: ContactSubmissionStore = {
    async accept() {
      throw new Error("private provider detail");
    },
  };

  assert.deepEqual(await submitContactRequest(input, unavailable), {
    ok: false,
    code: "storage_unavailable",
    retryable: true,
  });
});
