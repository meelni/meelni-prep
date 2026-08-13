import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  buildFocusedPracticeGroundedPlan,
  buildFocusedPracticePlan,
  createFocusedPracticeAttempt,
  createFocusedPracticeGroundedAttempt,
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

test("repository hydration rebuilds a strict scoreless attempt without weakening v1", () => {
  const grounded = groundedRow();
  const hydrated = hydrateFocusedPracticeAttemptRow(grounded);
  assert.ok(hydrated);
  assert.equal(hydrated.contractVersion, "focused-practice-attempt.v2");
  assert.equal(hydrated.state, "in_progress");
  assert.ok(Object.isFrozen(hydrated));
  assert.equal(
    hydrateFocusedPracticeAttemptRow({
      ...grounded,
      planContractVersion: "focused-practice-plan.v1",
    }),
    null
  );
  assert.equal(
    hydrateFocusedPracticeAttemptRow({
      ...grounded,
      feedbackVersion: {
        schemaVersion: "feedback.dimension-coverage.v1",
        promptVersion: "feedback.prompt.dimension-coverage.v1",
        rubricVersion: "pm-feedback-rubric.v3",
        modelVersion: "synthetic-model-v1",
        evaluationState: "partial",
        reviewOutcome: "coaching_review",
        scoreWithheldReason: "rubric_coverage",
        sourceFingerprint: "c".repeat(64),
      },
    }),
    null
  );
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

function groundedRow(): typeof focusedPracticeAttempt.$inferSelect {
  const plan = buildFocusedPracticeGroundedPlan({
    sourceQuestion: {
      questionId: "synthetic-question",
      questionText: "How would you improve a shared planning product?",
    },
    roundType: "product_sense",
    focusIdentity: {
      kind: "evidence_limited_improvement",
      dimension: "clarity",
      signalCode: "recommendation_directness",
      actionCode: "lead_with_recommendation",
    },
  });
  assert.equal(plan.state, "available");
  if (plan.state !== "available") throw new Error("grounded plan unavailable");
  const created = createFocusedPracticeGroundedAttempt({
    attemptId: "019c0000-0000-7000-8000-000000000011",
    userId: "019c0000-0000-7000-8000-000000000012",
    sourceSessionId: "019c0000-0000-7000-8000-000000000013",
    sourceFeedbackId: "019c0000-0000-7000-8000-000000000014",
    feedbackVersion: {
      schemaVersion: "feedback.evidence-limited.v2",
      promptVersion: "feedback.prompt.evidence-limited.v2",
      rubricVersion: "pm-feedback-rubric.v2",
      modelVersion: "synthetic-model-v1",
      evaluationState: "partial",
      reviewOutcome: "coaching_review",
      scoreWithheldReason: "rubric_coverage",
      sourceFingerprint: "c".repeat(64),
    },
    plan: plan.plan,
    sourceFinding: {
      kind: "evidence_limited_improvement",
      dimension: "clarity",
      observation:
        EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.recommendation_directness
          .observation,
      nextStep: EVIDENCE_LIMITED_ACTIONS.lead_with_recommendation.nextStep,
      signalCode: "recommendation_directness",
      actionCode: "lead_with_recommendation",
      evidence: {
        kind: "exact_candidate_citation",
        transcriptRefs: ["synthetic-event:1"],
        quote: "I would lead with the product recommendation.",
      },
    },
    startedAt: new Date("2026-08-13T12:00:00.000Z"),
  });
  assert.equal(created.state, "created");
  if (created.state !== "created") throw new Error("grounded attempt invalid");
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
