import assert from "node:assert/strict";
import test from "node:test";

import { reportFeedbackOutcome } from "./feedback-outcome";

test("feedback outcome telemetry emits only the closed content-free taxonomy", () => {
  const writes: string[] = [];
  for (const outcomeReason of [
    "feedback_generated",
    "no_reviewable_answer",
    "transcript_integrity_degraded",
    "dispatch_failed",
    "generation_failed",
  ] as const) {
    const event = reportFeedbackOutcome(
      {
        outcomeReason,
        sessionId: "00000000-0000-4000-8000-000000000397",
      },
      (serialized) => writes.push(serialized)
    );
    assert.equal(event?.outcomeReason, outcomeReason);
  }
  assert.equal(writes.length, 5);
  assert.doesNotMatch(
    writes.join("\n"),
    /transcript text|microphone|duration|provider timeout|customer/i
  );
  assert.equal(
    reportFeedbackOutcome(
      { outcomeReason: "raw_provider_error" as never },
      () => assert.fail("invalid telemetry must not be emitted")
    ),
    null
  );
});
