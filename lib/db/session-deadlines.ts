import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
} from "@meelni/core";

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
  userId: string;
  startedAt: Date | null;
  config: unknown;
  roomName: string | null;
  state: InterviewLifecycleState;
  version: number;
  terminalReason: string | null;
  deadlineRoomCleanupStatus: DeadlineRoomCleanupStatus;
  databaseNow: Date;
}

export interface ClaimInterviewDeadlineInput {
  sessionId: string;
  expectedState: "created" | "connecting" | "active" | "reconnecting";
  expectedVersion: number;
  deadlineAt: Date;
  terminalReason: "time_limit" | "insufficient_signal";
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
  sessionId: string,
  database: InterviewDeadlineDatabase = db
): Promise<InterviewDeadlineSession | undefined> {
  const [session] = await database
    .select({
      id: interviewSession.id,
      userId: interviewSession.userId,
      startedAt: interviewSession.startedAt,
      config: interviewSession.config,
      livekitRoomName: interviewSession.livekitRoomName,
      lifecycleState: interviewSession.lifecycleState,
      lifecycleVersion: interviewSession.lifecycleVersion,
      terminalReason: interviewSession.terminalReason,
      deadlineRoomCleanupStatus: interviewSession.deadlineRoomCleanupStatus,
      databaseNow: sql<Date>`clock_timestamp()`,
    })
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);
  if (!session) return undefined;
  return {
    id: session.id,
    userId: session.userId,
    startedAt: session.startedAt,
    config: session.config,
    roomName: session.livekitRoomName,
    state: session.lifecycleState,
    version: session.lifecycleVersion,
    terminalReason: session.terminalReason,
    deadlineRoomCleanupStatus: session.deadlineRoomCleanupStatus,
    databaseNow: parseDatabaseTimestamp(session.databaseNow),
  };
}

export async function claimInterviewDeadline(
  input: ClaimInterviewDeadlineInput,
  database: InterviewDeadlineDatabase = db
): Promise<boolean> {
  const rows = await database
    .update(interviewSession)
    .set({
      lifecycleState: "ending",
      lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
      terminalReason: input.terminalReason,
      status: projectLegacyInterviewSessionStatus({
        state: "ending",
        terminalReason: input.terminalReason,
      }),
      lastTransitionAt: sql`clock_timestamp()`,
      endingAt: sql`COALESCE(${interviewSession.endingAt}, clock_timestamp())`,
      roomCleanupPending: sql`${interviewSession.livekitRoomName} IS NOT NULL`,
      deadlineRoomCleanupStatus: "pending",
      deadlineRoomCleanupAcknowledgedAt: null,
    })
    .where(
      and(
        eq(interviewSession.id, input.sessionId),
        eq(interviewSession.lifecycleState, input.expectedState),
        eq(interviewSession.lifecycleVersion, input.expectedVersion),
        isNotNull(interviewSession.startedAt),
        sql`${canonicalDeadlineSql} = ${input.deadlineAt.toISOString()}::timestamptz`,
        sql`${canonicalDeadlineSql} <= clock_timestamp()`
      )
    )
    .returning({ id: interviewSession.id });

  return Boolean(rows[0]);
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
  limit = 250,
  database: InterviewDeadlineDatabase = db
): Promise<InterviewDeadlineRecoveryItem[]> {
  const normalizedLimit = Math.max(0, limit);
  const sessions = await database
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      deadlineAt: canonicalDeadlineSql,
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
            ]),
            or(
              isNull(interviewSession.startedAt),
              and(
                isNotNull(interviewSession.startedAt),
                sql`${canonicalDeadlineSql} <= clock_timestamp()`
              )
            )
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
                sql`${feedback.dispatchClaimedAt} < clock_timestamp() - (${FEEDBACK_DISPATCH_LEASE_MS} * interval '1 millisecond')`
              )
            )
          )
        )
      )
    )
    .orderBy(
      sql`CASE WHEN ${interviewSession.startedAt} IS NULL THEN 0 ELSE 1 END`,
      asc(canonicalDeadlineSql),
      asc(interviewSession.id)
    )
    .limit(normalizedLimit);

  return sessions.map((session) =>
    session.startedAt
      ? {
          kind: "deadline" as const,
          sessionId: session.id,
          deadlineAt: serializeInterviewDeadlineAt(
            parseDatabaseTimestamp(session.deadlineAt)
          ),
        }
      : {
          kind: "invalid_session" as const,
          sessionId: session.id,
          reason: "missing_started_at" as const,
        }
  );
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

export type InterviewDeadlineDatabase = Pick<typeof db, "select" | "update">;

const durationMinutesSql = sql<number>`CASE
  WHEN jsonb_typeof(${interviewSession.config}->'duration') = 'number'
    THEN CASE
      WHEN (${interviewSession.config}->>'duration')::numeric IN (15, 30, 45)
        THEN (${interviewSession.config}->>'duration')::integer
      ELSE 30
    END
  ELSE 30
END`;

const canonicalDeadlineSql = sql<Date>`${interviewSession.startedAt} + (${durationMinutesSql} * interval '1 minute')`;

function parseDatabaseTimestamp(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(
      "Database returned an invalid interview deadline timestamp"
    );
  }
  return parsed;
}
