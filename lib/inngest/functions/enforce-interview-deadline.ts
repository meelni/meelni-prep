import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { listInterviewDeadlineSchedules } from "@/lib/db/session-deadlines";
import { inngest } from "@/lib/inngest/client";
import {
  enforceInterviewDeadlineWorkflow,
  quarantineInvalidInterviewSessionWorkflow,
} from "@/lib/workflows/enforce-interview-deadline";
import {
  buildInterviewDeadlineEvent,
  buildInvalidInterviewSessionRecoveryEvent,
  INTERVIEW_DEADLINE_EVENT_NAME,
} from "@/lib/workflows/schedule-interview-deadline";

export const enforceInterviewDeadline = inngest.createFunction(
  {
    id: "interview-deadline-enforce",
    name: "Enforce Interview Deadline",
    retries: 5,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
  },
  { event: INTERVIEW_DEADLINE_EVENT_NAME },
  async ({ event, step }) => {
    const env = getLiveKitEnvironment();
    if (!env.ok) throw new Error(env.error.code);

    if ("recoveryReason" in event.data) {
      return step.run("quarantine-invalid-session-and-close-room", () =>
        quarantineInvalidInterviewSessionWorkflow({
          sessionId: String(event.data.sessionId ?? ""),
          recoveryReason: event.data.recoveryReason,
          env: env.data,
        })
      );
    }

    return step.run("terminalize-and-close-room", () =>
      enforceInterviewDeadlineWorkflow({
        sessionId: String(event.data.sessionId ?? ""),
        deadlineAt: event.data.deadlineAt,
        env: env.data,
      })
    );
  }
);

export const recoverInterviewDeadlines = inngest.createFunction(
  {
    id: "interview-deadline-recovery",
    name: "Recover Interview Deadlines",
    retries: 2,
  },
  { cron: "*/5 * * * *" },
  async ({ event, step }) => {
    const schedules = await step.run("find-open-interview-deadlines", () =>
      listInterviewDeadlineSchedules()
    );
    if (schedules.length > 0) {
      await step.sendEvent(
        "reschedule-open-interview-deadlines",
        schedules.map((schedule) =>
          schedule.kind === "invalid_session"
            ? buildInvalidInterviewSessionRecoveryEvent({
                sessionId: schedule.sessionId,
                deliveryId: `recovery:${event.id}`,
              })
            : buildInterviewDeadlineEvent({
                sessionId: schedule.sessionId,
                deadlineAt: new Date(schedule.deadlineAt),
                deliveryId: `recovery:${event.id}`,
              })
        )
      );
    }
    return { scheduled: schedules.length };
  }
);
