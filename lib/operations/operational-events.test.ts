import assert from "node:assert/strict";
import test from "node:test";

import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
} from "./operational-events";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("operational failures contain only the closed alert contract", () => {
  const writes: string[] = [];
  const correlationId = readOwnedInterviewSessionCorrelationId({
    kind: "owned_interview_session",
    session: { id: SESSION_ID, userId: USER_ID },
    authenticatedUserId: USER_ID,
  });
  const event = reportOperationalFailure(
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      severity: "critical",
      retryable: true,
      correlationId,
    },
    {
      now: () => new Date("2026-07-18T20:00:00.000Z"),
      env: {
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_SHA: "1234567890abcdef1234567890abcdef12345678",
      },
      write: (value) => writes.push(value),
    }
  );

  assert.deepEqual(event, {
    event: "meelni_operational_failure",
    version: 1,
    occurredAt: "2026-07-18T20:00:00.000Z",
    environment: "preview",
    release: "1234567890ab",
    operation: "interview_start",
    errorCode: "interview_start_failed",
    severity: "critical",
    retryable: true,
    requestId: null,
    correlationId: SESSION_ID,
  });
  assert.deepEqual(writes, [JSON.stringify(event)]);
  assert.deepEqual(Object.keys(event).sort(), [
    "correlationId",
    "environment",
    "errorCode",
    "event",
    "occurredAt",
    "operation",
    "release",
    "requestId",
    "retryable",
    "severity",
    "version",
  ]);
});

test("untrusted identifiers and deployment values fail closed", () => {
  const correlationId = readOwnedInterviewSessionCorrelationId({
    kind: "owned_interview_session",
    session: { id: "customer@example.com", userId: USER_ID },
    authenticatedUserId: USER_ID,
  });
  const event = reportOperationalFailure(
    {
      operation: "stripe_webhook",
      errorCode: "stripe_webhook_failed",
      retryable: true,
      correlationId,
    },
    {
      now: () => new Date("2026-07-18T20:00:00.000Z"),
      env: {
        VERCEL_ENV: "customer@example.com",
        VERCEL_GIT_COMMIT_SHA: "not-a-release",
      },
      write: () => {},
    }
  );

  assert.equal(event.environment, "unknown");
  assert.equal(event.release, null);
  assert.equal(event.requestId, null);
  assert.equal(event.correlationId, null);
});

test("unknown dynamic fields fail closed without being written", () => {
  const secret = ["sk", "live", "redacted-test-value"].join("_");
  for (const input of [
    {
      operation: "customer@example.com",
      errorCode: "interview_start_failed",
      retryable: true,
    },
    {
      operation: "interview_start",
      errorCode: secret,
      retryable: true,
    },
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      severity: secret,
      retryable: true,
    },
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      retryable: "customer@example.com",
    },
  ]) {
    const writes: string[] = [];
    const event = reportOperationalFailure(input as never, {
      now: () => new Date(),
      env: {},
      write: (value) => writes.push(value),
    });
    assert.equal(event.errorCode, "operational_reporter_failed");
    assert.deepEqual(writes, []);
    assert.doesNotMatch(JSON.stringify(event), /customer|secret|sk_live/);
  }
});

test("reporter failures cannot mask the product failure", () => {
  const input = {
    operation: "interview_start" as const,
    errorCode: "interview_start_failed" as const,
    retryable: true,
  };
  for (const dependencies of [
    {
      now: () => {
        throw new Error("clock");
      },
      env: {},
      write: () => {},
    },
    {
      now: () => new Date(),
      env: {},
      write: () => {
        throw new Error("sink");
      },
    },
  ]) {
    assert.doesNotThrow(() => reportOperationalFailure(input, dependencies));
    assert.equal(
      reportOperationalFailure(input, dependencies).errorCode,
      "operational_reporter_failed"
    );
  }
});

test("only ownership-validated interview sessions can become correlations", () => {
  assert.equal(
    readOwnedInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: SESSION_ID, userId: USER_ID },
      authenticatedUserId: USER_ID,
    }),
    SESSION_ID
  );
  for (const source of [
    {
      kind: "owned_interview_session",
      session: { id: USER_ID, userId: USER_ID },
      authenticatedUserId: USER_ID,
    },
    {
      kind: "owned_interview_session",
      session: { id: SESSION_ID, userId: USER_ID },
      authenticatedUserId: "22222222-2222-4222-8222-222222222222",
    },
    {
      kind: "supabase_user",
      session: { id: SESSION_ID, userId: USER_ID },
      authenticatedUserId: USER_ID,
    },
  ]) {
    assert.equal(readOwnedInterviewSessionCorrelationId(source as never), null);
  }
});

test("the typed reporter cannot accept arbitrary context or exceptions", () => {
  if (false) {
    reportOperationalFailure({
      operation: "auth_callback",
      errorCode: "auth_code_exchange_failed",
      retryable: true,
      // @ts-expect-error Arbitrary failure data is outside the privacy boundary.
      error: new Error("customer@example.com"),
    });
  }
  assert.ok(true);
});
