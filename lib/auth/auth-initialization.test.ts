import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthInitializationWithin } from "./auth-initialization";

test("auth initialization returns a ready value before its deadline", async () => {
  await assert.doesNotReject(async () => {
    assert.deepEqual(
      await resolveAuthInitializationWithin(Promise.resolve("session"), 50),
      { status: "ready", value: "session" }
    );
  });
});

test("auth initialization releases the UI when session lookup does not settle", async () => {
  const never = new Promise<string>(() => {});
  assert.deepEqual(await resolveAuthInitializationWithin(never, 0), {
    status: "timed_out",
  });
});

test("auth initialization preserves provider lookup failures", async () => {
  await assert.rejects(
    resolveAuthInitializationWithin(
      Promise.reject(new Error("lookup failed")),
      50
    ),
    /lookup failed/
  );
});
