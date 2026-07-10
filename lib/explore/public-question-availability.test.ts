import assert from "node:assert/strict";
import test from "node:test";

import { resolvePublicQuestionAvailability } from "./public-question-availability";

test("failed and loading question requests expose no exact public count", () => {
  assert.deepEqual(resolvePublicQuestionAvailability("loading", 0), {
    hasVerifiedCount: false,
    totalQuestions: null,
  });
  assert.deepEqual(resolvePublicQuestionAvailability("error", 0), {
    hasVerifiedCount: false,
    totalQuestions: null,
  });
});

test("a successful empty response remains distinguishable from an outage", () => {
  assert.deepEqual(resolvePublicQuestionAvailability("success", 0), {
    hasVerifiedCount: true,
    totalQuestions: 0,
  });
  assert.deepEqual(resolvePublicQuestionAvailability("success", 41), {
    hasVerifiedCount: true,
    totalQuestions: 41,
  });
});

test("invalid successful totals fail closed", () => {
  assert.deepEqual(resolvePublicQuestionAvailability("success", -1), {
    hasVerifiedCount: false,
    totalQuestions: null,
  });
  assert.deepEqual(resolvePublicQuestionAvailability("success", 1.5), {
    hasVerifiedCount: false,
    totalQuestions: null,
  });
});
