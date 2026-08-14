import { eq } from "drizzle-orm";
import {
  createShadowFeedbackBatchAuthority,
  parsePersistedDimensionCoverageFeedback,
  type ShadowFeedbackBatchAuthorityV1,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";

import { db } from "./index";
import { feedback } from "./schema";

type ShadowFeedbackBatchAuthorityDatabase = Pick<typeof db, "query">;
type FeedbackRow = typeof feedback.$inferSelect;

/**
 * Read the final batch evaluator only through a service-only content-stripping
 * adapter. Raw dimension evidence is reparsed in memory and never returned.
 */
export async function readShadowFeedbackBatchAuthority(
  input: {
    sessionId: string;
    projection: TrustedAnswerBlockProjection;
    terminalFreezeAnchorAtMs: number;
  },
  database: ShadowFeedbackBatchAuthorityDatabase = db
): Promise<ShadowFeedbackBatchAuthorityV1 | null> {
  const row = await database.query.feedback.findFirst({
    where: eq(feedback.sessionId, input.sessionId),
  });
  return row ? normalizeShadowFeedbackBatchAuthority(row, input) : null;
}

export function normalizeShadowFeedbackBatchAuthority(
  row: FeedbackRow,
  input: {
    sessionId: string;
    projection: TrustedAnswerBlockProjection;
    terminalFreezeAnchorAtMs: number;
  }
): ShadowFeedbackBatchAuthorityV1 | null {
  const processingDurationMs = row.processingDurationMs;
  if (
    row.sessionId !== input.sessionId ||
    row.status !== "completed" ||
    !row.processingStartedAt ||
    !Number.isSafeInteger(processingDurationMs) ||
    (processingDurationMs ?? -1) < 0 ||
    !row.schemaVersion ||
    !row.promptVersion ||
    !row.rubricVersion ||
    !row.modelVersion ||
    !row.feedbackRoundType ||
    !row.evaluationState ||
    !row.feedbackMode ||
    !row.dimensionCoverage ||
    !row.summary
  ) {
    return null;
  }
  try {
    const persisted = parsePersistedDimensionCoverageFeedback(
      {
        schemaVersion: row.schemaVersion,
        promptVersion: row.promptVersion,
        rubricVersion: row.rubricVersion,
        modelVersion: row.modelVersion,
        roundType: row.feedbackRoundType,
        evaluationState: row.evaluationState,
        mode: row.feedbackMode,
        dimensions: row.dimensionCoverage,
        overallScore:
          row.overallScore === null ? null : Number(row.overallScore),
        summary: row.summary,
        ...(row.schemaVersion === "feedback.dimension-coverage.v2"
          ? { verifiedPrefixScope: row.verifiedPrefixScope }
          : {}),
      },
      {
        answerBlocks: input.projection.trustedBlocks,
        allowNumericalScores: row.feedbackMode !== "coaching_review",
        ...(row.schemaVersion === "feedback.dimension-coverage.v2"
          ? { verifiedPrefixProjection: input.projection }
          : {}),
      }
    );
    return createShadowFeedbackBatchAuthority({
      feedback: persisted,
      projection: input.projection,
      sessionId: input.sessionId,
      terminalFreezeAnchorAtMs: input.terminalFreezeAnchorAtMs,
      completedAtMs: row.processingStartedAt.getTime() + processingDurationMs!,
    });
  } catch {
    return null;
  }
}
