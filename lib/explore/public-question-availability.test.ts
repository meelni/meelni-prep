import assert from "node:assert/strict";
import test from "node:test";

import {
  getExploreResultsAnnouncement,
  resolvePublicQuestionAvailability,
} from "./public-question-availability";

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

test("accessibility announcements never describe an outage as verified empty", () => {
  const unavailable = resolvePublicQuestionAvailability("error", 0);
  const empty = resolvePublicQuestionAvailability("success", 0);
  const populated = resolvePublicQuestionAvailability("success", 41);

  assert.equal(
    getExploreResultsAnnouncement({
      authLoading: false,
      availability: unavailable,
      visibleQuestions: 0,
    }),
    "Questions are temporarily unavailable."
  );
  assert.equal(
    getExploreResultsAnnouncement({
      authLoading: false,
      availability: empty,
      visibleQuestions: 0,
    }),
    "Showing 0 of 0 questions"
  );
  assert.equal(
    getExploreResultsAnnouncement({
      authLoading: false,
      availability: populated,
      visibleQuestions: 20,
    }),
    "Showing 20 of 41 questions"
  );
  assert.equal(
    getExploreResultsAnnouncement({
      authLoading: true,
      availability: populated,
      visibleQuestions: 20,
    }),
    "Checking sign-in status. Question actions will be available shortly."
  );
});
