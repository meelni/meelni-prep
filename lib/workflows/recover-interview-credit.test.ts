import assert from "node:assert/strict";
import test from "node:test";

import {
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
        return "terminalized";
      },
    },
    async settleCredit(sessionId) {
      calls.push(`settle:${sessionId}`);
      return { disposition: "released" };
    },
    now: () => new Date("2026-07-10T08:30:00.000Z"),
  };

  assert.deepEqual(await recoverInterviewCreditWorkflow("session-1", deps), {
    disposition: "recovered",
    creditDisposition: "released",
  });
  assert.deepEqual(calls, ["prepare", "settle:session-1"]);
});
test("stale scan races become harmless no-ops", async () => {
  let settlements = 0;
  const deps: RecoverInterviewCreditDeps = {
    store: {
      async listCandidates() {
        return [];
      },
      async prepare() {
        return "no_longer_recoverable";
      },
    },
    async settleCredit() {
      settlements += 1;
      return { disposition: "released" };
    },
    now: () => new Date(),
  };
  assert.deepEqual(await recoverInterviewCreditWorkflow("session-1", deps), {
    disposition: "no_longer_recoverable",
  });
  assert.equal(settlements, 0);
});
