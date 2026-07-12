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
import { interviewSession } from "./schema";

export interface InterviewDeadlineSession {
  id: string;
  userId: string;
  startedAt: Date | null;
  config: unknown;
  roomName: string | null;
  state: InterviewLifecycleState;
  version: number;
  terminalReason: string | null;
  databaseNow: Date;
}

export interface ClaimInterviewDeadlineInput {
  sessionId: string;
  expectedState: "created" | "connecting" | "active" | "reconnecting";
  expectedVersion: number;
  deadlineAt: Date;
  terminalReason: "time_limit" | "insufficient_signal";
}

export interface InterviewDeadlineScheduleRow {
  id: string;
  startedAt: Date | null;
  config: unknown;
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
    .where(
      and(
        eq(interviewSession.mode, "voice_video"),
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
      return right.kind === "deadline"
        ? left.deadlineAt.localeCompare(right.deadlineAt)
        : 1;
    })
    .slice(0, Math.max(0, limit));
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
