import assert from "node:assert/strict";
import test from "node:test";

import { providerFailure, providerSuccess } from "@/lib/internal/integrations";
import {
  requestUserEndRuntimeSettlementWorkflow,
  USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS,
  type RequestUserEndRuntimeSettlementDeps,
  type UserEndSettlementSession,
} from "./request-user-end-runtime-settlement";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "user-1";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("user end settles through trusted server data before terminalization", async () => {
  const fixture = createFixture();
  fixture.deps.requestRuntimeSettlement = async ({ request }) => {
    fixture.calls.push("request");
    assert.deepEqual(request, {
      contract_version: 1,
      event_type: "runtime_settlement_request",
      request_id: `user-end-settlement:${SESSION_ID}:2:2026-07-28T00:43:37.000Z`,
      session_id: SESSION_ID,
      room_name: "interview-room",
      writer_generation: 2,
      cutoff_at: "2026-07-28T00:43:37.000Z",
    });
    return providerSuccess("livekit", {});
  };
  fixture.deps.waitForRuntimeSettlement = async ({
    writerGeneration,
    timeoutMs,
  }) => {
    fixture.calls.push("ack");
    assert.equal(writerGeneration, 2);
    assert.equal(timeoutMs, USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS);
    return readiness("settled", 2);
  };

  const result = await run(fixture.deps);

  assert.deepEqual(fixture.calls, ["presence", "request", "ack"]);
  assert.deepEqual(result, {
    ok: true,
    settlement: {
      settled: true,
      pending: 0,
      failed: 0,
      overflowed: false,
      integrityUnavailable: false,
    },
  });
});

test("cross-user sessions fail before provider inspection", async () => {
  const fixture = createFixture();
  fixture.deps.getSession = async (sessionId, userId) => {
    assert.equal(sessionId, SESSION_ID);
    assert.equal(userId, USER_ID);
    return undefined;
  };

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "not_found",
    retryable: false,
  });
  assert.deepEqual(fixture.calls, []);
});

test("an existing writer settlement avoids another provider request", async () => {
  const fixture = createFixture();
  fixture.deps.getSettlementReadiness = async () => readiness("settled", 2);

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.calls, []);
});

test("missing agent presence remains retryable and does not invent settlement", async () => {
  const fixture = createFixture();
  fixture.deps.inspectPresence = async () => {
    fixture.calls.push("presence");
    return providerSuccess("livekit", {
      present: true,
      joined: true,
      joinedAt: new Date("2026-07-28T00:35:45.000Z"),
      agent: null,
    });
  };

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "runtime_not_ready",
    retryable: true,
  });
  assert.deepEqual(fixture.calls, ["presence"]);
});

test("a provider send failure remains retryable", async () => {
  const fixture = createFixture();
  fixture.deps.requestRuntimeSettlement = async () =>
    providerFailure("livekit", {
      code: "livekit_room_data_send_failed",
      message: "provider unavailable",
      retryable: true,
    });

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "provider_unavailable",
    retryable: true,
  });
});

test("a durable degraded settlement permits safe terminalization without feedback", async () => {
  const fixture = createFixture();
  fixture.deps.waitForRuntimeSettlement = async () => readiness("degraded", 2);

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: true,
    settlement: {
      settled: true,
      pending: 0,
      failed: 1,
      overflowed: false,
      integrityUnavailable: true,
    },
  });
});

test("explicit end can apply a shorter settlement budget than background cleanup", async () => {
  const fixture = createFixture();
  fixture.deps.waitForRuntimeSettlement = async ({ timeoutMs }) => {
    assert.equal(timeoutMs, 5_000);
    return readiness("settled", 2);
  };

  const result = await requestUserEndRuntimeSettlementWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      env: ENV,
      timeoutMs: 5_000,
    },
    fixture.deps
  );

  assert.equal(result.ok, true);
});

function createFixture(overrides: Partial<UserEndSettlementSession> = {}): {
  deps: RequestUserEndRuntimeSettlementDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const session: UserEndSettlementSession = {
    userId: USER_ID,
    roomName: "interview-room",
    lifecycleState: "active",
    startedAt: new Date("2026-07-28T00:35:38.384Z"),
    config: { duration: 30 },
    databaseNow: new Date("2026-07-28T00:43:37.000Z"),
    ...overrides,
  };
  return {
    calls,
    deps: {
      getSession: async () => session,
      getSettlementReadiness: async () => readiness(null, 2),
      inspectPresence: async () => {
        calls.push("presence");
        return providerSuccess("livekit", {
          present: true,
          joined: true,
          joinedAt: new Date("2026-07-28T00:35:45.000Z"),
          agent: {
            identity: "agent-worker",
            joinedAt: new Date("2026-07-28T00:35:43.000Z"),
          },
        });
      },
      requestRuntimeSettlement: async () => {
        calls.push("request");
        return providerSuccess("livekit", {});
      },
      waitForRuntimeSettlement: async () => {
        calls.push("ack");
        return readiness("settled", 2);
      },
    },
  };
}

function run(deps: RequestUserEndRuntimeSettlementDeps) {
  return requestUserEndRuntimeSettlementWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      env: ENV,
    },
    deps
  );
}

function readiness(
  state: "settled" | "degraded" | null,
  generation: number | null
) {
  const writerCount = generation === null ? 0 : 1;
  return {
    writerCount,
    settledCount: state === "settled" ? 1 : 0,
    degradedCount: state === "degraded" ? 1 : 0,
    missingCount: state === null && generation !== null ? 1 : 0,
    currentWriterGeneration: generation,
    currentWriterState: state,
    ready: state === "settled",
  };
}
