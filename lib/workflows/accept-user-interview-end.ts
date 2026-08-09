import {
  acceptUserInterviewEnd,
  type AcceptUserInterviewEndResult,
} from "@/lib/db/accept-user-interview-end";
import { inngest } from "@/lib/inngest/client";

export const USER_INTERVIEW_END_EVENT_NAME = "interview/end.requested" as const;
export const USER_INTERVIEW_END_DISPATCH_TIMEOUT_MS = 750;
export const USER_INTERVIEW_END_REDELIVERY_BUCKET_MS = 60_000;
export type UserInterviewEndResumeFrom =
  | "runtime_settlement"
  | "feedback_dispatch";

export interface AcceptUserInterviewEndDeps {
  accept(input: {
    sessionId: string;
    userId: string;
  }): Promise<AcceptUserInterviewEndResult>;
  schedule(
    event: ReturnType<typeof buildUserInterviewEndEvent>
  ): Promise<unknown>;
  dispatchTimeoutMs?: number;
}

export type AcceptUserInterviewEndWorkflowResult =
  | { ok: false; reason: "not_found" }
  | (Extract<AcceptUserInterviewEndResult, { ok: true }> & {
      delivery: "scheduled" | "deferred" | "not_required";
    });

export function buildUserInterviewEndEvent(
  input: {
    sessionId: string;
    userId: string;
    lifecycleVersion: number;
    resumeFrom?: UserInterviewEndResumeFrom;
  },
  deliveryId = "initial"
) {
  return {
    id: `interview-end:${input.sessionId}:${input.lifecycleVersion}:${deliveryId}`,
    name: USER_INTERVIEW_END_EVENT_NAME,
    data: {
      sessionId: input.sessionId,
      userId: input.userId,
      lifecycleVersion: input.lifecycleVersion,
      resumeFrom: input.resumeFrom ?? "runtime_settlement",
    },
  } as const;
}

export async function acceptUserInterviewEndWorkflow(
  input: { sessionId: string; userId: string; deliveryId?: string },
  deps: AcceptUserInterviewEndDeps = createAcceptUserInterviewEndDeps()
): Promise<AcceptUserInterviewEndWorkflowResult> {
  const accepted = await deps.accept(input);
  if (!accepted.ok) return accepted;
  if (accepted.disposition === "already_terminal") {
    return { ...accepted, delivery: "not_required" };
  }

  const event = buildUserInterviewEndEvent(
    {
      sessionId: accepted.session.sessionId,
      userId: accepted.session.userId,
      lifecycleVersion: accepted.session.lifecycleVersion,
    },
    input.deliveryId ?? "initial"
  );
  const delivery = await settleWithin(
    deps.schedule(event),
    deps.dispatchTimeoutMs ?? USER_INTERVIEW_END_DISPATCH_TIMEOUT_MS
  );
  return { ...accepted, delivery: delivery ? "scheduled" : "deferred" };
}

export function userInterviewEndRedeliveryId(now = new Date()): string {
  const timestamp = Number.isFinite(now.getTime()) ? now.getTime() : 0;
  return `feedback-recovery:${Math.floor(
    timestamp / USER_INTERVIEW_END_REDELIVERY_BUCKET_MS
  )}`;
}

function createAcceptUserInterviewEndDeps(): AcceptUserInterviewEndDeps {
  return {
    accept: acceptUserInterviewEnd,
    schedule: (event) => inngest.send(event),
  };
}

async function settleWithin(
  work: Promise<unknown>,
  timeoutMs: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then(
        () => true,
        () => false
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
