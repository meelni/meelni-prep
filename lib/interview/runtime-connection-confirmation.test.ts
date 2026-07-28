import assert from "node:assert/strict";
import test from "node:test";

import { confirmInterviewRuntimeReady } from "./runtime-connection-confirmation";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("canonical readiness retries connecting state until activation", async () => {
  const statuses = [202, 202, 200];
  const delays: number[] = [];
  const calls: Array<{ url: string; body: string | null }> = [];

  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0, 10, 20],
    wait: async (delayMs) => {
      delays.push(delayMs);
    },
    fetcher: async (url, init) => {
      const status = statuses.shift()!;
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return Response.json(
        {
          ready: status === 200,
          disposition: status === 200 ? "activated" : "connecting",
        },
        { status }
      );
    },
  });

  assert.equal(result, "ready");
  assert.deepEqual(delays, [10, 20]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, "/api/interview/presence");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    sessionId: SESSION_ID,
  });
});

test("authorization loss stops readiness retries", async () => {
  let calls = 0;
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0, 1, 2],
    wait: async () => undefined,
    fetcher: async () => {
      calls += 1;
      return Response.json({ error: "session_not_found" }, { status: 404 });
    },
  });

  assert.equal(result, "unavailable");
  assert.equal(calls, 1);
});

test("provider unavailability is bounded", async () => {
  let calls = 0;
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0, 1, 2],
    wait: async () => undefined,
    fetcher: async () => {
      calls += 1;
      return Response.json(
        { error: "interview_presence_unavailable" },
        { status: 503 }
      );
    },
  });

  assert.equal(result, "unavailable");
  assert.equal(calls, 3);
});
