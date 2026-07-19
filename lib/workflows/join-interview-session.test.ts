import assert from "node:assert/strict";
import test from "node:test";

import type { LiveKitEnvironment } from "@/lib/internal/integrations";

import {
  classifyReconnectRateLimitError,
  type JoinInterviewSessionDeps,
  type JoinableInterviewSession,
  joinInterviewSessionWorkflow,
} from "./join-interview-session";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-07-09T12:20:00.000Z");
const ENV: LiveKitEnvironment = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  url: "wss://test.livekit.cloud",
};

test("join workflow derives token identity and room from authenticated server records", async () => {
  const issued: Parameters<JoinInterviewSessionDeps["issueToken"]>[0][] = [];
  const audits: Parameters<JoinInterviewSessionDeps["audit"]>[0][] = [];
  const result = await joinInterviewSessionWorkflow(
    {
      user: { id: USER_ID },
      sessionId: SESSION_ID,
      env: ENV,
    },
    createDeps({
      audit: (event) => audits.push(event),
      issueToken: async (input) => {
        issued.push(input);
        return {
          ok: true,
          provider: "livekit",
          data: {
            token: "signed-token",
            url: input.env.url,
            roomName: input.roomName,
            expiresAt: input.expiresAt,
          },
        };
      },
    })
  );

  assert.deepEqual(result, {
    ok: true,
    body: {
      token: "signed-token",
      url: ENV.url,
      roomName: "interview-server-owned-room",
      authorizationVersion: 3,
      expiresAt: "2026-07-09T12:30:00.000Z",
    },
  });
  assert.deepEqual(issued, [
    {
      identity: USER_ID,
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 300,
      observedAt: NOW,
      expiresAt: new Date("2026-07-09T12:30:00.000Z"),
      env: ENV,
    },
  ]);
  assert.deepEqual(audits, [
    {
      outcome: "allowed",
      reason: "reconnect_token_issued",
      correlationId: SESSION_ID,
    },
  ]);
});

test("join workflow rejects malformed session IDs before querying storage", async () => {
  let queried = false;
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: "not-a-uuid", env: ENV },
    createDeps({
      getSession: async () => {
        queried = true;
        return createSession();
      },
    })
  );

  assert.equal(result.ok, false);
  assert.equal(queried, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.body.error, "invalid_session_id");
  }
});

test("join workflow does not reveal whether a cross-user session exists", async () => {
  const missing = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({ getSession: async () => undefined })
  );
  const crossUser = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () => createSession({ userId: "another-user" }),
    })
  );

  assert.deepEqual(missing, crossUser);
  assert.deepEqual(crossUser, {
    ok: false,
    status: 404,
    body: { error: "session_not_found" },
  });
});

test("join workflow rejects completed and ended sessions", async () => {
  for (const session of [
    createSession({ lifecycleState: "ending" }),
    createSession({ status: "completed", lifecycleState: "completed" }),
    createSession({ status: "abandoned", lifecycleState: "abandoned" }),
    createSession({ status: "error", lifecycleState: "failed" }),
    createSession({ endedAt: new Date("2026-07-09T12:10:00.000Z") }),
  ]) {
    const result = await joinInterviewSessionWorkflow(
      { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
      createDeps({ getSession: async () => session })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.body.error, "session_not_joinable");
    }
  }
});

test("join workflow rejects expired sessions even if their status was never finalized", async () => {
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          startedAt: new Date("2026-07-09T11:39:59.000Z"),
          config: { duration: 30 },
        }),
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "session_not_joinable");
  }
});

test("join workflow allows one token-second before the deadline and rejects at the deadline", async () => {
  const before = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          startedAt: new Date("2026-07-09T12:00:00.000Z"),
          config: { duration: 30 },
          databaseNow: new Date("2026-07-09T12:29:59.000Z"),
        }),
    })
  );
  const at = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          startedAt: new Date("2026-07-09T12:00:00.000Z"),
          config: { duration: 30 },
          databaseNow: new Date("2026-07-09T12:30:00.000Z"),
        }),
    })
  );

  assert.equal(before.ok, true);
  assert.equal(at.ok, false);
  if (!at.ok) assert.equal(at.body.error, "session_not_joinable");
});

test("join workflow binds token lifetime to reconnect expiry", async () => {
  const reconnectDeadlineAt = new Date("2026-07-09T12:20:30.000Z");
  const before = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          lifecycleState: "reconnecting",
          reconnectDeadlineAt,
          databaseNow: new Date(reconnectDeadlineAt.getTime() - 1_000),
        }),
    })
  );
  const at = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          lifecycleState: "reconnecting",
          reconnectDeadlineAt,
          databaseNow: reconnectDeadlineAt,
        }),
    })
  );

  assert.equal(before.ok, true);
  if (before.ok) {
    assert.equal(before.body.expiresAt, reconnectDeadlineAt.toISOString());
    assert.equal(before.body.authorizationVersion, 3);
  }
  assert.equal(at.ok, false);
  if (!at.ok) assert.equal(at.body.error, "session_not_joinable");
});

