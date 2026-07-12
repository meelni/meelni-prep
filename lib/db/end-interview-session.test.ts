import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveInterviewTerminalReason,
  shouldRefineProvisionalHardDeadlineReason,
} from "./end-interview-session";

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

test("only an invalid provisional hard-deadline claim may refine", () => {
  assert.equal(
    shouldRefineProvisionalHardDeadlineReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: false,
    }),
    true
  );

  for (const terminalReason of [
    "user_end",
    "provider_failure",
    "disconnect_timeout",
    "insufficient_signal",
  ] as const) {
    assert.equal(
      shouldRefineProvisionalHardDeadlineReason({
        state: "ending",
        terminalReason,
        isValid: false,
      }),
      false
    );
  }

  assert.equal(
    shouldRefineProvisionalHardDeadlineReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: true,
    }),
    false
  );
  assert.equal(
    shouldRefineProvisionalHardDeadlineReason({
      state: "completed",
      terminalReason: "time_limit",
      isValid: false,
    }),
    false
  );
});
