import { serializeInterviewDeadlineAt } from "@/lib/internal/core";
import { inngest } from "@/lib/inngest/client";

export const INTERVIEW_DEADLINE_EVENT_NAME =
  "interview/deadline.reached" as const;

export interface ScheduleInterviewDeadlineInput {
  sessionId: string;
  deadlineAt: Date;
  deliveryId?: string;
}

export interface InterviewDeadlineEvent {
  id: string;
  name: typeof INTERVIEW_DEADLINE_EVENT_NAME;
  ts: number;
  data:
    | {
        sessionId: string;
        deadlineAt: string;
      }
    | {
        sessionId: string;
        recoveryReason: "missing_started_at";
      };
}

export interface InvalidInterviewSessionRecoveryInput {
  sessionId: string;
  deliveryId: string;
  occurredAt?: Date;
}

export interface ScheduleInterviewDeadlineDeps {
  send(event: InterviewDeadlineEvent): Promise<unknown>;
}

export function buildInvalidInterviewSessionRecoveryEvent(
  input: InvalidInterviewSessionRecoveryInput
): InterviewDeadlineEvent {
  const occurredAt = input.occurredAt ?? new Date();
  const timestamp = occurredAt.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("occurredAt must be a valid Date");
  }
  return {
    id: `interview-deadline-quarantine:${input.sessionId}:${input.deliveryId}`,
    name: INTERVIEW_DEADLINE_EVENT_NAME,
    ts: timestamp,
    data: {
      sessionId: input.sessionId,
      recoveryReason: "missing_started_at",
    },
  };
}

export function buildInterviewDeadlineEvent(
  input: ScheduleInterviewDeadlineInput
): InterviewDeadlineEvent {
  const deadlineAt = serializeInterviewDeadlineAt(input.deadlineAt);
  const deliverySuffix = input.deliveryId ? `:${input.deliveryId}` : "";
  return {
    id: `interview-deadline:${input.sessionId}:${deadlineAt}${deliverySuffix}`,
    name: INTERVIEW_DEADLINE_EVENT_NAME,
    ts: input.deadlineAt.getTime(),
    data: {
      sessionId: input.sessionId,
      deadlineAt,
    },
  };
}

export async function scheduleInterviewDeadline(
  input: ScheduleInterviewDeadlineInput,
  deps: ScheduleInterviewDeadlineDeps = {
    send: (event) => inngest.send(event),
  }
): Promise<InterviewDeadlineEvent> {
  const event = buildInterviewDeadlineEvent(input);
  await deps.send(event);
  return event;
}
