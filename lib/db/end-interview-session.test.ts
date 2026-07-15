import assert from "node:assert/strict";
import test from "node:test";

import { resolveInterviewTerminalReason } from "./end-interview-session";

test("valid durable signal preserves the command's terminal reason", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "user_end"),
    "user_end"
  );
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "time_limit"),
    "time_limit"
  );
});

test("insufficient durable signal wins before a deadline claim is committed", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "time_limit"),
    "insufficient_signal"
  );
});

test("invalid-session recovery preserves provider failure without transcript signal", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "provider_failure"),
    "provider_failure"
  );
});
