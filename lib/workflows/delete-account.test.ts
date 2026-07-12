import assert from "node:assert/strict";
import test from "node:test";

import type { AccountDeletionRecord } from "@/lib/db/account-deletions";

import {
  deleteAccountWorkflow,
  isAlreadyDeletedProviderError,
  runSafeAccountDeletionStep,
  safeAccountDeletionError,
  type DeleteAccountWorkflowDeps,
} from "./delete-account";

const REQUEST: AccountDeletionRecord = {
  userId: "11111111-1111-4111-8111-111111111111",
  status: "processing",
  stripeSubjects: [
    {
      kind: "subscription",
      providerId: "sub_test",
      fingerprint: "subscription-fingerprint",
    },
    {
      kind: "invoice",
      providerId: "in_test",
      fingerprint: "invoice-fingerprint",
    },
    {
      kind: "payment_intent",
      providerId: "pi_test",
      fingerprint: "payment-fingerprint",
    },
    {
      kind: "customer",
      providerId: "cus_test",
      fingerprint: "customer-fingerprint",
    },
    {
      kind: "customer",
      providerId: "cus_second",
      fingerprint: "second-customer-fingerprint",
    },
    {
      kind: "payment_intent",
      providerId: "pi_tombstone_only",
      fingerprint: "payment-intent-fingerprint",
    },
    {
      kind: "charge",
      providerId: "ch_tombstone_only",
      fingerprint: "charge-fingerprint",
    },
  ],
  attempts: 1,
};

test("durable deletion runs providers and application cleanup in retry-safe order", async () => {
  const calls: string[] = [];
  const result = await deleteAccountWorkflow(REQUEST, createDeps(calls));
  assert.deepEqual(calls, [
    `redact:${REQUEST.userId}`,
    `application:${REQUEST.userId}`,
    `auth:${REQUEST.userId}`,
    "subscription:sub_test",
    "payment:payment_intent:pi_test",
    "payment:payment_intent:pi_tombstone_only",
    "payment:charge:ch_tombstone_only",
    "invoice:in_test",
    "customer:cus_test",
    "customer:cus_second",
    `completed:${REQUEST.userId}`,
  ]);
  assert.deepEqual(result, { alreadyCompleted: false });
});

test("payment and charge subjects remain correlation tombstones only", async () => {
  const calls: string[] = [];
  await deleteAccountWorkflow(REQUEST, createDeps(calls));
  assert.equal(calls.includes("customer:pi_tombstone_only"), false);
  assert.equal(calls.includes("customer:ch_tombstone_only"), false);
});

test("auth failure preserves the tombstone and never reports completion", async () => {
  const calls: string[] = [];
  const deps = createDeps(calls);
  deps.deleteAuthUser = async (userId) => {
    calls.push(`auth:${userId}`);
    throw Object.assign(new Error("provider unavailable"), {
      code: "auth_provider_unavailable",
    });
  };

  await assert.rejects(() => deleteAccountWorkflow(REQUEST, deps));
  assert.deepEqual(calls, [
    `redact:${REQUEST.userId}`,
    `application:${REQUEST.userId}`,
    `auth:${REQUEST.userId}`,
  ]);
  assert.equal(
    calls.some((call) => call.startsWith("completed:")),
    false
  );
});

test("account deletion never creates automatic payment or invoice refunds", async () => {
  const calls: string[] = [];
  await deleteAccountWorkflow(REQUEST, createDeps(calls));
  assert.equal(
    calls.some((call) => call.startsWith("payment:")),
    false
  );
  assert.equal(
    calls.some((call) => call.startsWith("invoice:")),
    false
  );
});

test("completed deletion and missing provider records are idempotent", async () => {
  const calls: string[] = [];
  assert.deepEqual(
    await deleteAccountWorkflow(
      {
        ...REQUEST,
        status: "completed",
        stripeSubjects: REQUEST.stripeSubjects.map((subject) => ({
          ...subject,
          providerId: null,
        })),
      },
      createDeps(calls)
    ),
    { alreadyCompleted: true }
  );
  assert.deepEqual(calls, []);
  assert.equal(
    isAlreadyDeletedProviderError({ code: "resource_missing" }),
    true
  );
  assert.equal(isAlreadyDeletedProviderError({ code: "user_not_found" }), true);
  assert.equal(isAlreadyDeletedProviderError({ status: 404 }), true);
});

test("completed tombstones with late raw references remain recoverable", async () => {
  const calls: string[] = [];
  await deleteAccountWorkflow(
    { ...REQUEST, status: "completed" },
    createDeps(calls)
  );
  assert.equal(
    calls.some((call) => call.startsWith("payment:")),
    false
  );
  assert.equal(calls.includes("customer:cus_test"), true);
  assert.equal(calls.at(-1), `completed:${REQUEST.userId}`);
});

test("known financial fingerprints remain in the completed deletion snapshot", async () => {
  const calls: string[] = [];
  const completedFingerprints: string[][] = [];
  const deps = createDeps(calls);
  deps.markCompleted = async (_userId, fingerprints) => {
    completedFingerprints.push(fingerprints);
  };

  await deleteAccountWorkflow(REQUEST, deps);

  assert.equal(completedFingerprints[0]?.includes("invoice-fingerprint"), true);
  assert.equal(completedFingerprints[0]?.includes("payment-fingerprint"), true);
});

test("deletion failures are reduced to a stable code without raw details", () => {
  const safe = safeAccountDeletionError(
    Object.assign(new Error("postgresql://secret-host transcript text"), {
      query: "delete from interview_session",
    })
  );
  assert.equal(safe.code, "account_deletion_step_failed");
  assert.equal(safe.message, "Account deletion step failed");
  assert.equal(JSON.stringify(safe).includes("secret-host"), false);
  assert.equal("cause" in safe, false);
});

test("deletion preserves accepted provider failure categories", () => {
  assert.equal(
    safeAccountDeletionError(
      Object.assign(new Error("raw provider message"), {
        code: "stripe_provider_error",
      })
    ).code,
    "stripe_provider_error"
  );
});

test("the Inngest step boundary never rethrows raw application errors", async () => {
  await assert.rejects(
    () =>
      runSafeAccountDeletionStep(async () => {
        throw new Error("postgresql://secret-host user transcript");
      }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "account_deletion_step_failed"
      );
      assert.equal(JSON.stringify(error).includes("secret-host"), false);
      return true;
    }
  );
});

function createDeps(calls: string[]): DeleteAccountWorkflowDeps {
  return {
    cancelSubscription: async (id) => {
      calls.push(`subscription:${id}`);
    },
    deleteCustomer: async (id) => {
      calls.push(`customer:${id}`);
    },
    redactProviderLogs: async (request) => {
      calls.push(`redact:${request.userId}`);
    },
    deleteApplicationData: async (id) => {
      calls.push(`application:${id}`);
    },
    deleteAuthUser: async (id) => {
      calls.push(`auth:${id}`);
    },
    markCompleted: async (id) => {
      calls.push(`completed:${id}`);
    },
  };
}
