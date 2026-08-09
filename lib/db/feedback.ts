import { eq, sql } from "drizzle-orm";

import { db } from "./index";
import { feedback } from "./schema";

export const FEEDBACK_DB_READ_LIMITS = {
  numericString: 32,
  lifecycleStatus: 32,
  completionTier: 32,
  dispatchStatus: 32,
  summary: 4_000,
  version: 256,
  dispatchEventId: 256,
  // Includes worst-case JSON escaping for every presenter-accepted item.
  findingsJson: 1_000_000,
  drillsJson: 64_000,
  completionStatsJson: 2_000,
  completionRecommendationsJson: 64_000,
} as const;

type FeedbackRow = typeof feedback.$inferSelect;

/**
 * Read only fields consumed by the lifecycle route. Persisted text and JSON
 * are capped one character beyond the core contract so oversized values can
 * fail closed without first being materialized in full.
 */
export function buildFeedbackReadQuery(
  database: Pick<typeof db, "select">,
  sessionId: string
) {
  return database
    .select({
      id: feedback.id,
      sessionId: feedback.sessionId,
      structureScore: feedback.structureScore,
      clarityScore: feedback.clarityScore,
      insightScore: feedback.insightScore,
      communicationScore: feedback.communicationScore,
      leadershipScore: feedback.leadershipScore,
      overallScore: sql<
        string | null
      >`left(${feedback.overallScore}::text, ${FEEDBACK_DB_READ_LIMITS.numericString + 1})`,
      strengthsJson: sql<
        string | null
      >`left(${feedback.strengths}::text, ${FEEDBACK_DB_READ_LIMITS.findingsJson + 1})`,
      improvementsJson: sql<
        string | null
      >`left(${feedback.improvements}::text, ${FEEDBACK_DB_READ_LIMITS.findingsJson + 1})`,
      drillsJson: sql<
        string | null
      >`left(${feedback.drills}::text, ${FEEDBACK_DB_READ_LIMITS.drillsJson + 1})`,
      summary: sql<
        string | null
      >`left(${feedback.summary}, ${FEEDBACK_DB_READ_LIMITS.summary + 1})`,
      rubricVersion: sql<
        string | null
      >`left(${feedback.rubricVersion}, ${FEEDBACK_DB_READ_LIMITS.version + 1})`,
      schemaVersion: sql<
        string | null
      >`left(${feedback.schemaVersion}, ${FEEDBACK_DB_READ_LIMITS.version + 1})`,
      promptVersion: sql<
        string | null
      >`left(${feedback.promptVersion}, ${FEEDBACK_DB_READ_LIMITS.version + 1})`,
      modelVersion: sql<
        string | null
      >`left(${feedback.modelVersion}, ${FEEDBACK_DB_READ_LIMITS.version + 1})`,
      evaluationState: sql<
        string | null
      >`left(${feedback.evaluationState}, ${FEEDBACK_DB_READ_LIMITS.version + 1})`,
      createdAt: feedback.createdAt,
      status: sql<
        FeedbackRow["status"]
      >`left(${feedback.status}, ${FEEDBACK_DB_READ_LIMITS.lifecycleStatus + 1})`,
      processingStartedAt: feedback.processingStartedAt,
      completionTier: sql<
        FeedbackRow["completionTier"]
      >`left(${feedback.completionTier}, ${FEEDBACK_DB_READ_LIMITS.completionTier + 1})`,
      completionStatsJson: sql<
        string | null
      >`left(${feedback.completionStats}::text, ${FEEDBACK_DB_READ_LIMITS.completionStatsJson + 1})`,
      completionRecommendationsJson: sql<
        string | null
      >`left(${feedback.completionRecommendations}::text, ${FEEDBACK_DB_READ_LIMITS.completionRecommendationsJson + 1})`,
      dispatchStatus: sql<
        FeedbackRow["dispatchStatus"]
      >`left(${feedback.dispatchStatus}, ${FEEDBACK_DB_READ_LIMITS.dispatchStatus + 1})`,
      dispatchEventId: sql<
        string | null
      >`left(${feedback.dispatchEventId}, ${FEEDBACK_DB_READ_LIMITS.dispatchEventId + 1})`,
      dispatchClaimedAt: feedback.dispatchClaimedAt,
      dispatchedAt: feedback.dispatchedAt,
    })
    .from(feedback)
    .where(eq(feedback.sessionId, sessionId))
    .limit(1);
}

export type BoundedFeedbackReadRow = Awaited<
  ReturnType<typeof buildFeedbackReadQuery>
>[number];

export function decodeBoundedFeedbackReadRow(row: BoundedFeedbackReadRow) {
  const {
    strengthsJson,
    improvementsJson,
    drillsJson,
    completionStatsJson,
    completionRecommendationsJson,
    ...record
  } = row;
  return {
    ...record,
    strengths: decodeBoundedJson(
      strengthsJson,
      FEEDBACK_DB_READ_LIMITS.findingsJson
    ),
    improvements: decodeBoundedJson(
      improvementsJson,
      FEEDBACK_DB_READ_LIMITS.findingsJson
    ),
    drills: decodeBoundedJson(drillsJson, FEEDBACK_DB_READ_LIMITS.drillsJson),
    completionStats: decodeBoundedJson(
      completionStatsJson,
      FEEDBACK_DB_READ_LIMITS.completionStatsJson
    ),
    completionRecommendations: decodeBoundedJson(
      completionRecommendationsJson,
      FEEDBACK_DB_READ_LIMITS.completionRecommendationsJson
    ),
  };
}

export function hasValidFeedbackLifecycleFields(record: {
  status: unknown;
  completionTier: unknown;
  dispatchStatus: unknown;
}): boolean {
  return (
    typeof record.status === "string" &&
    ["pending", "processing", "completed", "failed", "skipped"].includes(
      record.status
    ) &&
    (record.completionTier === null ||
      ["full", "partial", "insufficient", "abandoned"].includes(
        record.completionTier as string
      )) &&
    typeof record.dispatchStatus === "string" &&
    ["not_required", "pending", "sending", "sent", "failed"].includes(
      record.dispatchStatus
    )
  );
}

/** Get an owner-checked session's bounded feedback lifecycle record. */
export async function getFeedbackBySessionId(
  sessionId: string,
  database: Pick<typeof db, "select"> = db
) {
  const [row] = await buildFeedbackReadQuery(database, sessionId);
  return row ? decodeBoundedFeedbackReadRow(row) : undefined;
}

function decodeBoundedJson(value: string | null, limit: number): unknown {
  if (value === null || value.length > limit) return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
