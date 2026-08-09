import assert from "node:assert/strict";
import test from "node:test";

import {
  createInterviewStartSingleFlight,
  readRetryAfterMs,
  recoverInterviewStart,
} from "./start-recovery";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("a browser deadline automatically replays the same request until ready", async () => {
  const controller = new AbortController();
  const bodies: string[] = [];
  let requestCount = 0;
  let recoveryStarts = 0;
  const result = await recoverInterviewStart({
    signal: controller.signal,
    request: async () => {
      requestCount += 1;
      bodies.push("same-attempt");
      if (requestCount === 1) throw abortError();
      return jsonResponse(200, { sessionId: SESSION_ID, token: "redacted" });
    },
    sleep: async () => undefined,
    onRecoveryStarted: () => {
      recoveryStarts += 1;
    },
  });

  assert.equal(result.disposition, "ready");
  assert.equal(result.requestCount, 2);
  assert.equal(result.recovered, true);
  assert.equal(recoveryStarts, 1);
  assert.deepEqual(bodies, ["same-attempt", "same-attempt"]);
});

test("retryable responses honor server guidance before eventual readiness", async () => {
  const controller = new AbortController();
  const delays: number[] = [];
  const responses = [
    jsonResponse(
      503,
      {
        error: "interview_start_in_progress",
        retryable: true,
        retryAfterMs: 1_250,
      },
      { "Retry-After": "1" }
    ),
    jsonResponse(200, { sessionId: SESSION_ID }),
  ];

  const result = await recoverInterviewStart({
    signal: controller.signal,
    request: async () => responses.shift()!,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(result.disposition, "ready");
  assert.deepEqual(delays, [1_250]);
});

test("definitive failures stop retrying", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await recoverInterviewStart({
    signal: controller.signal,
    request: async () => {
      calls += 1;
      return jsonResponse(403, {
        error: "interview_type_locked",
        retryable: false,
      });
    },
    sleep: async () => assert.fail("terminal failures must not sleep"),
  });

  assert.equal(result.disposition, "terminal");
  assert.equal(calls, 1);
});

test("an abort during recovery prevents another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await recoverInterviewStart({
    signal: controller.signal,
    request: async () => {
      calls += 1;
      throw abortError();
    },
    sleep: async () => {
      controller.abort();
      throw abortError();
    },
  });

  assert.equal(result.disposition, "aborted");
  assert.equal(calls, 1);
});

test("duplicate starts share one in-flight operation and cancellation aborts it", async () => {
  const singleFlight = createInterviewStartSingleFlight();
  let calls = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = async (signal: AbortSignal) => {
    calls += 1;
    await released;
    return signal.aborted ? "aborted" : "ready";
  };

  const first = singleFlight.run(work);
  const duplicate = singleFlight.run(work);
  singleFlight.cancel("candidate_cancelled");
  release();

  assert.equal(await first, "aborted");
  assert.equal(await duplicate, "aborted");
  assert.equal(calls, 1);
});

test("recovery ends at its bounded terminal deadline", async () => {
  const controller = new AbortController();
  let now = 0;
  const result = await recoverInterviewStart({
    signal: controller.signal,
    recoveryDeadlineMs: 2_000,
    defaultRetryMs: 1_000,
    now: () => now,
    request: async () => jsonResponse(503, { retryable: true }),
    sleep: async (delayMs) => {
      now += delayMs;
    },
  });

  assert.equal(result.disposition, "timed_out");
  assert.equal(result.requestCount, 2);
});

test("the terminal deadline aborts an in-flight recovery request", async () => {
  const controller = new AbortController();
  const result = await recoverInterviewStart({
    signal: controller.signal,
    recoveryDeadlineMs: 5,
    request: (signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error(String(signal.reason))),
          { once: true }
        );
      }),
  });

  assert.equal(result.disposition, "timed_out");
  assert.equal(result.requestCount, 1);
});

test("Retry-After supports HTTP dates and never undercuts body guidance", () => {
  const now = Date.parse("2026-08-09T18:00:00.000Z");
  assert.equal(
    readRetryAfterMs(
      {
        headers: new Headers({
          "Retry-After": "Sun, 09 Aug 2026 18:00:03 GMT",
        }),
      },
      { retryAfterMs: 2_000 },
      now
    ),
    3_000
  );
});

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}
