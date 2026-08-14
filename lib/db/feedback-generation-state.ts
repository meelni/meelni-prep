import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  hasServerOwnedEvidenceLimitedContent,
  isDimensionCoverageFeedbackResult,
  isEvidenceLimitedFeedbackResult,
  type FeedbackEvaluationResult,
  type FeedbackOutcomeReason,
  type SkippedFeedbackOutcomeReason,
} from "@meelni/core";

import { db } from "./index";
import { feedback } from "./schema";
import {
  FEEDBACK_GENERATION_LEASE_MS,
  FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS,
} from "@/lib/operations/interview-lifecycle-slo";

export {
  FEEDBACK_GENERATION_LEASE_MS,
  FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS,
} from "@/lib/operations/interview-lifecycle-slo";

export type FeedbackGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export interface FeedbackGenerationRecord {
  sessionId: string;
  status: FeedbackGenerationStatus;
  statusReason: string | null;
  outcomeReason: FeedbackOutcomeReason | null;
  eventId: string | null;
  processingStartedAt: Date | null;
  completionTier: "full" | "partial" | "insufficient" | "abandoned" | null;
  completionStats: {
    totalTurns: number;
    userTurns: number;
    totalWords: number;
    durationSeconds: number;
    substantiveResponses: number;
    scoreableResponses?: number;
    feedbackModeConstraint?: "evidence_limited_only";
  } | null;
  dispatchStatus: "not_required" | "pending" | "sending" | "sent" | "failed";
  dispatchClaimedAt: Date | null;
  dispatchedAt: Date | null;
}

export interface FeedbackGenerationRetryPreparation {
  prepared: boolean;
  record: FeedbackGenerationRecord | null;
}

export interface FeedbackGenerationStore {
  get(sessionId: string): Promise<FeedbackGenerationRecord | null>;
  claim(input: {
    sessionId: string;
    eventId: string;
    now: Date;
    deadlineAt?: Date;
  }): Promise<FeedbackGenerationRecord | null>;
  complete(input: {
    sessionId: string;
    eventId: string;
    evaluation: FeedbackEvaluationResult;
    processingDurationMs: number;
    deadlineAt?: Date;
  }): Promise<boolean>;
  skip(input: {
    sessionId: string;
    eventId: string;
    reason: SkippedFeedbackOutcomeReason;
    completionTier?: "insufficient";
    deadlineAt?: Date;
  }): Promise<boolean>;
  fail(input: {
    sessionId: string;
    eventId: string;
    reason: string;
  }): Promise<boolean>;
  prepareRetry(input: {
    sessionId: string;
    now: Date;
  }): Promise<FeedbackGenerationRetryPreparation>;
}

export type FeedbackGenerationDatabase = Pick<typeof db, "query" | "update">;

export function isFeedbackGenerationLeaseExpired(
  record: Pick<FeedbackGenerationRecord, "status" | "processingStartedAt">,
  now = new Date()
): boolean {
  return (
    record.status === "processing" &&
    (record.processingStartedAt === null ||
      record.processingStartedAt.getTime() <=
        now.getTime() - FEEDBACK_GENERATION_LEASE_MS)
  );
}

export function isFeedbackGenerationRetryable(
  record: Pick<FeedbackGenerationRecord, "status" | "processingStartedAt">,
  now = new Date()
): boolean {
  return (
    record.status === "failed" || isFeedbackGenerationLeaseExpired(record, now)
  );
}

export function isFeedbackQueueLeaseExpired(
  record: {
    status: string;
    dispatchStatus: string;
    dispatchedAt: Date | null;
  },
  now = new Date()
): boolean {
  return (
    record.status === "pending" &&
    record.dispatchStatus === "sent" &&
    (record.dispatchedAt === null ||
      record.dispatchedAt.getTime() <=
        now.getTime() - FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS)
  );
}

