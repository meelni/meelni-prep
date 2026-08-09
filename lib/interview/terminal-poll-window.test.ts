import assert from "node:assert/strict";
import test from "node:test";

import { runBoundedSequentialTerminalPoll } from "./terminal-poll-window";

test("a terminal poll window pauses at its request cap without overlap", async () => {
  let attempts = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const result = await runBoundedSequentialTerminalPoll({
    signal: new AbortController().signal,
    intervalMs: 0,
    windowMs: 1_000,
    maxAttempts: 3,
    poll: async () => {
      attempts += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return false;
    },
  });

  assert.deepEqual(result, { status: "paused", attempts: 3 });
  assert.equal(attempts, 3);
  assert.equal(maxInFlight, 1);
});

test("unmount-style cancellation stops the current window and later attempts", async () => {
  const controller = new AbortController();
  let attempts = 0;
  let observedAbort = false;

  const resultPromise = runBoundedSequentialTerminalPoll({
    signal: controller.signal,
    intervalMs: 0,
    windowMs: 1_000,
    maxAttempts: 3,
    poll: async ({ signal }) => {
      attempts += 1;
      return new Promise<boolean>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            resolve(false);
          },
          { once: true }
        );
      });
    },
  });

  controller.abort("unmounted");
  const result = await resultPromise;

  assert.deepEqual(result, { status: "cancelled", attempts: 1 });
  assert.equal(observedAbort, true);
  assert.equal(attempts, 1);
});

test("a resolved attempt ends the window immediately", async () => {
  let attempts = 0;
  const result = await runBoundedSequentialTerminalPoll({
    signal: new AbortController().signal,
    intervalMs: 0,
    windowMs: 1_000,
    maxAttempts: 5,
    poll: async () => {
      attempts += 1;
      return attempts === 2;
    },
  });

  assert.deepEqual(result, { status: "resolved", attempts: 2 });
});
