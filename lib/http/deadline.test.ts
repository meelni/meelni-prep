import assert from "node:assert/strict";
import test from "node:test";

import {
  DeadlineExceededError,
  fetchWithDeadline,
  withDeadline,
} from "./deadline";

test("withDeadline rejects work that does not settle inside its budget", async () => {
  await assert.rejects(
    withDeadline("fixture_read", new Promise<never>(() => undefined), 5),
    (error) =>
      error instanceof DeadlineExceededError &&
      error.operation === "fixture_read"
  );
});

test("fetchWithDeadline aborts the underlying request", async () => {
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | undefined;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchWithDeadline("https://example.test", {}, 5), {
      name: "AbortError",
    });
    assert.equal(observedSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