test("a corrupt reconnect deadline cannot extend credentials past the hard deadline", async () => {
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          lifecycleState: "reconnecting",
          lifecycleVersion: 4,
          reconnectDeadlineAt: new Date("2026-07-09T12:31:00.000Z"),
          databaseNow: new Date("2026-07-09T12:29:50.000Z"),
        }),
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.body.expiresAt, "2026-07-09T12:30:00.000Z");
  }
});

test("a token completed after timeout is discarded when authorization generation changes", async () => {
  const reconnectDeadlineAt = new Date("2026-07-09T12:20:30.000Z");
  let current = createSession({
    lifecycleState: "reconnecting",
    lifecycleVersion: 4,
    reconnectDeadlineAt,
  });
  let releaseToken!: () => void;
  let issuedTtl = 0;
  const tokenPending = new Promise<void>((resolve) => {
    releaseToken = resolve;
  });
  const audits: Parameters<JoinInterviewSessionDeps["audit"]>[0][] = [];
  const resultPending = joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      audit: (event) => audits.push(event),
      getSession: async () => current,
      issueToken: async (input) => {
        issuedTtl = input.ttlSeconds;
        await tokenPending;
        return {
          ok: true,
          provider: "livekit",
          data: {
            token: "late-token",
            url: input.env.url,
            roomName: input.roomName,
            expiresAt: input.expiresAt,
          },
        };
      },
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  current = createSession({
    lifecycleState: "ending",
    lifecycleVersion: 5,
    reconnectDeadlineAt,
  });
  releaseToken();
  const result = await resultPending;

  assert.equal(issuedTtl, 30);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "session_not_joinable");
  }
  assert.equal(audits.at(-1)?.reason, "reconnect_authorization_changed");
});

test("a token is withheld when database time advances through its exp during signing", async () => {
  let reads = 0;
  const tokenExpiresAt = new Date("2026-07-09T12:20:01.000Z");
  const audits: Parameters<JoinInterviewSessionDeps["audit"]>[0][] = [];
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      audit: (event) => audits.push(event),
      getSession: async () => {
        reads += 1;
        return createSession({
          databaseNow: reads === 1 ? NOW : new Date(tokenExpiresAt.getTime()),
        });
      },
      issueToken: async (input) => ({
        ok: true,
        provider: "livekit",
        data: {
          token: "expired-during-signing",
          url: input.env.url,
          roomName: input.roomName,
          expiresAt: tokenExpiresAt,
        },
      }),
    })
  );

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "livekit_token_unavailable" },
  });
  assert.equal(
    audits.at(-1)?.reason,
    "livekit_token_expiry_invalid_after_authorization"
  );
});

test("version-one sessions require durable ready provisioning evidence", async () => {
  const cases: Array<Partial<JoinableInterviewSession>> = [
    { startContractVersion: 1, provisioningState: "pending" },
    { startContractVersion: 1, provisioningState: "provisioning" },
    { startContractVersion: 1, provisioningState: "failed" },
    {
      startContractVersion: 1,
      provisioningState: "ready",
      provisionedAt: null,
    },
    { startContractVersion: 2 },
  ];

  for (const fields of cases) {
    const result = await joinInterviewSessionWorkflow(
      { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
      createDeps({ getSession: async () => createSession(fields) })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.body.error, "session_not_joinable");
  }

  const ready = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          startContractVersion: 1,
          provisioningState: "ready",
          provisionedAt: new Date("2026-07-09T12:00:01.000Z"),
        }),
    })
  );
  assert.equal(ready.ok, true);
});

test("version-zero sessions remain joinable without provisioning evidence", async () => {
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({
          startContractVersion: 0,
          provisioningState: "legacy",
          provisionedAt: null,
        }),
    })
  );
  assert.equal(result.ok, true);
});

test("join workflow fails closed on an invalid authorization clock", async () => {
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      getSession: async () =>
        createSession({ databaseNow: new Date(Number.NaN) }),
    })
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error, "session_not_joinable");
});

test("join workflow rejects sessions without voice-room entitlement", async () => {
  for (const session of [
    createSession({ mode: "text" }),
    createSession({ livekitRoomName: null }),
  ]) {
    const result = await joinInterviewSessionWorkflow(
      { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
      createDeps({ getSession: async () => session })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.body.error, "session_not_joinable");
    }
  }
});

