import assert from "node:assert/strict";
import test from "node:test";

import {
  createFocusedPracticeSourceFingerprint,
  projectLegacyFocusedPracticeSourceFingerprintInput,
} from "./source-fingerprint";

const PRE_SAV_440_FINGERPRINT =
  "00ee15069ed61078becdc4974975992fe840bbbde468fa117def16bdddc631bb";

test("legacy focused-practice projection preserves the exact pre-SAV-440 hash", () => {
  const source = {
    userId: "historical-owner",
    sessionId: "historical-v1-session",
    feedbackId: "historical-v1-feedback",
    roundType: "product_sense",
    feedbackStatus: "completed",
    question: {
      questionId: "historical-question",
      questionText: "How would you improve a shared planning product?",
    },
    feedback: {
      id: "historical-v1-feedback",
      sessionId: "historical-v1-session",
      structureScore: 8,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
      overallScore: null,
      summary: "One supported dimension was scored.",
      rubricVersion: "pm-feedback-rubric.v3",
      schemaVersion: "feedback.dimension-coverage.v1",
      promptVersion: "feedback.prompt.dimension-coverage.v1",
      modelVersion: "historical-model",
      evaluationState: "partial",
      feedbackMode: "partial_scorecard",
      feedbackRoundType: "product_sense",
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
      status: "completed",
      outcomeReason: "feedback_generated",
      processingStartedAt: new Date("2026-08-13T11:59:00.000Z"),
      completionTier: "partial",
      dispatchStatus: "sent",
      dispatchEventId: "historical-dispatch",
      dispatchClaimedAt: new Date("2026-08-13T11:58:00.000Z"),
      dispatchedAt: new Date("2026-08-13T11:58:30.000Z"),
      strengths: null,
      improvements: null,
      drills: [],
      completionStats: {
        totalTurns: 3,
        userTurns: 1,
        totalWords: 16,
        durationSeconds: 20,
        substantiveResponses: 1,
        scoreableResponses: 1,
      },
      completionRecommendations: [],
      dimensionCoverage: {
        structure: { score: 8, evidence: [] },
      },
      verifiedPrefixScope: null,
    },
    evidenceTurns: [],
    frozenEvidence: {
      snapshotValid: true,
      snapshotState: "partial",
      turns: [
        {
          eventId: "writer:1",
          writerId: "writer",
          writerGeneration: 1,
          sequence: 1,
          text: "How would you prioritize the customer problem?",
        },
      ],
      interruptions: [],
      sessionEndAt: new Date("2026-08-13T12:00:00.000Z"),
      sourceOverflow: false,
      authority: {
        contractVersion: "frozen-answer-block-authority.v1",
        snapshotState: "partial",
        cutoffAtMs: Date.parse("2026-08-13T12:00:00.000Z"),
        writers: [
          {
            contractVersion: 1,
            writerId: "writer",
            writerGeneration: 1,
            committedSequence: 1,
            integrityState: "healthy",
            settlementState: "missing",
          },
        ],
      },
    },
  };
  const projected = projectLegacyFocusedPracticeSourceFingerprintInput(source);

  assert.equal(
    createFocusedPracticeSourceFingerprint(projected),
    PRE_SAV_440_FINGERPRINT
  );
  assert.notEqual(
    createFocusedPracticeSourceFingerprint(source),
    PRE_SAV_440_FINGERPRINT
  );
  assert.equal("verifiedPrefixScope" in projected.feedback, false);
  assert.equal("authority" in projected.frozenEvidence!, false);
});
