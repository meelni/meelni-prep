import assert from "node:assert/strict";
import test from "node:test";

import { classifySkippedFeedbackLifecycle } from "./feedback-outcome";

test("classifies only coherent skipped feedback tuples", () => {
  assert.deepEqual(
    classifySkippedFeedbackLifecycle({
      status: "skipped",
      outcomeReason: "no_reviewable_answer",
      completionTier: "insufficient",
    }),
    {
      outcomeReason: "no_reviewable_answer",
      completionTier: "insufficient",
    }
  );
  assert.deepEqual(
    classifySkippedFeedbackLifecycle({
      status: "skipped",
      outcomeReason: "transcript_integrity_degraded",
      completionTier: null,
    }),
    {
      outcomeReason: "transcript_integrity_degraded",
      completionTier: null,
    }
  );

  for (const value of [
    {
      status: "completed",
      outcomeReason: "no_reviewable_answer",
      completionTier: "insufficient",
    },
    {
      status: "skipped",
      outcomeReason: "feedback_generated",
      completionTier: "full",
    },
    {
      status: "skipped",
      outcomeReason: "no_reviewable_answer",
      completionTier: null,
    },
    {
      status: "skipped",
      outcomeReason: "transcript_integrity_degraded",
      completionTier: "full",
    },
  ]) {
    assert.equal(classifySkippedFeedbackLifecycle(value), null);
  }
});