test("join workflow rate limits repeated token issuance before storage and audits the denial", async () => {
  let queried = false;
  const audits: Parameters<JoinInterviewSessionDeps["audit"]>[0][] = [];
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      audit: (event) => audits.push(event),
      consumeRateLimit: async () => ({
        allowed: false,
        retryAfterSeconds: 42,
      }),
      getSession: async () => {
        queried = true;
        return createSession();
      },
    })
  );

  assert.equal(queried, false);
  assert.deepEqual(result, {
    ok: false,
    status: 429,
    body: {
      error: "rate_limit_exceeded",
      message: "Too many reconnect attempts. Please try again shortly.",
    },
    retryAfterSeconds: 42,
  });
  assert.deepEqual(audits, [
    {
      outcome: "denied",
      reason: "reconnect_token_rate_limited",
    },
  ]);
});

test("distinct session IDs share one authenticated-user reconnect budget", async () => {
  let accepted = 0;
  let queried = 0;
  const limitedUserIds: string[] = [];
  const deps = createDeps({
    consumeRateLimit: async (userId) => {
      limitedUserIds.push(userId);
      accepted += 1;
      return {
        allowed: accepted <= 10,
        retryAfterSeconds: accepted <= 10 ? 0 : 30,
      };
    },
    getSession: async () => {
      queried += 1;
      return createSession();
    },
  });

  const results = [];
  for (let index = 1; index <= 11; index += 1) {
    const sessionId = `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`;
    results.push(
      await joinInterviewSessionWorkflow(
        { user: { id: USER_ID }, sessionId, env: ENV },
        deps
      )
    );
  }

  assert.equal(results.filter((result) => result.ok).length, 10);
  assert.equal(results[10]?.ok, false);
  if (!results[10]?.ok) assert.equal(results[10].status, 429);
  assert.equal(queried, 20);
  assert.deepEqual(limitedUserIds, Array(11).fill(USER_ID));
});

test("join workflow fails closed when the shared limiter is unavailable", async () => {
  let queried = false;
  const audits: Parameters<JoinInterviewSessionDeps["audit"]>[0][] = [];
  const result = await joinInterviewSessionWorkflow(
    { user: { id: USER_ID }, sessionId: SESSION_ID, env: ENV },
    createDeps({
      audit: (event) => audits.push(event),
      consumeRateLimit: async () => {
        throw new Error("database unavailable");
      },
      getSession: async () => {
        queried = true;
        return createSession();
      },
    })
  );

  assert.equal(queried, false);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: {
      error: "rate_limit_unavailable",
      message: "Reconnect authorization is temporarily unavailable.",
    },
  });
  assert.deepEqual(audits, [
    {
      outcome: "failed",
      reason: "reconnect_rate_limit_unavailable",
      diagnostic: "unknown",
    },
  ]);
});

test("limiter failures map to safe operational diagnostics", () => {
  assert.equal(
    classifyReconnectRateLimitError({ code: "42883" }),
    "missing_migration"
  );
  assert.equal(
    classifyReconnectRateLimitError({ code: "42501" }),
    "permission"
  );
  assert.equal(
    classifyReconnectRateLimitError(
      new Error("Invalid reconnect rate-limit result")
    ),
    "malformed_result"
  );
  assert.equal(
    classifyReconnectRateLimitError(new Error("connection timed out")),
    "timeout"
  );
});

function createDeps(
  overrides: Partial<JoinInterviewSessionDeps> = {}
): JoinInterviewSessionDeps {
  return {
    audit: () => undefined,
    consumeRateLimit: async () => ({
      allowed: true,
      retryAfterSeconds: 0,
    }),
    getSession: async () => createSession(),
    issueToken: async (input) => ({
      ok: true,
      provider: "livekit",
      data: {
        token: "signed-token",
        url: input.env.url,
        roomName: input.roomName,
        expiresAt: new Date(
          Math.min(
            Math.floor(input.expiresAt.getTime() / 1_000) * 1_000,
            Math.floor(input.observedAt.getTime() / 1_000) * 1_000 +
              input.ttlSeconds * 1_000
          )
        ),
      },
    }),
    ...overrides,
  };
}

function createSession(
  overrides: Partial<JoinableInterviewSession> = {}
): JoinableInterviewSession {
  return {
    id: SESSION_ID,
    userId: USER_ID,
    mode: "voice_video",
    livekitRoomName: "interview-server-owned-room",
    config: { duration: 30 },
    startedAt: new Date("2026-07-09T12:00:00.000Z"),
    endedAt: null,
    status: "in_progress",
    lifecycleState: "active",
    lifecycleVersion: 3,
    reconnectDeadlineAt: null,
    ...overrides,
    reconnectDeadlineOwner:
      overrides.reconnectDeadlineOwner ??
      (overrides.reconnectDeadlineAt ? "reconnect_grace" : null),
    databaseNow: overrides.databaseNow ?? NOW,
  };
}
