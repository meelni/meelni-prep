import assert from "node:assert/strict";
import test from "node:test";

import {
  recoverInterviewCreditCandidates,
  recoverInterviewCreditWorkflow,
  type RecoverInterviewCreditDeps,
} from "./recover-interview-credit";

test("recovery terminalizes or repairs then converges credit", async () => {
  const calls: string[] = [];
  const deps: RecoverInterviewCreditDeps = {
    store: {
      async listCandidates() {
        return [];
      },
      async prepare() {
        calls.push("prepare");
        return {
          disposition: "recovered",
          creditDisposition: "released",
        };
      },
    },
    now: () => new Date("2026-07-10T08:30:00.000Z"),
  };

  assert.deepEqual(await recoverInterviewCreditWorkflow("session-1", deps), {
    disposition: "recovered",
    creditDisposition: "released",
  });
  assert.deepEqual(calls, ["prepare"]);
});
test("stale scan races become harmless no-ops", async () => {
  const deps: RecoverInterviewCreditDeps = {
    store: {
      async listCandidates() {
        return [];
      },
      async prepare() {
        return { disposition: "no_longer_recoverable" };
      },
    },
    now: () => new Date(),
  };
  assert.deepEqual(await recoverInterviewCreditWorkflow("session-1", deps), {
    disposition: "no_longer_recoverable",
  });
});

test("one poison recovery row cannot starve later candidates", async () => {
  const attempted: string[] = [];
  const results = await recoverInterviewCreditCandidates(
    [{ sessionId: "poison" }, { sessionId: "healthy" }],
    async (sessionId) => {
      attempted.push(sessionId);
      if (sessionId === "poison") throw new Error("corrupt evidence");
      return { disposition: "recovered", creditDisposition: "released" };
    }
  );

  assert.deepEqual(attempted, ["poison", "healthy"]);
  assert.deepEqual(results, [
    {
      disposition: "failed",
      sessionId: "poison",
      errorCode: "interview_credit_recovery_failed",
    },
    { disposition: "recovered", creditDisposition: "released" },
  ]);
});
