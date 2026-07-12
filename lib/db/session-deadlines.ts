import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  deriveInterviewDeadlineAt,
  normalizeInterviewDurationMinutes,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";
import { db } from "./index";
import { interviewSession } from "./schema";

export interface InterviewDeadlineSession {
  id: string;
  startedAt: Date | null;
  config: unknown;
  roomName: string | null;
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
  sessionId: string
): Promise<InterviewDeadlineSession | undefined> {
  const session = await db.query.interviewSession.findFirst({
    columns: {
      id: true,
      startedAt: true,
      config: true,
      livekitRoomName: true,
    },
    where: (session, { eq }) => eq(session.id, sessionId),
  });
  if (!session) return undefined;
  return {
    id: session.id,
    startedAt: session.startedAt,
    config: session.config,
    roomName: session.livekitRoomName,
  };
}

export async function listInterviewDeadlineSchedules(
  limit = 250
): Promise<InterviewDeadlineRecoveryItem[]> {
  const sessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      config: interviewSession.config,
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
        ])
      )
    );

  return buildInterviewDeadlineSchedules(sessions, limit, new Date());
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
