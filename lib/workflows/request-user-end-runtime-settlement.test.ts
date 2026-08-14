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
  fixture.deps.requestRuntimeSettlement = async ({
    agentIdentity,
    request,
  }) => {
    fixture.calls.push("request");
    assert.equal(agentIdentity, "agent-worker");
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
    assert.ok(timeoutMs <= USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS);
    assert.ok(timeoutMs > 0);
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

test("a lost packet cannot suppress durable command acknowledgement", async () => {
  const fixture = createFixture();
  const command = settlementCommand();
  fixture.deps.getCommand = async () => command;
  fixture.deps.requestRuntimeSettlement = async () =>
    providerFailure("livekit", {
      code: "livekit_room_data_send_failed",
      message: "synthetic packet loss",
      retryable: true,
    });
  fixture.deps.waitForCommand = async ({ commandId }) => {
    assert.equal(commandId, command.commandId);
    return { ...command, state: "acknowledged", terminalReason: "settled" };
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.settlement.integrityUnavailable, false);
});

test("durable command discovery continues when provider configuration is absent", async () => {
  const fixture = createFixture();
  const command = settlementCommand();
  fixture.deps.getCommand = async () => command;
  fixture.deps.waitForCommand = async () => ({
    ...command,
    state: "acknowledged",
    terminalReason: "degraded",
  });

  const result = await requestUserEndRuntimeSettlementWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      env: null,
    },
    fixture.deps
  );

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
  assert.deepEqual(fixture.calls, []);
});

test("an unacknowledged durable command is terminally classified at the bound", async () => {
  const fixture = createFixture();
  const expiresAt = Date.now() + 1_000;
  const command = {
    ...settlementCommand(),
    cutoffAt: new Date(expiresAt - 20_000),
    expiresAt: new Date(expiresAt),
  };
  let expired = "";
  let waitBudgetMs = Number.POSITIVE_INFINITY;
  fixture.deps.getCommand = async () => command;
  fixture.deps.waitForCommand = async ({ timeoutMs }) => {
    waitBudgetMs = timeoutMs;
    return command;
  };
  fixture.deps.expireCommand = async (commandId) => {
    expired = commandId;
  };

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "runtime_not_ready",
    retryable: false,
  });
  assert.equal(expired, command.commandId);
  assert.ok(waitBudgetMs >= 1 && waitBudgetMs <= 1_000);
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

test("dispatch targeting rechecks the exact writer generation before one packet", async () => {
  const fixture = createFixture();
  const stages: string[] = [];
  fixture.deps.inspectPresence = async () =>
    providerSuccess("livekit", {
      present: true,
      joined: true,
      joinedAt: null,
      agent: { identity: "agent-dispatch-current", joinedAt: null },
      targetSource: "dispatch",
      targetReason: "dispatch_exact",
    });
  fixture.deps.onStage = ({ stage, targetSource, reason }) => {
    stages.push(`${stage}:${targetSource}:${reason}`);
  };
  let readinessReads = 0;
  fixture.deps.getSettlementReadiness = async () => {
    readinessReads += 1;
    return readiness(null, 2);
  };
  let sends = 0;
  fixture.deps.requestRuntimeSettlement = async ({ agentIdentity }) => {
    sends += 1;
    assert.equal(agentIdentity, "agent-dispatch-current");
    return providerSuccess("livekit", {});
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(readinessReads, 2);
  assert.equal(sends, 1);
  assert.deepEqual(stages, [
    "target_resolution:dispatch:dispatch_exact",
    "generation_recheck:dispatch:generation_current",
    "packet_send:dispatch:packet_sent",
    "durable_ack:dispatch:ack_settled",
  ]);
});

test("writer replacement during target lookup fails before packet delivery", async () => {
  const fixture = createFixture();
  let readinessReads = 0;
  fixture.deps.getSettlementReadiness = async () => {
    readinessReads += 1;
    return readiness(null, readinessReads === 1 ? 2 : 3);
  };
  let sends = 0;
  fixture.deps.requestRuntimeSettlement = async () => {
    sends += 1;
    return providerSuccess("livekit", {});
  };

  const result = await run(fixture.deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "runtime_not_ready",
    retryable: true,
  });
  assert.equal(readinessReads, 2);
  assert.equal(sends, 0);
});

test("a generation settled during target lookup returns durable truth without another packet", async () => {
  const fixture = createFixture();
  let readinessReads = 0;
  fixture.deps.getSettlementReadiness = async () => {
    readinessReads += 1;
    return readiness(readinessReads === 1 ? null : "settled", 2);
  };
  let sends = 0;
  fixture.deps.requestRuntimeSettlement = async () => {
    sends += 1;
    return providerSuccess("livekit", {});
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(readinessReads, 2);
  assert.equal(sends, 0);
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
    assert.ok(timeoutMs <= 5_000);
    assert.ok(timeoutMs > 0);
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

test("an accepted user end settles at the durable ending timestamp", async () => {
  const endingAt = new Date("2026-07-28T00:43:35.123Z");
  const fixture = createFixture({
    lifecycleState: "ending",
    terminalReason: "user_end",
    endingAt,
  });
  fixture.deps.requestRuntimeSettlement = async ({ request }) => {
    assert.equal(request.cutoff_at, endingAt.toISOString());
    return providerSuccess("livekit", {});
  };

  const result = await run(fixture.deps);

  assert.equal(result.ok, true);
});

test("a hanging provider call cannot exceed the settlement budget", async () => {
  const fixture = createFixture();
  fixture.deps.inspectPresence = async () => new Promise(() => {});
  const startedAt = Date.now();

  const result = await requestUserEndRuntimeSettlementWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      env: ENV,
      timeoutMs: 10,
    },
    fixture.deps
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "provider_unavailable");
  assert.ok(Date.now() - startedAt < 250);
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
    terminalReason: null,
    endingAt: null,
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

function settlementCommand() {
  return {
    sessionId: SESSION_ID,
    lifecycleVersion: 4,
    contractVersion: 1,
    commandId: `runtime-settlement:${SESSION_ID}:4`,
    roomName: "interview-room",
    writerId: "writer-2",
    writerGeneration: 2,
    cutoffAt: new Date("2099-07-28T00:43:37.000Z"),
    state: "pending" as const,
    terminalReason: null,
    createdAt: new Date("2099-07-28T00:43:37.000Z"),
    expiresAt: new Date("2099-07-28T00:43:57.000Z"),
    acknowledgedAt: null,
    terminalAt: null,
  };
}
