import assert from "node:assert/strict";
import test from "node:test";

import type { LiveKitPublicDemoProvider } from "@/lib/internal/integrations";

import {
  type StartPublicDemoDeps,
  startPublicDemoWorkflow,
} from "./start-public-demo";

const INPUT = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  participantIdentity: "demo-opaque",
  ipHash: "a".repeat(64),
  deviceHash: "b".repeat(64),
  deploymentScope: "production" as const,
  agentName: "demo-agent",
  env: {
    apiKey: "key",
    apiSecret: "secret",
    url: "wss://test.livekit.cloud",
  },
};
const RECOVERY_CLAIM = "11111111-1111-4111-8111-111111111111";

test("public demo workflow authorizes before provider work and maps a typed denial", async () => {
  const calls: string[] = [];
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => {
        calls.push("reserve");
        return {
          action: "rate_limited",
          roomName: null,
          limitingScope: "device",
          retryAfterSeconds: 600,
          remaining: 0,
          recoveryClaimToken: null,
          deadlineAt: null,
        };
      },
      livekit: provider({
        startPublicDemoRoom: async () => {
          calls.push("provider");
          throw new Error("must not run");
        },
      }),
    })
  );

  assert.deepEqual(calls, ["reserve"]);
  assert.deepEqual(result, {
    ok: false,
    status: 429,
    body: {
      error: "demo_rate_limited",
      retryAfterSeconds: 600,
      retryAt: "2026-07-09T12:10:00.000Z",
    },
    retryAfterSeconds: 600,
  });
});

test("public demo workflow provisions one room and durably finalizes it", async () => {
  const calls: string[] = [];
  let startInput:
    | Parameters<LiveKitPublicDemoProvider["startPublicDemoRoom"]>[0]
    | undefined;
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => {
        calls.push("reserve");
        return allowed("provision");
      },
      livekit: provider({
        startPublicDemoRoom: async (input) => {
          startInput = input;
          calls.push(`start:${input.roomName}:${input.metadata && "metadata"}`);
          return success(input.roomName);
        },
      }),
      completeSession: async (_id, status) => {
        calls.push(`complete:${status}`);
        return true;
      },
    })
  );

  assert.deepEqual(calls, [
    "reserve",
    "start:demo-room:metadata",
    "complete:ready",
  ]);
  assert.deepEqual(startInput?.metadata, {
    contract_version: 1,
    type: "demo",
    duration_seconds: 120,
    participant_identity: INPUT.participantIdentity,
    deadline_at: "2026-07-09T12:02:00.000Z",
  });
  assert.equal(startInput?.identity, INPUT.participantIdentity);
  assert.equal(
    startInput?.observedAt.toISOString(),
    "2026-07-09T12:00:00.000Z"
  );
  assert.equal(startInput?.expiresAt.toISOString(), "2026-07-09T12:02:00.000Z");
  assert.deepEqual(result, {
    ok: true,
    body: {
      token: "signed-token",
      url: INPUT.env.url,
      durationSeconds: 120,
    },
  });
});

test("ready-session replay finalizes token two server-side without redispatch", async () => {
  const calls: string[] = [];
  let tokenInput:
    | Parameters<LiveKitPublicDemoProvider["issuePublicDemoToken"]>[0]
    | undefined;
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("issue_token"),
      livekit: provider({
        issuePublicDemoToken: async (input) => {
          tokenInput = input;
          calls.push(`token:${input.roomName}`);
          return success(input.roomName);
        },
        startPublicDemoRoom: async () => {
          calls.push("dispatch");
          throw new Error("replay must not redispatch");
        },
      }),
      finalizeRecovery: async (sessionId, claimToken) => {
        calls.push(`finalize:${sessionId}:${claimToken}`);
        return true;
      },
    })
  );

  assert.deepEqual(calls, [
    "token:demo-room",
    `finalize:${INPUT.sessionId}:${RECOVERY_CLAIM}`,
  ]);
  assert.equal(
    tokenInput?.observedAt.toISOString(),
    "2026-07-09T12:00:00.000Z"
  );
  assert.equal(tokenInput?.agentName, INPUT.agentName);
  assert.equal(tokenInput?.expiresAt.toISOString(), "2026-07-09T12:02:00.000Z");
  assert.deepEqual(result, {
    ok: true,
    body: {
      token: "signed-token",
      url: INPUT.env.url,
      durationSeconds: 120,
    },
  });
});

