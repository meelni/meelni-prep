import assert from "node:assert/strict";
import test from "node:test";

import type { AccountDeletionRecord } from "@/lib/db/account-deletions";

import {
  deleteAccountWorkflow,
  isAlreadyDeletedProviderError,
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
      kind: "customer",
      providerId: "cus_test",
      fingerprint: "customer-fingerprint",
    },
    {
      kind: "customer",
      providerId: "cus_second",
      fingerprint: "second-customer-fingerprint",
    },
  ],
  attempts: 1,
};

test("durable deletion runs providers and application cleanup in retry-safe order", async () => {
  const calls: string[] = [];
  const result = await deleteAccountWorkflow(REQUEST, createDeps(calls));
  assert.deepEqual(calls, [
    `auth:${REQUEST.userId}`,
    "subscription:sub_test",
    "customer:cus_test",
    "customer:cus_second",
    `redact:${REQUEST.userId}`,
    `application:${REQUEST.userId}`,
    `completed:${REQUEST.userId}`,
  ]);
  assert.deepEqual(result, { alreadyCompleted: false });
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
  assert.deepEqual(calls, [`auth:${REQUEST.userId}`]);
  assert.equal(
    calls.some((call) => call.startsWith("completed:")),
    false
  );
});

test("completed deletion and missing provider records are idempotent", async () => {
  const calls: string[] = [];
  assert.deepEqual(
    await deleteAccountWorkflow(
      { ...REQUEST, status: "completed" },
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
