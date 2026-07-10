import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "./index";
import { feedback } from "./schema";

export const FEEDBACK_DISPATCH_LEASE_MS = 2 * 60 * 1000;

export interface FeedbackDispatchRecord {
  sessionId: string;
  eventId: string | null;
  status: typeof feedback.$inferSelect.dispatchStatus;
  attempts: number;
  claimedAt: Date | null;
  dispatchedAt: Date | null;
}

export interface FeedbackDispatchStore {
  get(sessionId: string): Promise<FeedbackDispatchRecord | null>;
  claim(input: {
    sessionId: string;
    now: Date;
    staleBefore: Date;
  }): Promise<FeedbackDispatchRecord | null>;
  markSent(input: {
    sessionId: string;
    eventId: string;
    attempt: number;
    now: Date;
  }): Promise<boolean>;
  markFailed(input: {
    sessionId: string;
    eventId: string | null;
    attempt: number;
    errorCode: string;
  }): Promise<boolean>;
}

export type FeedbackDispatchDatabase = Pick<typeof db, "select" | "update">;

export function isFeedbackDispatchRetryable(
  dispatch: Pick<FeedbackDispatchRecord, "status" | "claimedAt">,
  now = new Date()
): boolean {
  if (dispatch.status === "pending" || dispatch.status === "failed") {
    return true;
  }
  if (dispatch.status !== "sending") return false;
  return (
    dispatch.claimedAt === null ||
    dispatch.claimedAt.getTime() <= now.getTime() - FEEDBACK_DISPATCH_LEASE_MS
  );
}

export function createDrizzleFeedbackDispatchStore(
  database: FeedbackDispatchDatabase = db
): FeedbackDispatchStore {
  return {
    async get(sessionId) {
      const rows = await database
        .select()
        .from(feedback)
        .where(eq(feedback.sessionId, sessionId))
        .limit(1);
      return rows[0] ? mapDispatch(rows[0]) : null;
    },

    async claim({ sessionId, now, staleBefore }) {
      const rows = await database
        .update(feedback)
        .set({
          dispatchStatus: "sending",
          dispatchAttempts: sql`${feedback.dispatchAttempts} + 1`,
          dispatchClaimedAt: now,
          dispatchLastError: null,
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            inArray(feedback.status, ["pending", "failed"]),
            or(
              inArray(feedback.dispatchStatus, ["pending", "failed"]),
              and(
                eq(feedback.status, "failed"),
                eq(feedback.dispatchStatus, "sent")
              ),
              and(
                eq(feedback.dispatchStatus, "sending"),
                lt(feedback.dispatchClaimedAt, staleBefore)
              )
            )
          )
        )
        .returning();
      return rows[0] ? mapDispatch(rows[0]) : null;
    },

    async markSent({ sessionId, eventId, attempt, now }) {
      const rows = await database
        .update(feedback)
        .set({
          dispatchStatus: "sent",
          dispatchedAt: now,
          dispatchLastError: null,
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            eq(feedback.dispatchEventId, eventId),
            eq(feedback.dispatchAttempts, attempt),
            eq(feedback.dispatchStatus, "sending")
          )
        )
        .returning({ id: feedback.id });
      return Boolean(rows[0]);
    },

    async markFailed({ sessionId, eventId, attempt, errorCode }) {
      const eventPredicate =
        eventId === null
          ? isNull(feedback.dispatchEventId)
          : eq(feedback.dispatchEventId, eventId);
      const rows = await database
        .update(feedback)
        .set({
          dispatchStatus: "failed",
          dispatchLastError: errorCode,
        })
        .where(
          and(
            eq(feedback.sessionId, sessionId),
            eventPredicate,
            eq(feedback.dispatchAttempts, attempt),
            eq(feedback.dispatchStatus, "sending")
          )
        )
        .returning({ id: feedback.id });
      return Boolean(rows[0]);
    },
  };
}

function mapDispatch(
  row: typeof feedback.$inferSelect
): FeedbackDispatchRecord {
  return {
    sessionId: row.sessionId,
    eventId: row.dispatchEventId,
    status: row.dispatchStatus,
    attempts: row.dispatchAttempts,
    claimedAt: row.dispatchClaimedAt,
    dispatchedAt: row.dispatchedAt,
  };
}
