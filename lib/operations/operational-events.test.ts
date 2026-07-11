import assert from "node:assert/strict";
import test from "node:test";

import {
  readInterviewSessionCorrelationId,
  readOperationalRequestId,
  reportOperationalFailure,
} from "./operational-events";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("operational failures contain only the bounded alert contract", () => {
  const writes: string[] = [];
  const requestId = readOperationalRequestId(
    new Request("https://meelni.test", {
      headers: { "x-vercel-id": "sfo1::request-123" },
    })
  );
  const correlationId = readInterviewSessionCorrelationId({
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

test("untrusted identifiers and environment values fail closed", () => {
  const requestId = readOperationalRequestId(
    new Request("https://meelni.test", {
      headers: { "x-vercel-id": "customer@example.com" },
    })
  );
  const correlationId = readInterviewSessionCorrelationId({
    kind: "owned_interview_session",
    session: { id: "cus_secret", userId: USER_ID },
    authenticatedUserId: USER_ID,
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

test("unknown and secret-shaped error codes fail closed without throwing", () => {
  if (false) {
    reportOperationalFailure({
      operation: "auth_callback",
      // @ts-expect-error Unknown error codes are excluded from the contract.
      errorCode: "sk_live_secret_key",
      retryable: false,
    });
  }
  assert.equal(
    reportOperationalFailure(
      {
        operation: "auth_callback",
        errorCode: "sk_live_secret_key" as never,
        retryable: false,
      },
      {
        now: () => new Date(),
        env: {},
        write: () => {},
      }
    ).errorCode,
    "operational_reporter_failed"
  );
});

test("every dynamic event field is runtime-closed before serialization", () => {
  for (const input of [
    {
      operation: "customer@example.com",
      errorCode: "interview_start_failed",
      retryable: true,
    },
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      severity: "token-secret",
      retryable: true,
    },
    {
      operation: "interview_start",
      errorCode: "interview_start_failed",
      retryable: "user@example.com",
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
    assert.doesNotMatch(JSON.stringify(event), /customer|token|user@example/);
  }
});

test("throwing clocks and sinks cannot mask the product failure", () => {
  const base = {
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
    assert.doesNotThrow(() => reportOperationalFailure(base, dependencies));
    assert.equal(
      reportOperationalFailure(base, dependencies).errorCode,
      "operational_reporter_failed"
    );
  }
});

test("request headers are never treated as trusted operational identifiers", () => {
  const secretShapedValue = ["sk", "live", "redacted-test-value"].join("_");
  for (const value of [
    "iad1::apparently-platform-shaped",
    secretShapedValue,
    "550e8400-e29b-41d4-a716-446655440000",
    "+1-415-555-0199",
    "customer@example.com",
  ]) {
    assert.equal(
      readOperationalRequestId(
        new Request("https://meelni.test", {
          headers: { "x-vercel-id": value },
        })
      ),
      null
    );
  }
});

test("interview-session correlation helpers accept only domain-owned identifiers", () => {
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: SESSION_ID, userId: USER_ID },
      authenticatedUserId: USER_ID,
    }),
    SESSION_ID
  );
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: "user@example.com", userId: USER_ID },
      authenticatedUserId: USER_ID,
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
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: USER_ID, userId: USER_ID },
      authenticatedUserId: USER_ID,
    }),
    null
  );
  assert.equal(
    readInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: SESSION_ID, userId: USER_ID },
      authenticatedUserId: "22222222-2222-4222-8222-222222222222",
    }),
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
    readInterviewSessionCorrelationId({
      // @ts-expect-error A caller cannot relabel an unowned request UUID.
      kind: "interview_session",
      sessionId: userReference.userId,
    });
  }

  assert.equal(userReference.userId, SESSION_ID);
});
