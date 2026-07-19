import assert from "node:assert/strict";
import test from "node:test";

import { resolveQuestionEntryAction } from "./question-auth-entry";

test("question entry waits for auth before choosing a destination", () => {
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: true,
      isAuthenticated: false,
      reactivationEnabled: true,
    }),
    "wait"
  );
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: true,
      isAuthenticated: true,
      reactivationEnabled: true,
    }),
    "wait"
  );
});

test("question entry bypasses auth only for authenticated candidates", () => {
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: false,
      isAuthenticated: true,
      reactivationEnabled: true,
    }),
    "launch"
  );
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: false,
      isAuthenticated: false,
      reactivationEnabled: true,
    }),
    "authenticate"
  );
});

test("question entry stops before auth or launch while relaunch is paused", () => {
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: false,
      isAuthenticated: true,
      reactivationEnabled: false,
    }),
    "paused"
  );
  assert.equal(
    resolveQuestionEntryAction({
      authLoading: false,
      isAuthenticated: false,
      reactivationEnabled: false,
    }),
    "paused"
  );
});
