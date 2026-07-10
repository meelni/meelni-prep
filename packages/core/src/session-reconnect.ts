export const INTERVIEW_RECONNECT_GRACE_SECONDS = 30;

export interface DeriveInterviewReconnectDeadlineInput {
  disconnectedAt: Date;
  hardDeadlineAt: Date;
  graceSeconds?: number;
}

export interface InterviewReconnectDeadline {
  deadlineAt: Date | null;
  owner: "reconnect_grace" | "hard_deadline";
}

export function deriveInterviewReconnectDeadline({
  disconnectedAt,
  hardDeadlineAt,
  graceSeconds = INTERVIEW_RECONNECT_GRACE_SECONDS,
}: DeriveInterviewReconnectDeadlineInput): InterviewReconnectDeadline {
  const reconnectDeadlineAt = new Date(
    disconnectedAt.getTime() + Math.max(0, graceSeconds) * 1000
  );

  if (hardDeadlineAt.getTime() <= reconnectDeadlineAt.getTime()) {
    return { deadlineAt: null, owner: "hard_deadline" };
  }

  return { deadlineAt: reconnectDeadlineAt, owner: "reconnect_grace" };
}

export function isInterviewReconnectDeadlineReached({
  deadlineAt,
  now,
}: {
  deadlineAt: Date;
  now: Date;
}): boolean {
  return now.getTime() >= deadlineAt.getTime();
}
