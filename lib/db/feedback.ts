import { eq, sql } from "drizzle-orm";

import { db } from "./index";
import { feedback } from "./schema";

export const FEEDBACK_DB_READ_LIMITS = {
  numericString: 32,
  summary: 4_000,
  version: 256,
  dispatchEventId: 256,
  // Includes worst-case JSON escaping for every presenter-accepted item.
  findingsJson: 1_000_000,
  drillsJson: 64_000,
} as const;

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
      status: feedback.status,
      processingStartedAt: feedback.processingStartedAt,
      completionTier: feedback.completionTier,
      dispatchStatus: feedback.dispatchStatus,
      dispatchEventId: sql<
        string | null
      >`left(${feedback.dispatchEventId}, ${FEEDBACK_DB_READ_LIMITS.dispatchEventId + 1})`,
      dispatchClaimedAt: feedback.dispatchClaimedAt,
    })
    .from(feedback)
    .where(eq(feedback.sessionId, sessionId))
    .limit(1);
}

export type BoundedFeedbackReadRow = Awaited<
  ReturnType<typeof buildFeedbackReadQuery>
>[number];

export function decodeBoundedFeedbackReadRow(row: BoundedFeedbackReadRow) {
  const { strengthsJson, improvementsJson, drillsJson, ...record } = row;
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
  };
}

/** Get an owner-checked session's bounded feedback lifecycle record. */
export async function getFeedbackBySessionId(sessionId: string) {
  const [row] = await buildFeedbackReadQuery(db, sessionId);
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
