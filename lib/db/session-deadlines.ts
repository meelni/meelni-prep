import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";

import {
  deriveInterviewDeadlineAt,
  normalizeInterviewDurationMinutes,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";
import { db } from "./index";
import { feedback, interviewSession } from "./schema";
import { FEEDBACK_DISPATCH_LEASE_MS } from "./feedback-dispatch";

export interface InterviewDeadlineSession {
  id: string;
  startedAt: Date | null;
  config: unknown;
  roomName: string | null;
  terminalReason: string | null;
  deadlineRoomCleanupStatus: DeadlineRoomCleanupStatus;
}

export type DeadlineRoomCleanupStatus =
  | "pending"
  | "deleted"
  | "already_absent"
  | null;

export interface InterviewDeadlineScheduleRow {
  id: string;
  startedAt: Date | null;
  config: unknown;
  lifecycleState?: string;
  terminalReason?: string | null;
  deadlineRoomCleanupStatus?: DeadlineRoomCleanupStatus;
  feedbackStatus?: string | null;
  feedbackDispatchStatus?: string | null;
  feedbackDispatchClaimedAt?: Date | null;
}

export type InterviewDeadlineRecoveryItem =
  | {
      kind: "deadline";
      sessionId: string;
      deadlineAt: string;
    }
  | {
      kind: "invalid_session";
      sessionId: string;
      reason: "missing_started_at";
    };

export async function getInterviewDeadlineSession(
  sessionId: string
): Promise<InterviewDeadlineSession | undefined> {
  const session = await db.query.interviewSession.findFirst({
    columns: {
      id: true,
      startedAt: true,
      config: true,
      livekitRoomName: true,
      terminalReason: true,
      deadlineRoomCleanupStatus: true,
    },
    where: (session, { eq }) => eq(session.id, sessionId),
  });
  if (!session) return undefined;
  return {
    id: session.id,
    startedAt: session.startedAt,
    config: session.config,
    roomName: session.livekitRoomName,
    terminalReason: session.terminalReason,
    deadlineRoomCleanupStatus: session.deadlineRoomCleanupStatus,
  };
}

export function isInterviewDeadlineRoomCleanupAcknowledged(input: {
  terminalReason: string | null | undefined;
  deadlineRoomCleanupStatus: DeadlineRoomCleanupStatus | undefined;
}): boolean {
  return (
    input.deadlineRoomCleanupStatus === "deleted" ||
    input.deadlineRoomCleanupStatus === "already_absent" ||
    (input.deadlineRoomCleanupStatus == null &&
      input.terminalReason !== "time_limit")
  );
}

export function hasInterviewDeadlineRoomCleanupClaim(input: {
  terminalReason: string | null | undefined;
  deadlineRoomCleanupStatus: DeadlineRoomCleanupStatus | undefined;
}): boolean {
  return (
    input.deadlineRoomCleanupStatus != null ||
    input.terminalReason === "time_limit"
  );
}

export async function acknowledgeInterviewDeadlineRoomCleanup(
  sessionId: string,
  disposition: "deleted" | "already_absent"
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        terminalReason: interviewSession.terminalReason,
        cleanupStatus: interviewSession.deadlineRoomCleanupStatus,
      })
      .from(interviewSession)
      .where(eq(interviewSession.id, sessionId))
      .limit(1)
      .for("update");
    const session = rows[0];
    if (!session || session.cleanupStatus === null) {
      throw new Error("Deadline cleanup acknowledgement is not claimable");
    }
    if (
      session.cleanupStatus === "deleted" ||
      session.cleanupStatus === "already_absent"
    ) {
      return;
    }
    await tx
      .update(interviewSession)
      .set({
        deadlineRoomCleanupStatus: disposition,
        deadlineRoomCleanupAcknowledgedAt: new Date(),
      })
      .where(eq(interviewSession.id, sessionId));
  });
}

