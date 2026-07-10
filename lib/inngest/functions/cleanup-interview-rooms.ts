import { listInterviewRoomCleanupSessions } from "@/lib/db/session-reconnects";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { cleanupInterviewRoomWorkflow } from "@/lib/workflows/cleanup-interview-room";

export const recoverInterviewRoomCleanup = inngest.createFunction(
  {
    id: "interview-room-cleanup-recovery",
    name: "Recover Terminal Interview Room Cleanup",
    retries: 2,
    concurrency: [{ limit: 1 }],
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const env = getLiveKitEnvironment();
    if (!env.ok) throw new Error(env.error.code);

    const sessions = await step.run("find-terminal-rooms-to-clean", () =>
      listInterviewRoomCleanupSessions()
    );
    const results = [];
    for (const session of sessions) {
      results.push(
        await step.run(`clean-terminal-room-${session.sessionId}`, async () => {
          try {
            return await cleanupInterviewRoomWorkflow({
              sessionId: session.sessionId,
              env: env.data,
            });
          } catch (error) {
            return {
              ok: false as const,
              disposition: "provider_retry_pending" as const,
              code:
                error && typeof error === "object" && "code" in error
                  ? String(error.code)
                  : "livekit_room_cleanup_failed",
            };
          }
        })
      );
    }
    return { attempted: sessions.length, results };
  }
);
