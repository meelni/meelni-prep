import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFocusedPracticePlan,
  createFocusedPracticeAttempt,
  DRILL_TEMPLATE_VERSION,
  parsePersistedFeedbackV2,
  resolveDrillRecommendation,
} from "@meelni/core";
import { createFocusedPracticeAttemptSourceFixtures } from "@meelni/test-fixtures";

import { hydrateFocusedPracticeAttemptRow } from "./focused-practice-attempts";
import { focusedPracticeAttempt } from "./schema";

function row(): typeof focusedPracticeAttempt.$inferSelect {
  const source = createFocusedPracticeAttemptSourceFixtures()[0]!;
  const parsedFeedback = parsePersistedFeedbackV2(source.persistedFeedback, {
    evidenceTurns: source.evidenceTurns,
  });
  const resolution = resolveDrillRecommendation({
    roundType: source.roundType,
    sourceState: "completed",
    templateVersion: DRILL_TEMPLATE_VERSION,
    feedback: parsedFeedback,
  });
  assert.equal(resolution.recommendation.state, "recommended");
  assert.ok(resolution.sourceFinding);
  if (
    resolution.recommendation.state !== "recommended" ||
    !resolution.sourceFinding
  ) {
    throw new Error("fixture recommendation is unavailable");
  }
  const plan = buildFocusedPracticePlan({
    recommendation: resolution.recommendation,
    sourceQuestion: source.question,
  });
  assert.equal(plan.state, "available");
  if (plan.state !== "available") throw new Error("fixture plan unavailable");
  const created = createFocusedPracticeAttempt({
    attemptId: "019c0000-0000-7000-8000-000000000001",
    userId: source.userId,
    sourceSessionId: source.sessionId,
    sourceFeedbackId: source.feedbackId,
    feedbackVersion: {
      schemaVersion: parsedFeedback.schemaVersion,
      promptVersion: parsedFeedback.promptVersion,
      rubricVersion: parsedFeedback.rubricVersion,
      modelVersion: parsedFeedback.modelVersion,
      evaluationState: parsedFeedback.evaluationState,
    },
    plan,
    sourceFinding: resolution.sourceFinding,
    startedAt: new Date("2026-07-19T12:00:00.000Z"),
  });
  assert.equal(created.state, "created");
  if (created.state !== "created") throw new Error("fixture attempt invalid");
  return {
    id: created.attempt.attemptId,
    userId: created.attempt.userId,
    sourceSessionId: created.attempt.sourceSessionId,
    sourceFeedbackId: created.attempt.sourceFeedbackId,
    contractVersion: created.attempt.contractVersion,
    lifecycleVersion: created.attempt.lifecycleVersion,
    state: created.attempt.state,
    feedbackVersion: created.attempt.feedbackVersion,
    planContractVersion: created.attempt.plan.contractVersion,
    planTemplateVersion: created.attempt.plan.templateVersion,
    planTemplateId: created.attempt.plan.templateId,
    plan: created.attempt.plan,
    sourceFinding: created.attempt.sourceFinding,
    startedAt: new Date(created.attempt.startedAt),
    completedAt: null,
    completion: null,
    createdAt: new Date(created.attempt.startedAt),
    updatedAt: new Date(created.attempt.startedAt),
  };
}

test("repository hydration rebuilds a strict frozen attempt", () => {
  const hydrated = hydrateFocusedPracticeAttemptRow(row());
  assert.ok(hydrated);
  assert.equal(hydrated.state, "in_progress");
  assert.ok(Object.isFrozen(hydrated));
  assert.ok(Object.isFrozen(hydrated.plan));
});

test("repository hydration fails closed for denormalized version drift and invalid lifecycle", () => {
  const valid = row();
  assert.equal(
    hydrateFocusedPracticeAttemptRow({
      ...valid,
      planTemplateVersion: "future-template",
    }),
    null
  );
  assert.equal(
    hydrateFocusedPracticeAttemptRow({
      ...valid,
      lifecycleVersion: 1,
    }),
    null
  );
});
