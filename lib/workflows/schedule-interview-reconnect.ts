import { inngest } from "@/lib/inngest/client";

export const INTERVIEW_RECONNECT_EVENT_NAME =
  "interview/reconnect.expired" as const;

export interface InterviewReconnectEvent {
  id: string;
  name: typeof INTERVIEW_RECONNECT_EVENT_NAME;
  data: {
    sessionId: string;
    expectedVersion: number;
    deadlineAt: string;
  };
}

export interface ScheduleInterviewReconnectInput {
  sessionId: string;
  expectedVersion: number;
  deadlineAt: Date;
  deliveryId?: string;
}

export interface ScheduleInterviewReconnectDeps {
  send(event: InterviewReconnectEvent): Promise<unknown>;
}

export function buildInterviewReconnectEvent(
  input: ScheduleInterviewReconnectInput
): InterviewReconnectEvent {
  const deadlineAt = input.deadlineAt.toISOString();
  const deliverySuffix = input.deliveryId ? `:${input.deliveryId}` : "";
  return {
    id: `interview-reconnect:${input.sessionId}:${input.expectedVersion}:${deadlineAt}${deliverySuffix}`,
    name: INTERVIEW_RECONNECT_EVENT_NAME,
    data: {
      sessionId: input.sessionId,
      expectedVersion: input.expectedVersion,
      deadlineAt,
    },
  };
}

export async function scheduleInterviewReconnect(
  input: ScheduleInterviewReconnectInput,
  deps: ScheduleInterviewReconnectDeps = {
    send: (event) => inngest.send(event),
  }
): Promise<InterviewReconnectEvent> {
  const event = buildInterviewReconnectEvent(input);
  await deps.send(event);
  return event;
}
