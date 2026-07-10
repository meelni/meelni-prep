import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeAnalyticsEventProperties,
  toSafeAnalyticsErrorCode,
} from "./event-policy";

test("per-event policy drops identifiers and arbitrary launch context", () => {
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("new_interview_start_attempted", {
      interview_type: "product_sense",
      skill_level: "advanced",
      question_id: "private-question",
      focus: "Jane@example.com",
      return_to: "/feedback/private-session?token=secret",
      error: "Jane@example.com failed",
    }),
    {
      interview_type: "product_sense",
      skill_level: "advanced",
    }
  );
});

test("paths become path-or-origin values and arbitrary errors become safe codes", () => {
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("cta_clicked", {
      location: "landing hero",
      destination: "/setup?question_id=private",
      referrer: "https://private.example/path",
    }),
    { location: "landing_hero", destination: "/setup" }
  );
  assert.equal(
    toSafeAnalyticsErrorCode("rate_limit_exceeded"),
    "rate_limit_exceeded"
  );
  assert.equal(
    toSafeAnalyticsErrorCode("User jane@example.com failed"),
    "unexpected_error"
  );
});

test("legacy launcher aliases preserve the canonical minimized payload", () => {
  const properties = {
    interview_type: "product_sense",
    skill_level: "advanced",
    error_code: "question_unavailable",
    entry_source: "dashboard",
    question_id: "private-question",
  };
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("new_rep_start_failed", properties),
    sanitizeAnalyticsEventProperties("new_interview_start_failed", properties)
  );
});

test("deadline analytics keep interview taxonomy but drop session identity", () => {
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("interview_deadline_reached", {
      interview_type: "product_sense",
      session_id: "private-session-id",
    }),
    { interview_type: "product_sense" }
  );
});
