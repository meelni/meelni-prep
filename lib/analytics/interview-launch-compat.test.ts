import assert from "node:assert/strict";
import test from "node:test";

import {
  getInterviewLaunchEventPair,
  LEGACY_INTERVIEW_LAUNCH_EVENTS,
} from "./interview-launch-compat";

test("every canonical launcher event has one time-bounded legacy alias", () => {
  assert.deepEqual(LEGACY_INTERVIEW_LAUNCH_EVENTS, {
    new_interview_launcher_viewed: "new_rep_launcher_viewed",
    new_interview_recommendation_accepted: "new_rep_recommendation_accepted",
    new_interview_recommendation_changed: "new_rep_recommendation_changed",
    new_interview_start_attempted: "new_rep_start_attempted",
    new_interview_start_succeeded: "new_rep_start_succeeded",
    new_interview_start_failed: "new_rep_start_failed",
  });

  assert.deepEqual(getInterviewLaunchEventPair("new_interview_start_failed"), [
    "new_interview_start_failed",
    "new_rep_start_failed",
  ]);
});
