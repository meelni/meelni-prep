import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { listInterviewReconnectSchedules } from "@/lib/db/session-reconnects";
import { inngest } from "@/lib/inngest/client";
import { enforceInterviewReconnectWorkflow } from "@/lib/workflows/enforce-interview-reconnect";
import {
  buildInterviewReconnectEvent,
  INTERVIEW_RECONNECT_EVENT_NAME,
} from "@/lib/workflows/schedule-interview-reconnect";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { isLiveKitIntentionallyDisabled } from "@meelni/integrations";

export const enforceInterviewReconnect = inngest.createFunction(
  {
    id: "interview-reconnect-enforce",
    name: "Enforce Interview Reconnect Grace",
    retries: 5,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_reconnect_enforcement_failed",
        severity: "critical",
        retryable: false,
      });
    },
  },
  { event: INTERVIEW_RECONNECT_EVENT_NAME },
  async ({ event, step }) => {
    if (isLiveKitIntentionallyDisabled()) {
      return { skipped: "livekit_intentionally_disabled" };
    }

    const deadlineAt = String(event.data.deadlineAt ?? "");
    await step.sleepUntil("wait-for-reconnect-deadline", deadlineAt);

    const env = getLiveKitEnvironment();
    if (!env.ok) throw new Error(env.error.code);

    return step.run("claim-timeout-close-room-and-settle", () =>
      enforceInterviewReconnectWorkflow({
        sessionId: String(event.data.sessionId ?? ""),
        expectedVersion: Number(event.data.expectedVersion),
        deadlineAt,
        env: env.data,
      })
    );
  }
);

export const recoverInterviewReconnects = inngest.createFunction(
  {
    id: "interview-reconnect-recovery",
    name: "Recover Interview Reconnect Schedules",
    retries: 2,
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_reconnect_enforcement_failed",
        severity: "critical",
        retryable: true,
      });
    },
  },
  { cron: "*/5 * * * *" },
  async ({ event, step }) => {
    if (isLiveKitIntentionallyDisabled()) {
      return { scheduled: 0, skipped: "livekit_intentionally_disabled" };
    }

    const schedules = await step.run("find-open-reconnect-deadlines", () =>
      listInterviewReconnectSchedules()
    );
    if (schedules.length > 0) {
      await step.sendEvent(
        "reschedule-open-reconnect-deadlines",
        schedules.map((schedule) =>
          buildInterviewReconnectEvent({
            sessionId: schedule.sessionId,
            expectedVersion: schedule.expectedVersion,
            deadlineAt: new Date(schedule.deadlineAt),
            deliveryId: `recovery:${event.id}`,
          })
        )
      );
    }
    return { scheduled: schedules.length };
  }
);
