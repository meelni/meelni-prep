import { listUserInterviewEndsToRecover } from "@/lib/db/user-end-recovery";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import {
  buildUserInterviewEndEvent,
  USER_INTERVIEW_END_EVENT_NAME,
} from "@/lib/workflows/accept-user-interview-end";
import { durableUserInterviewEndWorkflow } from "@/lib/workflows/durable-user-interview-end";
import { isLiveKitIntentionallyDisabled } from "@meelni/integrations";

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
    if (isLiveKitIntentionallyDisabled()) {
      return { skipped: "livekit_intentionally_disabled" };
    }

    const env = getLiveKitEnvironment();
    return durableUserInterviewEndWorkflow(
      {
        sessionId: String(event.data.sessionId ?? ""),
        userId: String(event.data.userId ?? ""),
        env: env.ok ? env.data : null,
        resumeFrom:
          event.data.resumeFrom === "feedback_dispatch"
            ? "feedback_dispatch"
            : "runtime_settlement",
      },
      {
        // Every durable checkpoint intentionally returns JSON-only summaries.
        // Inngest types the replayed value as Jsonify<T>; this boundary restores
        // the equivalent workflow type after provider serialization.
        run: (id, work) =>
          step.run(id, work) as unknown as ReturnType<typeof work>,
      }
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
    if (isLiveKitIntentionallyDisabled()) {
      return { scheduled: 0, skipped: "livekit_intentionally_disabled" };
    }

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
