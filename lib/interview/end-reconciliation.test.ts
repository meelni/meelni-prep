import assert from "node:assert/strict";
import test from "node:test";

import { reconcileAmbiguousInterviewEnd } from "./end-reconciliation";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("terminal truth navigates without repeating the end command", async () => {
  const requests: string[] = [];
  const result = await reconcileAmbiguousInterviewEnd({
    sessionId: SESSION_ID,
    retryEnd: true,
    request: async (input) => {
      requests.push(String(input));
      return Response.json({
        session: { lifecycleState: "completed", feedbackReady: true },
      });
    },
  });

  assert.deepEqual(result, {
    status: "resolved",
    nextHref: `/feedback/${SESSION_ID}/loading`,
    retryAttempted: false,
  });
  assert.deepEqual(requests, [`/api/session/${SESSION_ID}`]);
});

test("terminal truth navigates while feedback dispatch is still pending", async () => {
  const result = await reconcileAmbiguousInterviewEnd({
    sessionId: SESSION_ID,
    retryEnd: true,
    request: async () =>
      Response.json({
        session: { lifecycleState: "completed", feedbackReady: false },
      }),
  });

  assert.deepEqual(result, {
    status: "resolved",
    nextHref: `/feedback/${SESSION_ID}/loading`,
    retryAttempted: false,
  });
});

test("an active session retries the same idempotent end command", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const result = await reconcileAmbiguousInterviewEnd({
    sessionId: SESSION_ID,
    retryEnd: true,
    request: async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
      });
      if (String(input).includes("/api/session/")) {
        return Response.json({
          session: { lifecycleState: "active", feedbackReady: false },
        });
      }
      return Response.json({
        nextHref: `/feedback/${SESSION_ID}/loading`,
      });
    },
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.retryAttempted, true);
  assert.deepEqual(requests, [
    { url: `/api/session/${SESSION_ID}`, method: "GET" },
    { url: "/api/interview/end", method: "POST" },
  ]);
});

test("ending truth remains frozen and is only polled", async () => {
  let requests = 0;
  const result = await reconcileAmbiguousInterviewEnd({
    sessionId: SESSION_ID,
    retryEnd: true,
    request: async () => {
      requests += 1;
      return Response.json({
        session: { lifecycleState: "ending", feedbackReady: false },
      });
    },
  });

  assert.deepEqual(result, {
    status: "waiting",
    retryAttempted: false,
    reason: "terminalizing",
  });
  assert.equal(requests, 1);
});

test("transport ambiguity never authorizes a resume or navigation", async () => {
  const result = await reconcileAmbiguousInterviewEnd({
    sessionId: SESSION_ID,
    retryEnd: true,
    request: async () => {
      throw new TypeError("network unavailable");
    },
  });

  assert.deepEqual(result, {
    status: "waiting",
    retryAttempted: false,
    reason: "truth_unavailable",
  });
});
