import { and, asc, eq, isNotNull, lte } from "drizzle-orm";

import { db } from "./index";
import { interviewSession } from "./schema";

export interface UserEndRecoveryItem {
  sessionId: string;
  userId: string;
  lifecycleVersion: number;
}

/**
 * The ending lifecycle claim doubles as a durable outbox. If immediate event
 * delivery fails, this scan re-enqueues the same idempotent finalization work.
 */
export async function listUserInterviewEndsToRecover(
  limit = 250,
  database: Pick<typeof db, "select"> = db
): Promise<UserEndRecoveryItem[]> {
  return database
    .select({
      sessionId: interviewSession.id,
      userId: interviewSession.userId,
      lifecycleVersion: interviewSession.lifecycleVersion,
    })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.lifecycleState, "ending"),
        eq(interviewSession.terminalReason, "user_end"),
        isNotNull(interviewSession.endingAt),
        lte(interviewSession.endingAt, new Date())
      )
    )
    .orderBy(asc(interviewSession.endingAt), asc(interviewSession.id))
    .limit(Math.max(0, limit));
}
