import { and, eq, sql } from "drizzle-orm";
import {
  isInterviewTerminalState,
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
  type InterviewTerminalReason,
} from "@meelni/core";

import { db } from "./index";
import { interviewSession } from "./schema";

export interface AcceptedUserInterviewEnd {
  sessionId: string;
  userId: string;
  lifecycleState: InterviewLifecycleState;
  lifecycleVersion: number;
  terminalReason: InterviewTerminalReason | null;
  endingAt: Date | null;
  endedAt: Date | null;
}

export type AcceptUserInterviewEndResult =
  | {
      ok: true;
      disposition: "accepted" | "already_ending" | "already_terminal";
      session: AcceptedUserInterviewEnd;
    }
  | { ok: false; reason: "not_found" };

/**
 * Atomically accepts the user's terminal intent without starting provider,
 * billing, cleanup, or feedback work. The ending timestamp is the semantic
 * transcript cutoff and the durable recovery/outbox signal.
 */
export async function acceptUserInterviewEnd(
  input: { sessionId: string; userId: string },
  database: typeof db = db
): Promise<AcceptUserInterviewEndResult> {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select({
        sessionId: interviewSession.id,
        userId: interviewSession.userId,
        lifecycleState: interviewSession.lifecycleState,
        lifecycleVersion: interviewSession.lifecycleVersion,
        terminalReason: interviewSession.terminalReason,
        endingAt: interviewSession.endingAt,
        endedAt: interviewSession.endedAt,
      })
      .from(interviewSession)
      .where(
        and(
          eq(interviewSession.id, input.sessionId),
          eq(interviewSession.userId, input.userId)
        )
      )
      .limit(1)
      .for("update");
    const current = rows[0];
    if (!current) return { ok: false, reason: "not_found" } as const;

    if (isInterviewTerminalState(current.lifecycleState)) {
      return {
        ok: true,
        disposition: "already_terminal",
        session: current,
      } as const;
    }
    if (current.lifecycleState === "ending") {
      return {
        ok: true,
        disposition: "already_ending",
        session: current,
      } as const;
    }

    const updated = await tx
      .update(interviewSession)
      .set({
        lifecycleState: "ending",
        lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
        terminalReason: "user_end",
        status: projectLegacyInterviewSessionStatus({
          state: "ending",
          terminalReason: "user_end",
        }),
        endingAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        lastTransitionAt: sql`date_trunc('milliseconds', clock_timestamp())`,
        roomCleanupPending: sql`${interviewSession.livekitRoomName} IS NOT NULL`,
        roomCleanupAttemptedAt: null,
      })
      .where(
        and(
          eq(interviewSession.id, input.sessionId),
          eq(interviewSession.userId, input.userId),
          eq(interviewSession.lifecycleState, current.lifecycleState),
          eq(interviewSession.lifecycleVersion, current.lifecycleVersion)
        )
      )
      .returning({
        sessionId: interviewSession.id,
        userId: interviewSession.userId,
        lifecycleState: interviewSession.lifecycleState,
        lifecycleVersion: interviewSession.lifecycleVersion,
        terminalReason: interviewSession.terminalReason,
        endingAt: interviewSession.endingAt,
        endedAt: interviewSession.endedAt,
      });

    if (!updated[0]) {
      throw new Error("interview_end_acceptance_conflict");
    }
    return {
      ok: true,
      disposition: "accepted",
      session: updated[0],
    } as const;
  });
}
