import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  type FeedbackQualitySignalView,
} from "@meelni/core";

import { hydrateFeedbackQualitySignalRow } from "./feedback-quality-signals";

test("quality signal row hydration exposes only the owner-safe closed view", () => {
  const hydrated = hydrateFeedbackQualitySignalRow({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "00000000-0000-4000-8000-000000000003",
    feedbackId: "00000000-0000-4000-8000-000000000004",
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    reviewOutcome: "coaching_review",
    response: "not_helpful",
    reason: "score_withholding_unclear",
    revision: 2,
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    updatedAt: new Date("2026-08-13T12:01:00.000Z"),
  });
  assert.deepEqual(hydrated, {
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    outcome: "coaching_review",
    response: "not_helpful",
    reason: "score_withholding_unclear",
    revision: 2,
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:01:00.000Z",
  } satisfies FeedbackQualitySignalView);
  assert.equal("feedbackId" in hydrated!, false);
  assert.equal("sessionId" in hydrated!, false);
  assert.equal("userId" in hydrated!, false);
});

test("quality signal row hydration rejects incompatible reason combinations", () => {
  const hydrated = hydrateFeedbackQualitySignalRow({
    id: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "00000000-0000-4000-8000-000000000003",
    feedbackId: "00000000-0000-4000-8000-000000000004",
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    reviewOutcome: "coaching_review",
    response: "not_helpful",
    reason: "score_explanation_unclear",
    revision: 1,
    createdAt: new Date("2026-08-13T12:00:00.000Z"),
    updatedAt: new Date("2026-08-13T12:00:00.000Z"),
  });
  assert.equal(hydrated, null);
});
