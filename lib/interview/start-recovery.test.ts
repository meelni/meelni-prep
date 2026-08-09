import assert from "node:assert/strict";
import test from "node:test";

import {
  InterviewStartRecoveryDeadlineError,
  readInterviewStartRetryAfterMs,
  startInterviewWithRecovery,
  type InterviewStartHttpResult,
} from "./start-recovery";

test("automatically replays the same request after the browser deadline", async () => {
  const controller = new AbortController();
  let requests = 0;
  let recoveryStarts = 0;

  const result = await startInterviewWithRecovery({
    signal: controller.signal,
    request: async () => {
      requests += 1;
      if (requests === 1) throw abortError();
      return response(200, { sessionId: "same-attempt" });
    },
    wait: async () => undefined,
    onRecoveryStarted: () => {
      recoveryStarts += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.recovered, true);
  assert.equal(result.requestCount, 2);
  assert.deepEqual(result.body, { sessionId: "same-attempt" });
  assert.equal(recoveryStarts, 1);
});

test("respects the longest server retry guidance before eventual readiness", async () => {
  const waits: number[] = [];
  let requests = 0;

  const result = await startInterviewWithRecovery({
    signal: new AbortController().signal,
    request: async () => {
      requests += 1;
      return requests === 1
        ? response(503, { retryable: true, retryAfterMs: 250 }, "1")
        : response(200, { sessionId: "ready" });
    },
    wait: async (durationMs) => {
      waits.push(durationMs);
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(waits, [1_000]);
  assert.equal(requests, 2);
});

test("stops recovery on a definitive failure", async () => {
  let requests = 0;
  const result = await startInterviewWithRecovery({
    signal: new AbortController().signal,
    request: async () => {
      requests += 1;
      return response(403, {
        error: "interview_practice_unavailable",
        retryable: false,
      });
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.recovered, false);
  assert.equal(requests, 1);
});

test("an unmount abort stops the retry loop before another request", async () => {
  const controller = new AbortController();
  let requests = 0;

  await assert.rejects(
    startInterviewWithRecovery({
      signal: controller.signal,
      request: async () => {
        requests += 1;
        return response(503, { retryable: true, retryAfterMs: 1_000 });
      },
      wait: async (_durationMs, signal) => {
        controller.abort(abortError());
        if (signal.aborted) throw signal.reason;
      },
    }),
    { name: "AbortError" }
  );

  assert.equal(requests, 1);
});

test("recovery terminates at its own upper bound", async () => {
  let nowMs = 0;

  await assert.rejects(
    startInterviewWithRecovery({
      signal: new AbortController().signal,
      recoveryUpperBoundMs: 2_000,
      defaultRetryMs: 1_000,
      now: () => nowMs,
      request: async () => response(503, { retryable: true }),
      wait: async (durationMs) => {
        nowMs += durationMs;
      },
    }),
    InterviewStartRecoveryDeadlineError
  );
});

test("retry guidance accepts HTTP dates and rejects invalid values", () => {
  const nowMs = Date.parse("2026-08-09T12:00:00.000Z");
  assert.equal(
    readInterviewStartRetryAfterMs(
      response(503, {}, "Sun, 09 Aug 2026 12:00:03 GMT"),
      nowMs
    ),
    3_000
  );
  assert.equal(
    readInterviewStartRetryAfterMs(response(503, {}, "later")),
    null
  );
});

function response(
  status: number,
  body: unknown,
  retryAfter: string | null = null
): InterviewStartHttpResult {
  return { ok: status >= 200 && status < 300, status, body, retryAfter };
}

function abortError(): Error {
  const error = new Error("deadline");
  error.name = "AbortError";
  return error;
}