test("recovery finalization failure never exposes the minted token", async () => {
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("issue_token"),
      finalizeRecovery: async () => false,
    })
  );

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    resetSessionCookie: true,
  });
});

test("recovery refuses a token after its delivery margin elapses", async () => {
  const calls: string[] = [];
  let currentTime = new Date("2026-07-09T12:00:00.000Z");
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("issue_token"),
      livekit: provider({
        issuePublicDemoToken: async (input) => {
          currentTime = new Date("2026-07-09T12:01:56.000Z");
          return success(input.roomName);
        },
      }),
      finalizeRecovery: async () => {
        calls.push("finalize");
        return true;
      },
      failRecovery: async (_sessionId, _claimToken, failureCode) => {
        calls.push(`fail:${failureCode}`);
        return true;
      },
      now: () => currentTime,
    })
  );

  assert.deepEqual(calls, ["fail:livekit_demo_token_deadline_invalid"]);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    resetSessionCookie: true,
  });
});

test("initial provisioning cleans up when the token delivery margin elapses", async () => {
  const calls: string[] = [];
  let currentTime = new Date("2026-07-09T12:00:00.000Z");
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("provision"),
      livekit: provider({
        startPublicDemoRoom: async (input) => {
          currentTime = new Date("2026-07-09T12:01:56.000Z");
          return success(input.roomName);
        },
        deletePublicDemoRoom: async () => {
          calls.push("delete");
        },
      }),
      completeSession: async (_sessionId, status, failureCode) => {
        calls.push(`complete:${status}:${failureCode ?? "none"}`);
        return true;
      },
      now: () => currentTime,
    })
  );

  assert.deepEqual(calls, [
    "delete",
    "complete:failed:livekit_demo_token_deadline_invalid",
  ]);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    resetSessionCookie: true,
  });
});

test("transient recovery failure rolls back its claim and preserves the session cookie", async () => {
  const calls: string[] = [];
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("issue_token"),
      livekit: provider({
        issuePublicDemoToken: async () => ({
          ok: false,
          provider: "livekit",
          error: {
            code: "livekit_demo_room_verify_failed",
            message: "provider unavailable",
            retryable: true,
          },
        }),
      }),
      rollbackRecovery: async (sessionId, claimToken) => {
        calls.push(`rollback:${sessionId}:${claimToken}`);
        return true;
      },
    })
  );

  assert.deepEqual(calls, [`rollback:${INPUT.sessionId}:${RECOVERY_CLAIM}`]);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
  });
});

test("a verified missing agent invalidates the active session before cookie reset", async () => {
  const calls: string[] = [];
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("issue_token"),
      livekit: provider({
        issuePublicDemoToken: async () => ({
          ok: false,
          provider: "livekit",
          error: {
            code: "livekit_demo_room_not_ready",
            message: "agent participant missing",
            retryable: true,
          },
        }),
      }),
      failRecovery: async (sessionId, claimToken, failureCode) => {
        calls.push(`fail:${sessionId}:${claimToken}:${failureCode}`);
        return true;
      },
      rollbackRecovery: async () => {
        calls.push("rollback");
        return true;
      },
    })
  );

  assert.deepEqual(calls, [
    `fail:${INPUT.sessionId}:${RECOVERY_CLAIM}:livekit_demo_room_not_ready`,
  ]);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    resetSessionCookie: true,
  });
});

test("a verified invalid dispatch or failed cleanup terminalizes recovery", async (t) => {
  for (const failureCode of [
    "livekit_demo_dispatch_invalid",
    "livekit_demo_cleanup_failed",
  ]) {
    await t.test(failureCode, async () => {
      const calls: string[] = [];
      const result = await startPublicDemoWorkflow(
        INPUT,
        deps({
          reserveSession: async () => allowed("issue_token"),
          livekit: provider({
            issuePublicDemoToken: async () => ({
              ok: false,
              provider: "livekit",
              error: {
                code: failureCode,
                message: "dispatch state invalid",
                retryable: failureCode === "livekit_demo_cleanup_failed",
              },
            }),
          }),
          failRecovery: async (_sessionId, _claimToken, code) => {
            calls.push(`fail:${code}`);
            return true;
          },
          rollbackRecovery: async () => {
            calls.push("rollback");
            return true;
          },
        })
      );

      assert.deepEqual(calls, [`fail:${failureCode}`]);
      assert.deepEqual(result, {
        ok: false,
        status: 503,
        body: { error: "demo_temporarily_unavailable" },
        resetSessionCookie: true,
      });
    });
  }
});

