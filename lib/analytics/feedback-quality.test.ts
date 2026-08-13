import assert from "node:assert/strict";
import test from "node:test";

import { readFocusedPracticeReviewOutcome } from "./feedback-quality";

test("practice analytics accepts only the closed v2 review outcome", () => {
  assert.equal(
    readFocusedPracticeReviewOutcome({
      contractVersion: "focused-practice-attempt.v2",
      feedbackVersion: { reviewOutcome: "partial_scorecard" },
    } as never),
    "partial_scorecard"
  );
  assert.equal(
    readFocusedPracticeReviewOutcome({
      contractVersion: "focused-practice-attempt.v2",
      feedbackVersion: { reviewOutcome: "coaching_review" },
    } as never),
    "coaching_review"
  );
  assert.equal(
    readFocusedPracticeReviewOutcome({
      contractVersion: "focused-practice-attempt.v1",
      feedbackVersion: { reviewOutcome: "partial_scorecard" },
    } as never),
    null
  );
});
