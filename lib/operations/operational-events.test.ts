import assert from "node:assert/strict";
import test from "node:test";

import {
  readInterviewSessionCorrelationId,
  readOperationalRequestId,
  reportOperationalFailure,
} from "./operational-events";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("operational failures contain only the bounded alert contract", () => {
  const writes: string[] = [];
  const requestId = readOperationalRequestId(
    new Request("https://meelni.test", {
      headers: { "x-vercel-id": "sfo1::request-123" },
    })
  );
  const correlationId = readInterviewSessionCorrelationId({
    kind: "interview_session",
    sessionId: SESSION_ID,
  });
  const event = reportOperationalFailure(
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      severity: "critical",
      retryable: true,
      requestId,
      correlationId,
    },
    {
      now: () => new Date("2026-07-10T20:00:00.000Z"),
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
    occurredAt: "2026-07-10T20:00:00.000Z",
    environment: "preview",
    release: "1234567890ab",
    operation: "interview_start",
    errorCode: "interview_start_failed",
    severity: "critical",
    retryable: true,
    requestId: "sfo1::request-123",
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

test("untrusted identifiers and environment values fail closed", () => {
  const requestId = readOperationalRequestId(
    new Request("https://meelni.test", {
      headers: { "x-vercel-id": "customer@example.com" },
    })
  );
  const correlationId = readInterviewSessionCorrelationId({
    kind: "interview_session",
    sessionId: "cus_secret",
  });
  const event = reportOperationalFailure(
    {
      operation: "stripe_webhook",
      errorCode: "stripe_webhook_failed",
      retryable: true,
      requestId,
      correlationId,
    },
    {
      now: () => new Date("2026-07-10T20:00:00.000Z"),
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

test("arbitrary error messages cannot enter the structured event", () => {
  assert.throws(
    () =>
      reportOperationalFailure(
        {
          operation: "auth_callback",
          errorCode: "user@example.com token=secret",
          retryable: false,
        },
        {
          now: () => new Date(),
          env: {},
          write: () => {},
        }
      ),
    /bounded snake_case/
  );
});

test("request and interview-session correlation helpers accept only domain-owned identifiers", () => {
  const request = new Request("https://meelni.test", {
    headers: { "x-vercel-id": "iad1::safe-request" },
  });

  assert.equal(readOperationalRequestId(request), "iad1::safe-request");
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "interview_session",
      sessionId: SESSION_ID,
    }),
    SESSION_ID
  );
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "interview_session",
      sessionId: "user@example.com",
    }),
    null
  );
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "supabase_user",
      userId: SESSION_ID,
    } as never),
    null
  );
});

test("Supabase user references cannot enter the typed session factory", () => {
  const userReference = {
    kind: "supabase_user" as const,
    userId: SESSION_ID,
  };

  if (false) {
    // @ts-expect-error A user reference is not an interview-session source.
    readInterviewSessionCorrelationId(userReference);
    // @ts-expect-error A raw UUID string has no interview-session provenance.
    readInterviewSessionCorrelationId(userReference.userId);
  }

  assert.equal(userReference.userId, SESSION_ID);
});
