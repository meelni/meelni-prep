import { listUserInterviewEndsToRecover } from "@/lib/db/user-end-recovery";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { endUserInterviewSessionWorkflow } from "@/lib/workflows/end-user-interview-session";
import {
  buildUserInterviewEndEvent,
  USER_INTERVIEW_END_EVENT_NAME,
} from "@/lib/workflows/accept-user-interview-end";

export const finalizeUserInterviewEnd = inngest.createFunction(
  {
    id: "interview-user-end-finalize",
    name: "Finalize User-Ended Interview",
    retries: 4,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_end_finalization_failed",
        severity: "critical",
        retryable: true,
      });
    },
  },
  { event: USER_INTERVIEW_END_EVENT_NAME },
  async ({ event, step }) => {
    const env = getLiveKitEnvironment();
    return step.run("settle-finalize-and-dispatch", () =>
      endUserInterviewSessionWorkflow({
        sessionId: String(event.data.sessionId ?? ""),
        userId: String(event.data.userId ?? ""),
        env: env.ok ? env.data : null,
      })
    );
  }
);

export const recoverUserInterviewEnds = inngest.createFunction(
  {
    id: "interview-user-end-recovery",
    name: "Recover User-Ended Interviews",
    retries: 2,
    concurrency: [{ limit: 1 }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_end_finalization_failed",
        severity: "critical",
        retryable: true,
      });
    },
  },
  { cron: "* * * * *" },
  async ({ event, step }) => {
    const sessions = await step.run("find-user-ends-to-recover", () =>
      listUserInterviewEndsToRecover()
    );
    if (sessions.length > 0) {
      await step.sendEvent(
        "fan-out-user-end-finalization",
        sessions.map((session) =>
          buildUserInterviewEndEvent(
            session,
            `recovery:${String(event.id ?? "scheduled")}`
          )
        )
      );
    }
    return { scheduled: sessions.length };
  }
);
