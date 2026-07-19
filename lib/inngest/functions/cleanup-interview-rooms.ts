import { listInterviewRoomCleanupSessions } from "@/lib/db/session-reconnects";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { cleanupInterviewRoomWorkflow } from "@/lib/workflows/cleanup-interview-room";
import { reportOperationalFailure } from "@/lib/operations/operational-events";

export const INTERVIEW_ROOM_CLEANUP_EVENT_NAME =
  "interview/room.cleanup.requested" as const;

export function buildInterviewRoomCleanupEvents(
  sessions: Array<{ sessionId: string }>,
  deliveryId: string
) {
  return sessions.map((session) => ({
    id: `interview-room-cleanup:${session.sessionId}:${deliveryId}`,
    name: INTERVIEW_ROOM_CLEANUP_EVENT_NAME,
    data: { sessionId: session.sessionId },
  }));
}

export const cleanupInterviewRoom = inngest.createFunction(
  {
    id: "interview-room-cleanup",
    name: "Clean Terminal Interview Room",
    retries: 5,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_room_cleanup_failed",
        severity: "critical",
        retryable: false,
      });
    },
  },
  { event: INTERVIEW_ROOM_CLEANUP_EVENT_NAME },
  async ({ event, step }) => {
    const env = getLiveKitEnvironment();
    if (!env.ok) throw new Error(env.error.code);

    return step.run("revoke-candidate-and-delete-room", () =>
      cleanupInterviewRoomWorkflow({
        sessionId: String(event.data.sessionId ?? ""),
        env: env.data,
      })
    );
  }
);

export const recoverInterviewRoomCleanup = inngest.createFunction(
  {
    id: "interview-room-cleanup-recovery",
    name: "Recover Terminal Interview Room Cleanup",
    retries: 2,
    concurrency: [{ limit: 1 }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_room_cleanup_failed",
        severity: "critical",
        retryable: true,
      });
    },
  },
  { cron: "*/5 * * * *" },
  async ({ event, step }) => {
    const sessions = await step.run("find-terminal-rooms-to-clean", () =>
      listInterviewRoomCleanupSessions()
    );
    if (sessions.length > 0) {
      await step.sendEvent(
        "fan-out-terminal-room-cleanup",
        buildInterviewRoomCleanupEvents(
          sessions,
          String(event.id ?? "recovery")
        )
      );
    }
    return { scheduled: sessions.length };
  }
);
