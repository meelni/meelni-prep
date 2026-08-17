import assert from "node:assert/strict";
import test from "node:test";

import {
  readFocusedPracticeReviewOutcome,
  trackFeedbackHelpfulnessResponded,
  trackFocusedPracticeStarted,
  type FeedbackQualityAnalyticsDependencies,
} from "./feedback-quality";

test("practice analytics accepts only the closed v2 review outcome", () => {
  assert.equal(
    readFocusedPracticeReviewOutcome({
      contractVersion: "focused-practice-attempt.v2",
      feedbackVersion: { reviewOutcome: "partial_scorecard" },
    } as never),
    "coaching_review"
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

test("deletion intent suppresses both post-commit quality events", async () => {
  const previousServerKey = process.env.POSTHOG_SERVER_KEY;
  const previousPseudonymKey = process.env.ANALYTICS_PSEUDONYM_KEY;
  process.env.POSTHOG_SERVER_KEY = "synthetic-posthog-key";
  process.env.ANALYTICS_PSEUDONYM_KEY = "s".repeat(32);
  const delivered: string[] = [];
  const deps: FeedbackQualityAnalyticsDependencies = {
    readConsent: async () => ({
      decision: "accepted",
      policyVersion: 1,
      source: "settings",
      decidedAt: "2026-08-13T12:00:00.000Z",
      scope: "account",
    }),
    isDeletionPending: async () => true,
    track: async (event) => {
      delivered.push(event);
    },
  };
  try {
    await trackFeedbackHelpfulnessResponded(
      {
        userId: "synthetic-user",
        outcome: "coaching_review",
        response: "helpful",
        reason: null,
      },
      deps
    );
    await trackFocusedPracticeStarted(
      {
        userId: "synthetic-user",
        attempt: {
          contractVersion: "focused-practice-attempt.v2",
          feedbackVersion: { reviewOutcome: "coaching_review" },
        } as never,
      },
      deps
    );
    assert.deepEqual(delivered, []);
  } finally {
    if (previousServerKey === undefined) delete process.env.POSTHOG_SERVER_KEY;
    else process.env.POSTHOG_SERVER_KEY = previousServerKey;
    if (previousPseudonymKey === undefined) {
      delete process.env.ANALYTICS_PSEUDONYM_KEY;
    } else {
      process.env.ANALYTICS_PSEUDONYM_KEY = previousPseudonymKey;
    }
  }
});
