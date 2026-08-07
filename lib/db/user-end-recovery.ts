import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "./index";
import { FEEDBACK_DISPATCH_LEASE_MS } from "./feedback-dispatch";
import { feedback, interviewSession } from "./schema";

export interface UserEndRecoveryItem {
  sessionId: string;
  userId: string;
  lifecycleVersion: number;
  resumeFrom: "runtime_settlement" | "feedback_dispatch";
}

/**
 * The ending lifecycle claim and terminal feedback outbox are durable recovery
 * signals. The scan resumes each item at its earliest unfinished stage.
 */
export async function listUserInterviewEndsToRecover(
  limit = 250,
  database: Pick<typeof db, "select"> = db,
  now = new Date()
): Promise<UserEndRecoveryItem[]> {
  const staleDispatchBefore = new Date(
    now.getTime() - FEEDBACK_DISPATCH_LEASE_MS
  );
  const rows = await database
    .select({
      sessionId: interviewSession.id,
      userId: interviewSession.userId,
      lifecycleVersion: interviewSession.lifecycleVersion,
      lifecycleState: interviewSession.lifecycleState,
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(
      or(
        and(
          eq(interviewSession.lifecycleState, "ending"),
          eq(interviewSession.terminalReason, "user_end"),
          isNotNull(interviewSession.endingAt),
          lte(interviewSession.endingAt, now)
        ),
        and(
          inArray(interviewSession.lifecycleState, [
            "completed",
            "abandoned",
            "failed",
          ]),
          or(
            isNull(interviewSession.deadlineRoomCleanupStatus),
            inArray(interviewSession.deadlineRoomCleanupStatus, [
              "deleted",
              "already_absent",
            ])
          ),
          inArray(feedback.status, ["pending", "failed"]),
          or(
            inArray(feedback.dispatchStatus, ["pending", "failed"]),
            and(
              eq(feedback.status, "failed"),
              eq(feedback.dispatchStatus, "sent")
            ),
            and(
              eq(feedback.dispatchStatus, "sending"),
              or(
                isNull(feedback.dispatchClaimedAt),
                lte(feedback.dispatchClaimedAt, staleDispatchBefore)
              )
            )
          )
        )
      )
    )
    .orderBy(asc(interviewSession.lastTransitionAt), asc(interviewSession.id))
    .limit(Math.max(0, limit));

  return buildUserEndRecoveryItems(rows);
}

export function buildUserEndRecoveryItems(
  rows: Array<{
    sessionId: string;
    userId: string;
    lifecycleVersion: number;
    lifecycleState: string;
  }>
): UserEndRecoveryItem[] {
  return rows.map((row) => ({
    sessionId: row.sessionId,
    userId: row.userId,
    lifecycleVersion: row.lifecycleVersion,
    resumeFrom:
      row.lifecycleState === "ending"
        ? "runtime_settlement"
        : "feedback_dispatch",
  }));
}
