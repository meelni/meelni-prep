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

  assert.equal(result.status, "ready");
  assert.deepEqual(delays, [10, 20]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, "/api/interview/presence");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    sessionId: SESSION_ID,
  });
});

test("authorization loss is terminal and stops retries", async () => {
  let calls = 0;
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    now: () => 0,
    retryDelaysMs: [0, 1, 2],
    wait: async () => undefined,
    fetcher: async () => {
      calls += 1;
      return Response.json({ error: "session_not_found" }, { status: 404 });
    },
  });

  assert.deepEqual(result, {
    status: "terminal",
    reason: "authorization_lost",
    attempts: 1,
    durationMs: 0,
  });
  assert.equal(calls, 1);
});

test("terminal lifecycle truth stops readiness without token churn", async () => {
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    now: () => 0,
    retryDelaysMs: [0, 1],
    wait: async () => undefined,
    fetcher: async () =>
      Response.json({ error: "session_not_joinable" }, { status: 409 }),
  });

  assert.deepEqual(result, {
    status: "terminal",
    reason: "authorization_lost",
    attempts: 1,
    durationMs: 0,
  });
});

test("transient reconciliation conflicts remain delayed", async () => {
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0],
    fetcher: async () =>
      Response.json({ error: "interview_presence_conflict" }, { status: 409 }),
  });

  assert.equal(result.status, "delayed");
});

test("provider unavailability becomes delayed without claiming disconnection", async () => {
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

  assert.equal(result.status, "delayed");
  assert.equal(
    result.status === "delayed" && result.reason,
    "reconciliation_unavailable"
  );
  assert.equal(calls, 3);
});

test("one stalled presence request is aborted at its local deadline", async () => {
  let observedSignal: AbortSignal | null = null;
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0],
    requestDeadlineMs: 5,
    readinessDeadlineMs: 50,
    fetcher: async (_url, init) => {
      observedSignal = init?.signal ?? null;
      return await new Promise<Response>(() => undefined);
    },
  });

  assert.equal(result.status, "delayed");
  assert.equal(result.attempts, 1);
  assert.equal((observedSignal as AbortSignal | null)?.aborted, true);
});

test("the overall readiness deadline bounds repeated slow probes", async () => {
  let clock = 0;
  let calls = 0;
  const result = await confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    retryDelaysMs: [0, 6, 6],
    readinessDeadlineMs: 10,
    now: () => clock,
    wait: async (delayMs) => {
      clock += delayMs;
    },
    fetcher: async () => {
      calls += 1;
      return Response.json({ ready: false }, { status: 202 });
    },
  });

  assert.deepEqual(result, {
    status: "delayed",
    reason: "readiness_deadline_exceeded",
    attempts: 2,
    durationMs: 10,
  });
  assert.equal(calls, 2);
});

test("component abort stops confirmation without a terminal claim", async () => {
  const controller = new AbortController();
  const resultPromise = confirmInterviewRuntimeReady({
    sessionId: SESSION_ID,
    signal: controller.signal,
    retryDelaysMs: [0],
    requestDeadlineMs: 100,
    fetcher: async () => await new Promise<Response>(() => undefined),
  });
  controller.abort();

  const result = await resultPromise;
  assert.equal(result.status, "aborted");
});
