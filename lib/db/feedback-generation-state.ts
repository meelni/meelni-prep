import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { FeedbackV2Result } from "@meelni/core";

import { db } from "./index";
import { feedback } from "./schema";
import { INTERVIEW_LIFECYCLE_SLOS } from "@/lib/operations/interview-lifecycle-slo";

export const FEEDBACK_GENERATION_LEASE_MS = 5 * 60 * 1000;
export const FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS =
  INTERVIEW_LIFECYCLE_SLOS.feedback_completion.upperBoundMs;

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
  eventId: string | null;
  processingStartedAt: Date | null;
  completionTier: "full" | "partial" | "insufficient" | "abandoned" | null;
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
  }): Promise<FeedbackGenerationRecord | null>;
  complete(input: {
    sessionId: string;
    eventId: string;
    evaluation: FeedbackV2Result;
    processingDurationMs: number;
  }): Promise<boolean>;
  skip(input: {
    sessionId: string;
    eventId: string;
    reason: string;
    completionTier?: "insufficient";
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

export function createDrizzleFeedbackGenerationStore(): FeedbackGenerationStore {
  return {
    async get(sessionId) {
      const row = await db.query.feedback.findFirst({
        where: eq(feedback.sessionId, sessionId),
      });
      return row ? mapRecord(row) : null;
    },

    async claim({ sessionId, eventId, now }) {
      const rows = await db
        .update(feedback)
        .set({
          status: "processing",
          statusReason: null,
          processingStartedAt: now,
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            inArray(feedback.status, ["pending", "failed"]),
            eq(feedback.dispatchEventId, eventId),
            sql`${feedback.dispatchStatus} <> 'not_required'`
          )
        )
        .returning();
      return rows[0] ? mapRecord(rows[0]) : null;
    },

    async complete({ sessionId, eventId, evaluation, processingDurationMs }) {
      const rows = await db
        .update(feedback)
        .set({
          status: "completed",
          statusReason: null,
          overallScore: evaluation.overallScore.toString(),
          structureScore: evaluation.scores.structure,
          clarityScore: evaluation.scores.clarity,
          insightScore: evaluation.scores.insight,
          communicationScore: evaluation.scores.communication,
          leadershipScore: evaluation.scores.leadership,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          drills: evaluation.drills,
          summary: evaluation.summary,
          processingDurationMs,
          schemaVersion: evaluation.schemaVersion,
          promptVersion: evaluation.promptVersion,
          modelVersion: evaluation.modelVersion,
          rubricVersion: evaluation.rubricVersion,
          evaluationState: evaluation.evaluationState,
        })
        .where(activeClaim(sessionId, eventId))
        .returning({ id: feedback.id });
      return rows.length === 1;
    },

    async skip({ sessionId, eventId, reason, completionTier }) {
      const rows = await db
        .update(feedback)
        .set({
          status: "skipped",
          statusReason: reason,
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
        })
        .where(activeClaim(sessionId, eventId))
        .returning({ id: feedback.id });
      return rows.length === 1;
    },

    async fail({ sessionId, eventId, reason }) {
      const rows = await db
        .update(feedback)
        .set({
          status: "failed",
          statusReason: reason,
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
      const rows = await db
        .update(feedback)
        .set({
          status: "pending",
          statusReason: null,
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

function activeClaim(sessionId: string, eventId: string) {
  return and(
    eq(feedback.sessionId, sessionId),
    eq(feedback.status, "processing"),
    eq(feedback.dispatchEventId, eventId)
  );
}

function mapRecord(
  row: typeof feedback.$inferSelect
): FeedbackGenerationRecord {
  return {
    sessionId: row.sessionId,
    status: row.status as FeedbackGenerationStatus,
    statusReason: row.statusReason,
    eventId: row.dispatchEventId,
    processingStartedAt: row.processingStartedAt,
    completionTier: row.completionTier,
    dispatchStatus: row.dispatchStatus,
    dispatchClaimedAt: row.dispatchClaimedAt,
    dispatchedAt: row.dispatchedAt,
  };
}
