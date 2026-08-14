import { createHash } from "node:crypto";

import { FOCUSED_PRACTICE_SOURCE_FINGERPRINT_VERSION } from "@meelni/core";

/** Server-only content binding. Never log or return the hashed source input. */
export function createFocusedPracticeSourceFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: FOCUSED_PRACTICE_SOURCE_FINGERPRINT_VERSION,
        source: canonicalize(value),
      }),
      "utf8"
    )
    .digest("hex");
}

/** Freeze the exact pre-SAV-440 hash material for existing practice sources. */
export function projectLegacyFocusedPracticeSourceFingerprintInput(value: {
  userId: unknown;
  sessionId: unknown;
  feedbackId: unknown;
  roundType: unknown;
  feedbackStatus: unknown;
  question: unknown;
  feedback: Record<string, unknown>;
  evidenceTurns: unknown;
  frozenEvidence: null | Record<string, unknown>;
}) {
  const feedback = value.feedback;
  const frozenEvidence = value.frozenEvidence;
  return {
    userId: value.userId,
    sessionId: value.sessionId,
    feedbackId: value.feedbackId,
    roundType: value.roundType,
    feedbackStatus: value.feedbackStatus,
    question: value.question,
    feedback: {
      id: feedback.id,
      sessionId: feedback.sessionId,
      structureScore: feedback.structureScore,
      clarityScore: feedback.clarityScore,
      insightScore: feedback.insightScore,
      communicationScore: feedback.communicationScore,
      leadershipScore: feedback.leadershipScore,
      overallScore: feedback.overallScore,
      summary: feedback.summary,
      rubricVersion: feedback.rubricVersion,
      schemaVersion: feedback.schemaVersion,
      promptVersion: feedback.promptVersion,
      modelVersion: feedback.modelVersion,
      evaluationState: feedback.evaluationState,
      feedbackMode: feedback.feedbackMode,
      feedbackRoundType: feedback.feedbackRoundType,
      createdAt: feedback.createdAt,
      status: feedback.status,
      outcomeReason: feedback.outcomeReason,
      processingStartedAt: feedback.processingStartedAt,
      completionTier: feedback.completionTier,
      dispatchStatus: feedback.dispatchStatus,
      dispatchEventId: feedback.dispatchEventId,
      dispatchClaimedAt: feedback.dispatchClaimedAt,
      dispatchedAt: feedback.dispatchedAt,
      strengths: feedback.strengths,
      improvements: feedback.improvements,
      drills: feedback.drills,
      completionStats: feedback.completionStats,
      completionRecommendations: feedback.completionRecommendations,
      dimensionCoverage: feedback.dimensionCoverage,
    },
    evidenceTurns: value.evidenceTurns,
    frozenEvidence: frozenEvidence
      ? {
          snapshotValid: frozenEvidence.snapshotValid,
          snapshotState: frozenEvidence.snapshotState,
          turns: frozenEvidence.turns,
          interruptions: frozenEvidence.interruptions,
          sessionEndAt: frozenEvidence.sessionEndAt,
          sourceOverflow: frozenEvidence.sourceOverflow,
        }
      : null,
  };
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") {
    return value === undefined ? null : value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])])
  );
}
