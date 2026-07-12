import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DISPATCH_LEASE_MS,
  isFeedbackDispatchReadyForVisibility,
  isFeedbackDispatchRetryable,
} from "./feedback-dispatch";

const NOW = new Date("2026-07-09T22:00:00.000Z");

test("pending and failed dispatches are retryable", () => {
  assert.equal(
    isFeedbackDispatchRetryable({ status: "pending", claimedAt: null }, NOW),
    true
  );
  assert.equal(
    isFeedbackDispatchRetryable({ status: "failed", claimedAt: NOW }, NOW),
    true
  );
});

test("an active sending lease is not retryable", () => {
  assert.equal(
    isFeedbackDispatchRetryable(
      {
        status: "sending",
        claimedAt: new Date(NOW.getTime() - FEEDBACK_DISPATCH_LEASE_MS + 1),
      },
      NOW
    ),
    false
  );
});

test("an expired sending lease is retryable", () => {
  assert.equal(
    isFeedbackDispatchRetryable(
      {
        status: "sending",
        claimedAt: new Date(NOW.getTime() - FEEDBACK_DISPATCH_LEASE_MS),
      },
      NOW
    ),
    true
  );
});

test("sent and not-required dispatches are terminal", () => {
  assert.equal(
    isFeedbackDispatchRetryable({ status: "sent", claimedAt: NOW }, NOW),
    false
  );
  assert.equal(
    isFeedbackDispatchRetryable(
      { status: "not_required", claimedAt: null },
      NOW
    ),
    false
  );
});

test("only acknowledged or unnecessary dispatch is ready for visibility", () => {
  for (const status of ["pending", "sending", "failed"] as const) {
    assert.equal(isFeedbackDispatchReadyForVisibility({ status }), false);
  }
  for (const status of ["sent", "not_required"] as const) {
    assert.equal(isFeedbackDispatchReadyForVisibility({ status }), true);
  }
});
