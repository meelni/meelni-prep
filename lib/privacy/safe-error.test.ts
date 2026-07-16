import assert from "node:assert/strict";
import test from "node:test";

import { getSafeErrorClass, toSafeErrorLog } from "./safe-error";

test("safe error logs never serialize content-bearing exception text", () => {
  const sentinel = "PRIVATE_TRANSCRIPT_SENTINEL_do_not_log";
  const error = new Error(sentinel);

  assert.equal(getSafeErrorClass(error), "Error");
  assert.deepEqual(toSafeErrorLog(error), { error_class: "Error" });
  assert.equal(JSON.stringify(toSafeErrorLog(error)).includes(sentinel), false);
});

test("safe error classes use a fixed non-error label", () => {
  assert.deepEqual(toSafeErrorLog("raw provider response"), {
    error_class: "NonError",
  });
});
