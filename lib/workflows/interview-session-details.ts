import {
  deriveInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";

export class InterviewSessionDeadlineUnavailableError extends Error {
  readonly code = "session_deadline_unavailable";

  constructor() {
    super("Interview session has no valid server start time");
    this.name = "InterviewSessionDeadlineUnavailableError";
  }
}

export function attachCanonicalInterviewDeadline<
  T extends { startedAt: Date | null; config: unknown },
>(session: T): T & { deadlineAt: string } {
  if (
    !(session.startedAt instanceof Date) ||
    !Number.isFinite(session.startedAt.getTime())
  ) {
    throw new InterviewSessionDeadlineUnavailableError();
  }

  const config = isRecord(session.config) ? session.config : {};
  const deadlineAt = deriveInterviewDeadlineAt({
    startedAt: session.startedAt,
    durationMinutes: config.duration,
  });

  return {
    ...session,
    deadlineAt: serializeInterviewDeadlineAt(deadlineAt),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