test("terminal recovery failures never roll back when durable invalidation fails", async (t) => {
  for (const failMode of ["returns_false", "throws"] as const) {
    await t.test(failMode, async () => {
      const calls: string[] = [];
      const result = await startPublicDemoWorkflow(
        INPUT,
        deps({
          reserveSession: async () => allowed("issue_token"),
          livekit: provider({
            issuePublicDemoToken: async () => ({
              ok: false,
              provider: "livekit",
              error: {
                code: "livekit_demo_dispatch_invalid",
                message: "dispatch state invalid",
                retryable: false,
              },
            }),
          }),
          failRecovery: async () => {
            calls.push("fail");
            if (failMode === "throws") throw new Error("database unavailable");
            return false;
          },
          rollbackRecovery: async () => {
            calls.push("rollback");
            return true;
          },
        })
      );

      assert.deepEqual(calls, ["fail"]);
      assert.deepEqual(result, {
        ok: false,
        status: 503,
        body: { error: "demo_temporarily_unavailable" },
        resetSessionCookie: true,
      });
    });
  }
});

test("limiter failure fails closed without LiveKit work", async () => {
  let providerCalled = false;
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => {
        throw new Error("database unavailable");
      },
      livekit: provider({
        startPublicDemoRoom: async () => {
          providerCalled = true;
          return success("demo-room");
        },
      }),
    })
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
  });
});

test("an expired persisted deadline invalidates recovery without minting a token", async () => {
  const calls: string[] = [];
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => ({
        ...allowed("issue_token"),
        deadlineAt: new Date("2026-07-09T11:59:59.000Z"),
      }),
      livekit: provider({
        issuePublicDemoToken: async () => {
          calls.push("token");
          throw new Error("expired recovery must not mint");
        },
      }),
      failRecovery: async (_sessionId, _claimToken, failureCode) => {
        calls.push(`fail:${failureCode}`);
        return true;
      },
    })
  );

  assert.deepEqual(calls, ["fail:livekit_demo_token_deadline_invalid"]);
  assert.deepEqual(result, {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    resetSessionCookie: true,
  });
});

test("provider failure is recorded with a safe code", async () => {
  const completions: unknown[] = [];
  const audits: unknown[] = [];
  const result = await startPublicDemoWorkflow(
    INPUT,
    deps({
      reserveSession: async () => allowed("provision"),
      livekit: provider({
        startPublicDemoRoom: async () => ({
          ok: false,
          provider: "livekit",
          error: {
            code: "LiveKit/Dispatch Failed",
            message: "provider details",
            retryable: true,
          },
        }),
      }),
      completeSession: async (...args) => {
        completions.push(args);
        return true;
      },
      audit: (event) => audits.push(event),
    })
  );

  assert.deepEqual(completions, [
    [INPUT.sessionId, "failed", "livekit_dispatch_failed"],
  ]);
  assert.deepEqual(audits.at(-1), {
    outcome: "failed",
    reason: "livekit_dispatch_failed",
  });
  assert.equal(result.ok, false);
});

function deps(
  overrides: Partial<StartPublicDemoDeps> = {}
): StartPublicDemoDeps {
  return {
    audit: () => undefined,
    completeSession: async () => true,
    failRecovery: async () => true,
    finalizeRecovery: async () => true,
    livekit: provider(),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
    reserveSession: async () => allowed("provision"),
    rollbackRecovery: async () => true,
    ...overrides,
  };
}

function provider(
  overrides: Partial<LiveKitPublicDemoProvider> = {}
): LiveKitPublicDemoProvider {
  return {
    startPublicDemoRoom: async (input) => success(input.roomName),
    issuePublicDemoToken: async (input) => success(input.roomName),
    deletePublicDemoRoom: async () => undefined,
    ...overrides,
  };
}

function allowed(action: "provision" | "issue_token") {
  return {
    action,
    deadlineAt: new Date("2026-07-09T12:02:00.000Z"),
    roomName: "demo-room",
    limitingScope: null,
    retryAfterSeconds: 0,
    remaining: 1,
    recoveryClaimToken: action === "issue_token" ? RECOVERY_CLAIM : null,
  };
}

function success(roomName: string) {
  return {
    ok: true as const,
    provider: "livekit" as const,
    data: {
      token: "signed-token",
      url: INPUT.env.url,
      roomName,
      expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    },
  };
}
