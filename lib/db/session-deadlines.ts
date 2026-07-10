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
): Promise<Array<{ sessionId: string; deadlineAt: string }>> {
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
          "connecting",
          "active",
          "reconnecting",
        ])
      )
    );

  return buildInterviewDeadlineSchedules(sessions, limit);
}

export function buildInterviewDeadlineSchedules(
  sessions: InterviewDeadlineScheduleRow[],
  limit: number
): Array<{ sessionId: string; deadlineAt: string }> {
  return sessions
    .flatMap((session) => {
      if (!session.startedAt) return [];
      const config = isRecord(session.config) ? session.config : {};
      return [
        {
          sessionId: session.id,
          deadlineAt: serializeInterviewDeadlineAt(
            deriveInterviewDeadlineAt({
              startedAt: session.startedAt,
              durationMinutes: normalizeInterviewDurationMinutes(
                config.duration
              ),
            })
          ),
        },
      ];
    })
    .sort((left, right) => left.deadlineAt.localeCompare(right.deadlineAt))
    .slice(0, Math.max(0, limit));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
