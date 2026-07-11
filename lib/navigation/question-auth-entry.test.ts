import assert from "node:assert/strict";
import test from "node:test";

import { resolveQuestionEntryAction } from "./question-auth-entry";

test("question entry waits for auth before choosing a destination", () => {
  assert.equal(
    resolveQuestionEntryAction({ authLoading: true, isAuthenticated: false }),
    "wait"
  );
  assert.equal(
    resolveQuestionEntryAction({ authLoading: true, isAuthenticated: true }),
    "wait"
  );
});

test("question entry bypasses auth only for authenticated candidates", () => {
  assert.equal(
    resolveQuestionEntryAction({ authLoading: false, isAuthenticated: true }),
    "launch"
  );
  assert.equal(
    resolveQuestionEntryAction({ authLoading: false, isAuthenticated: false }),
    "authenticate"
  );
});