export async function listInterviewDeadlineSchedules(
  limit = 250
): Promise<InterviewDeadlineRecoveryItem[]> {
  const now = new Date();
  const staleDispatchBefore = new Date(
    now.getTime() - FEEDBACK_DISPATCH_LEASE_MS
  );
  const sessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      config: interviewSession.config,
      lifecycleState: interviewSession.lifecycleState,
      terminalReason: interviewSession.terminalReason,
      deadlineRoomCleanupStatus: interviewSession.deadlineRoomCleanupStatus,
      feedbackStatus: feedback.status,
      feedbackDispatchStatus: feedback.dispatchStatus,
      feedbackDispatchClaimedAt: feedback.dispatchClaimedAt,
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.mode, "voice_video"),
        or(
          and(
            isNotNull(interviewSession.livekitRoomName),
            inArray(interviewSession.lifecycleState, [
              "created",
              "connecting",
              "active",
              "reconnecting",
              "ending",
            ])
          ),
          eq(interviewSession.deadlineRoomCleanupStatus, "pending"),
          and(
            inArray(interviewSession.deadlineRoomCleanupStatus, [
              "deleted",
              "already_absent",
            ]),
            inArray(feedback.status, ["pending", "failed"]),
            or(
              inArray(feedback.dispatchStatus, ["pending", "failed"]),
              and(
                eq(feedback.status, "failed"),
                eq(feedback.dispatchStatus, "sent")
              ),
              and(
                eq(feedback.dispatchStatus, "sending"),
                lt(feedback.dispatchClaimedAt, staleDispatchBefore)
              )
            )
          )
        )
      )
    );

  return buildInterviewDeadlineSchedules(sessions, limit, now);
}

export function buildInterviewDeadlineSchedules(
  sessions: InterviewDeadlineScheduleRow[],
  limit: number,
  now: Date
): InterviewDeadlineRecoveryItem[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new RangeError("now must be a valid Date");
  }

  return sessions
    .filter(
      (session) =>
        session.lifecycleState === undefined ||
        ["created", "connecting", "active", "reconnecting", "ending"].includes(
          session.lifecycleState
        ) ||
        session.deadlineRoomCleanupStatus === "pending" ||
        isDeadlineFeedbackDispatchRecoverable(session, now)
    )
    .flatMap<InterviewDeadlineRecoveryItem>((session) => {
      if (!session.startedAt) {
        return [
          {
            kind: "invalid_session" as const,
            sessionId: session.id,
            reason: "missing_started_at" as const,
          },
        ];
      }
      const config = isRecord(session.config) ? session.config : {};
      const deadlineAt = deriveInterviewDeadlineAt({
        startedAt: session.startedAt,
        durationMinutes: normalizeInterviewDurationMinutes(config.duration),
      });
      if (deadlineAt.getTime() > nowMs) return [];
      return [
        {
          kind: "deadline" as const,
          sessionId: session.id,
          deadlineAt: serializeInterviewDeadlineAt(deadlineAt),
        },
      ];
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "invalid_session" ? -1 : 1;
      }
      if (left.kind === "invalid_session") {
        return right.kind === "invalid_session"
          ? left.sessionId.localeCompare(right.sessionId)
          : -1;
      }
      if (right.kind !== "deadline") return 1;
      const deadlineOrder = left.deadlineAt.localeCompare(right.deadlineAt);
      return deadlineOrder !== 0
        ? deadlineOrder
        : left.sessionId.localeCompare(right.sessionId);
    })
    .slice(0, Math.max(0, limit));
}

function isDeadlineFeedbackDispatchRecoverable(
  session: InterviewDeadlineScheduleRow,
  now: Date
): boolean {
  if (
    !["deleted", "already_absent"].includes(
      session.deadlineRoomCleanupStatus ?? ""
    ) ||
    !["pending", "failed"].includes(session.feedbackStatus ?? "")
  ) {
    return false;
  }

  if (["pending", "failed"].includes(session.feedbackDispatchStatus ?? "")) {
    return true;
  }
  if (
    session.feedbackStatus === "failed" &&
    session.feedbackDispatchStatus === "sent"
  ) {
    return true;
  }
  return (
    session.feedbackDispatchStatus === "sending" &&
    session.feedbackDispatchClaimedAt instanceof Date &&
    session.feedbackDispatchClaimedAt.getTime() <
      now.getTime() - FEEDBACK_DISPATCH_LEASE_MS
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
