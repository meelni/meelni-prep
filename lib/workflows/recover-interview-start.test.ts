import assert from "node:assert/strict";
import test from "node:test";

import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import {
  recoverInterviewStartWorkflow,
  type RecoverInterviewStartDeps,
} from "./recover-interview-start";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-07-10T12:00:00.000Z");
const ENV = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  url: "wss://example.invalid",
} satisfies LiveKitEnvironment;

test("stale start recovery terminalizes before release and cleanup", async () => {
  const calls: string[] = [];
  const deps = fixture({
    claim: async () => {
      calls.push("claim");
      return {
        disposition: "claimed" as const,
        sessionId: SESSION_ID,
        roomName: `interview-${SESSION_ID}`,
      };
    },
    convergeCredit: async () => {
      calls.push("release");
      return { disposition: "released" };
    },
    cleanupRoom: async () => {
      calls.push("cleanup");
      return { ok: true, disposition: "cleaned" };
    },
  });

  const result = await recoverInterviewStartWorkflow(
    { sessionId: SESSION_ID, env: ENV },
    deps
  );

  assert.deepEqual(calls, ["claim", "release", "cleanup"]);
  assert.deepEqual(result, {
    disposition: "recovered",
    creditDisposition: "released",
    cleanupDisposition: "cleaned",
  });
});

test("terminal recovery remains discoverable until credit settlement converges", async () => {
  const deps = fixture({
    claim: async () => ({
      disposition: "already_terminal" as const,
      sessionId: SESSION_ID,
      roomName: `interview-${SESSION_ID}`,
    }),
    convergeCredit: async () => ({ disposition: "released" }),
  });

  assert.deepEqual(
    await recoverInterviewStartWorkflow(
      { sessionId: SESSION_ID, env: null },
      deps
    ),
    {
      disposition: "settlement_recovered",
      creditDisposition: "released",
      cleanupDisposition: "cleanup_pending",
    }
  );
});

test("provider cleanup outage does not roll back terminalization or credit release", async () => {
  const deps = fixture({
    claim: async () => ({
      disposition: "claimed" as const,
      sessionId: SESSION_ID,
      roomName: `interview-${SESSION_ID}`,
    }),
    convergeCredit: async () => ({ disposition: "released" }),
    cleanupRoom: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.deepEqual(
    await recoverInterviewStartWorkflow(
      { sessionId: SESSION_ID, env: ENV },
      deps
    ),
    {
      disposition: "recovered",
      creditDisposition: "released",
      cleanupDisposition: "provider_retry_pending",
    }
  );
});

test("a recovered or active worker is fenced from duplicate settlement", async () => {
  let settled = false;
  const deps = fixture({
    claim: async () => ({ disposition: "no_longer_recoverable" as const }),
    convergeCredit: async () => {
      settled = true;
      return { disposition: "released" };
    },
  });

  assert.deepEqual(
    await recoverInterviewStartWorkflow(
      { sessionId: SESSION_ID, env: ENV },
      deps
    ),
    { disposition: "no_longer_recoverable" }
  );
  assert.equal(settled, false);
});

function fixture(
  overrides: Partial<Omit<RecoverInterviewStartDeps, "store">> & {
    claim?: RecoverInterviewStartDeps["store"]["claim"];
  } = {}
): RecoverInterviewStartDeps {
  const { claim, ...deps } = overrides;
  return {
    store: {
      listCandidates: async () => [],
      claim: claim ?? (async () => ({ disposition: "no_longer_recoverable" })),
    },
    convergeCredit: async () => ({ disposition: "pending" }),
    cleanupRoom: async () => ({ ok: true, disposition: "already_clean" }),
    now: () => NOW,
    ...deps,
  };
}