export function createDrizzleFeedbackGenerationStore(
  database: FeedbackGenerationDatabase = db
): FeedbackGenerationStore {
  return {
    async get(sessionId) {
      const row = await database.query.feedback.findFirst({
        where: eq(feedback.sessionId, sessionId),
      });
      return row ? mapRecord(row) : null;
    },

    async claim({ sessionId, eventId, now, deadlineAt }) {
      const rows = await database
        .update(feedback)
        .set({
          status: "processing",
          statusReason: null,
          outcomeReason: null,
          processingStartedAt: now,
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            inArray(feedback.status, ["pending", "failed"]),
            eq(feedback.dispatchEventId, eventId),
            sql`${feedback.dispatchStatus} <> 'not_required'`,
            ...(deadlineAt
              ? [
                  sql`CURRENT_TIMESTAMP < ${feedbackGenerationDeadlineTimestamp(deadlineAt)}::timestamptz`,
                ]
              : [])
          )
        )
        .returning();
      return rows[0] ? mapRecord(rows[0]) : null;
    },

    async complete({
      sessionId,
      eventId,
      evaluation,
      processingDurationMs,
      deadlineAt,
    }) {
      const evidenceLimited = isEvidenceLimitedFeedbackResult(evaluation);
      const dimensionCoverage = isDimensionCoverageFeedbackResult(evaluation);
      if (
        evidenceLimited &&
        !hasServerOwnedEvidenceLimitedContent({
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          summary: evaluation.summary,
        })
      ) {
        throw new Error("evidence_limited_persistence_contract_invalid");
      }
      const rows = await database
        .update(feedback)
        .set({
          status: "completed",
          statusReason: null,
          outcomeReason: "feedback_generated",
          overallScore:
            evidenceLimited || evaluation.overallScore === null
              ? null
              : evaluation.overallScore.toString(),
          structureScore: dimensionCoverage
            ? evaluation.dimensions.structure.score
            : evidenceLimited
              ? null
              : evaluation.scores.structure,
          clarityScore: dimensionCoverage
            ? evaluation.dimensions.clarity.score
            : evidenceLimited
              ? null
              : evaluation.scores.clarity,
          insightScore: dimensionCoverage
            ? evaluation.dimensions.insight.score
            : evidenceLimited
              ? null
              : evaluation.scores.insight,
          communicationScore: dimensionCoverage
            ? evaluation.dimensions.communication.score
            : evidenceLimited
              ? null
              : evaluation.scores.communication,
          leadershipScore: dimensionCoverage
            ? evaluation.dimensions.leadership.score
            : evidenceLimited
              ? null
              : evaluation.scores.leadership,
          strengths: dimensionCoverage ? null : evaluation.strengths,
          improvements: dimensionCoverage ? null : evaluation.improvements,
          drills: dimensionCoverage || evidenceLimited ? [] : evaluation.drills,
          summary: evaluation.summary,
          processingDurationMs,
          schemaVersion: evaluation.schemaVersion,
          promptVersion: evaluation.promptVersion,
          modelVersion: evaluation.modelVersion,
          rubricVersion: evaluation.rubricVersion,
          evaluationState: evaluation.evaluationState,
          feedbackMode: dimensionCoverage ? evaluation.mode : null,
          feedbackRoundType: dimensionCoverage ? evaluation.roundType : null,
          dimensionCoverage: dimensionCoverage ? evaluation.dimensions : null,
          verifiedPrefixScope:
            dimensionCoverage &&
            evaluation.schemaVersion === "feedback.dimension-coverage.v2"
              ? evaluation.verifiedPrefixScope
              : null,
        })
        .where(activeClaim(sessionId, eventId, deadlineAt))
        .returning({ id: feedback.id });
      return rows.length === 1;
    },

    async skip({ sessionId, eventId, reason, completionTier, deadlineAt }) {
      const rows = await database
        .update(feedback)
        .set({
          status: "skipped",
          statusReason: reason,
          outcomeReason: reason,
          ...(completionTier ? { completionTier } : {}),
          overallScore: null,
          structureScore: null,
          clarityScore: null,
          insightScore: null,
          communicationScore: null,
          leadershipScore: null,
          strengths: null,
          improvements: null,
          drills: null,
          summary: null,
          processingDurationMs: null,
          schemaVersion: null,
          promptVersion: null,
          modelVersion: null,
          evaluationState: null,
          feedbackMode: null,
          feedbackRoundType: null,
          dimensionCoverage: null,
          verifiedPrefixScope: null,
        })
        .where(activeClaim(sessionId, eventId, deadlineAt))
        .returning({ id: feedback.id });
      return rows.length === 1;
    },

    async fail({ sessionId, eventId, reason }) {
      const rows = await database
        .update(feedback)
        .set({
          status: "failed",
          statusReason: reason,
          outcomeReason: "generation_failed",
          dispatchStatus: "failed",
          dispatchLastError: "feedback_generation_failed",
        })
        .where(activeClaim(sessionId, eventId))
        .returning({ id: feedback.id });
      return rows.length === 1;
    },

    async prepareRetry({ sessionId, now }) {
      const staleBefore = new Date(
        now.getTime() - FEEDBACK_GENERATION_LEASE_MS
      );
      const staleQueueBefore = new Date(
        now.getTime() - FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS
      );
      const rows = await database
        .update(feedback)
        .set({
          status: "pending",
          statusReason: null,
          outcomeReason: null,
          processingStartedAt: null,
          dispatchStatus: "failed",
          dispatchClaimedAt: null,
          dispatchedAt: null,
          dispatchLastError: "feedback_generation_retry_requested",
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            or(
              eq(feedback.status, "failed"),
              and(
                eq(feedback.status, "pending"),
                eq(feedback.dispatchStatus, "sent"),
                or(
                  sql`${feedback.dispatchedAt} IS NULL`,
                  lte(feedback.dispatchedAt, staleQueueBefore)
                )
              ),
              and(
                eq(feedback.status, "processing"),
                or(
                  sql`${feedback.processingStartedAt} IS NULL`,
                  lte(feedback.processingStartedAt, staleBefore)
                )
              )
            ),
            sql`${feedback.dispatchEventId} IS NOT NULL`,
            sql`${feedback.dispatchStatus} <> 'not_required'`
          )
        )
        .returning();
      if (rows[0]) {
        return { prepared: true, record: mapRecord(rows[0]) };
      }
      return { prepared: false, record: await this.get(sessionId) };
    },
  };
}

function activeClaim(sessionId: string, eventId: string, deadlineAt?: Date) {
  return and(
    eq(feedback.sessionId, sessionId),
    eq(feedback.status, "processing"),
    eq(feedback.dispatchEventId, eventId),
    ...(deadlineAt
      ? [
          sql`CURRENT_TIMESTAMP < ${feedbackGenerationDeadlineTimestamp(deadlineAt)}::timestamptz`,
        ]
      : [])
  );
}

export function feedbackGenerationDeadlineTimestamp(deadlineAt: Date): string {
  return deadlineAt.toISOString();
}

function mapRecord(
  row: typeof feedback.$inferSelect
): FeedbackGenerationRecord {
  return {
    sessionId: row.sessionId,
    status: row.status as FeedbackGenerationStatus,
    statusReason: row.statusReason,
    outcomeReason: row.outcomeReason,
    eventId: row.dispatchEventId,
    processingStartedAt: row.processingStartedAt,
    completionTier: row.completionTier,
    completionStats: row.completionStats,
    dispatchStatus: row.dispatchStatus,
    dispatchClaimedAt: row.dispatchClaimedAt,
    dispatchedAt: row.dispatchedAt,
  };
}
