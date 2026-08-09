import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAnalyticsEventPolicy,
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

test("current deadline and INP observability survive the privacy allowlist", () => {
  assert.equal(hasAnalyticsEventPolicy("interview_deadline_reached"), true);
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("interview_deadline_reached", {
      session_id: "private-session",
      interview_type: "product_sense",
    }),
    { interview_type: "product_sense" }
  );
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("page_performance", {
      page: "/feedback/private-session?token=secret",
      inp: 147,
    }),
    { page: "/feedback/:sessionId", inp: 147 }
  );
});

test("interview start SLO events retain only closed content-free fields", () => {
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("interview_start_stage", {
      version: 1,
      stage: "canonical_readiness",
      outcome: "delayed",
      duration_ms: 25_001,
      slo_target_ms: 10_000,
      slo_upper_bound_ms: 25_000,
      latency_class: "above_upper_bound",
      session_id: "private-session",
      room_name: "private-room",
      transcript: "private transcript content",
    }),
    {
      version: 1,
      stage: "canonical_readiness",
      outcome: "delayed",
      duration_ms: 25_001,
      slo_target_ms: 10_000,
      slo_upper_bound_ms: 25_000,
      latency_class: "above_upper_bound",
    }
  );
});

test("interview readiness contradictions retain no room or customer correlation", () => {
  assert.deepEqual(
    sanitizeAnalyticsEventProperties("interview_liveness_contradiction", {
      version: 1,
      phase: "resolved",
      duration_ms: 31_000,
      duration_class: "under_2m",
      resolution: "canonical_ready",
      session_id: "private-session",
      room_name: "private-room",
      transcript: "private transcript content",
    }),
    {
      version: 1,
      phase: "resolved",
      duration_ms: 31_000,
      duration_class: "under_2m",
      resolution: "canonical_ready",
    }
  );
});
