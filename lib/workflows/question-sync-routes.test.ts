import assert from "node:assert/strict";
import test from "node:test";

import {
  createManualQuestionSyncHandler,
  createScheduledQuestionSyncHandler,
} from "@/lib/question-sync/routes";
import type {
  QuestionSyncWorkflowInput,
  QuestionSyncWorkflowResult,
} from "./sync-question-bank";

const CRON_SECRET = "cron-sync-fixture-abc123-".repeat(2);
const OPERATOR_SECRET = "operator-sync-fixture-abc123-".repeat(2);
const TRIGGERED_AT = "2026-07-10T12:00:00.000Z";

test("scheduled sync fails closed for missing and invalid CRON_SECRET config", async () => {
  for (const secret of [undefined, "", "short-secret", "a".repeat(64)]) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createScheduledQuestionSyncHandler(
      routeDependencies(secret, calls)
    );
    const response = await handler(request("GET", CRON_SECRET));

    assert.equal(response.status, 503);
    assert.equal(
      (await response.json()).error.code,
      "question_sync_not_configured"
    );
    assert.deepEqual(calls, []);
  }
});

test("scheduled sync rejects missing, malformed, and mismatched credentials", async () => {
  for (const credential of [
    undefined,
    "wrong-secret",
    `Basic ${CRON_SECRET}`,
  ]) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createScheduledQuestionSyncHandler(
      routeDependencies(CRON_SECRET, calls)
    );
    const response = await handler(request("GET", credential));

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.deepEqual(calls, []);
  }
});

test("scheduled sync runs the locked workflow with safe response headers", async () => {
  const calls: QuestionSyncWorkflowInput[] = [];
  const handler = createScheduledQuestionSyncHandler(
    routeDependencies(CRON_SECRET, calls, completed("cron", false))
  );
  const response = await handler(request("GET", CRON_SECRET));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ trigger: "cron", dryRun: false }]);
  assert.deepEqual(await response.json(), {
    success: true,
    triggeredBy: "cron",
    triggeredAt: TRIGGERED_AT,
    dryRun: false,
    questionsAdded: 2,
    questionsUpdated: 0,
    questionsDeactivated: 1,
    questionsSkipped: 0,
    invalidRows: 0,
    exactDuplicateRows: 0,
    nearDuplicateRowsQuarantined: 0,
    duplicateRecordsRetired: 0,
    totalProcessed: 3,
    errors: 0,
  });
});

test("ordinary authenticated users cannot invoke manual sync", async () => {
  const productAuthHeaders: HeadersInit[] = [
    { cookie: "sb-access-token=ordinary-user-session" },
    {
      authorization:
        "Bearer ordinary-product-access-token-that-is-not-an-operator-secret",
      cookie: "sb-access-token=ordinary-user-session",
    },
  ];

  for (const headers of productAuthHeaders) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createManualQuestionSyncHandler(
      routeDependencies(OPERATOR_SECRET, calls)
    );
    const response = await handler(
      new Request("https://meelni.test/api/cron/sync-questions/manual", {
        method: "POST",
        headers,
      })
    );

    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  }
});

test("manual sync fails closed without a valid operator secret", async () => {
  for (const secret of [undefined, "short-operator-secret"]) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createManualQuestionSyncHandler(
      routeDependencies(secret, calls)
    );
    const response = await handler(request("POST", OPERATOR_SECRET));

    assert.equal(response.status, 503);
    assert.deepEqual(calls, []);
  }
});

test("authorized operators can request only live sync or dryRun", async () => {
  for (const [body, dryRun] of [
    [undefined, false],
    [JSON.stringify({ dryRun: true }), true],
  ] as const) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createManualQuestionSyncHandler(
      routeDependencies(OPERATOR_SECRET, calls, completed("manual", dryRun))
    );
    const response = await handler(request("POST", OPERATOR_SECRET, body));

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ trigger: "manual", dryRun }]);
  }
});

test("manual sync rejects malformed and unsupported options", async () => {
  for (const body of [
    "{",
    JSON.stringify({ dryRun: "yes" }),
    JSON.stringify({ verbose: true }),
  ]) {
    const calls: QuestionSyncWorkflowInput[] = [];
    const handler = createManualQuestionSyncHandler(
      routeDependencies(OPERATOR_SECRET, calls)
    );
    const response = await handler(request("POST", OPERATOR_SECRET, body));

    assert.equal(response.status, 400);
    assert.deepEqual(calls, []);
  }
});

test("manual options require application/json", async () => {
  const calls: QuestionSyncWorkflowInput[] = [];
  const handler = createManualQuestionSyncHandler(
    routeDependencies(OPERATOR_SECRET, calls)
  );
  const response = await handler(
    new Request("https://meelni.test/api/cron/sync-questions/manual", {
      method: "POST",
      headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
      body: "dryRun=true",
    })
  );

  assert.equal(response.status, 415);
  assert.deepEqual(calls, []);
});

test("overlap and failures map to retryable, redacted responses", async () => {
  const results: QuestionSyncWorkflowResult[] = [
    {
      status: "busy",
      success: false,
      trigger: "cron",
      dryRun: false,
      triggeredAt: TRIGGERED_AT,
      errorCode: "question_sync_in_progress",
    },
    {
      status: "failed",
      success: false,
      trigger: "cron",
      dryRun: false,
      triggeredAt: TRIGGERED_AT,
      errorCode: "question_sync_failed",
    },
    {
      status: "unavailable",
      success: false,
      trigger: "cron",
      dryRun: false,
      triggeredAt: TRIGGERED_AT,
      errorCode: "question_sync_unavailable",
    },
  ];

  for (const [index, result] of results.entries()) {
    const handler = createScheduledQuestionSyncHandler(
      routeDependencies(CRON_SECRET, [], result)
    );
    const response = await handler(request("GET", CRON_SECRET));
    const body = await response.text();

    assert.equal(response.status, [409, 500, 503][index]);
    if (index === 0) assert.equal(response.headers.get("retry-after"), "60");
    assert.doesNotMatch(body, /sheet|email|provider/i);
  }
});

function routeDependencies(
  secret: string | undefined,
  calls: QuestionSyncWorkflowInput[],
  result: QuestionSyncWorkflowResult = completed("cron", false)
) {
  return {
    getSecret: () => secret,
    run: async (input: QuestionSyncWorkflowInput) => {
      calls.push(input);
      return result;
    },
  };
}

function request(method: "GET" | "POST", credential?: string, body?: string) {
  const headers = new Headers();
  if (credential) {
    headers.set(
      "authorization",
      credential.startsWith("Basic ") ? credential : `Bearer ${credential}`
    );
  }
  if (body !== undefined) headers.set("content-type", "application/json");

  return new Request("https://meelni.test/api/cron/sync-questions", {
    method,
    headers,
    body,
  });
}

function completed(
  trigger: "cron" | "manual",
  dryRun: boolean
): QuestionSyncWorkflowResult {
  return {
    status: "completed",
    success: true,
    trigger,
    dryRun,
    triggeredAt: TRIGGERED_AT,
    summary: {
      questionsAdded: 2,
      questionsUpdated: 0,
      questionsDeactivated: 1,
      questionsSkipped: 0,
      invalidRows: 0,
      exactDuplicateRows: 0,
      nearDuplicateRowsQuarantined: 0,
      duplicateRecordsRetired: 0,
      totalProcessed: 3,
      errors: 0,
    },
  };
}
