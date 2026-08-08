import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_CLIENT_FETCH_DEADLINE_MS,
  CUSTOMER_READ_ROUTE_DEADLINE_MS,
  CUSTOMER_WRITE_ROUTE_DEADLINE_MS,
  DeadlineExceededError,
  fetchWithDeadline,
  fetchWithDeadlineUsing,
  INTERACTIVE_READ_STATEMENT_TIMEOUT_MS,
  SUPABASE_SERVER_FETCH_DEADLINE_MS,
  withDeadline,
} from "./deadline";

test("server and database deadlines expire before the customer transport", () => {
  assert.ok(
    SUPABASE_SERVER_FETCH_DEADLINE_MS < CUSTOMER_READ_ROUTE_DEADLINE_MS
  );
  assert.ok(
    SUPABASE_SERVER_FETCH_DEADLINE_MS < CUSTOMER_WRITE_ROUTE_DEADLINE_MS
  );
  assert.ok(
    INTERACTIVE_READ_STATEMENT_TIMEOUT_MS < CUSTOMER_READ_ROUTE_DEADLINE_MS
  );
  assert.ok(
    CUSTOMER_READ_ROUTE_DEADLINE_MS < CUSTOMER_CLIENT_FETCH_DEADLINE_MS
  );
  assert.ok(
    CUSTOMER_WRITE_ROUTE_DEADLINE_MS < CUSTOMER_CLIENT_FETCH_DEADLINE_MS
  );
});

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

test("fetchWithDeadlineUsing bounds an injected transport", async () => {
  let observedSignal: AbortSignal | undefined;
  const request = ((_input: RequestInfo | URL, init?: RequestInit) => {
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

  await assert.rejects(
    fetchWithDeadlineUsing(request, "https://example.test", {}, 5),
    { name: "AbortError" }
  );
  assert.equal(observedSignal?.aborted, true);
});
