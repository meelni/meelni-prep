import { listInterviewStartRecoveryCandidates } from "@/lib/db/interview-start-recovery";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { recoverInterviewStartWorkflow } from "@/lib/workflows/recover-interview-start";
import { reportOperationalFailure } from "@/lib/operations/operational-events";

export const recoverInterviewStarts = inngest.createFunction(
  {
    id: "interview-start-recovery",
    name: "Recover Stale Interview Starts",
    retries: 2,
    concurrency: [{ limit: 1 }],
    onFailure: async () => {
      reportOperationalFailure({
        operation: "interview_recovery",
        errorCode: "interview_start_recovery_failed",
        severity: "critical",
        retryable: true,
      });
    },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const candidates = await step.run("find-stale-interview-starts", () =>
      listInterviewStartRecoveryCandidates()
    );
    const livekit = getLiveKitEnvironment();
    const env = livekit.ok ? livekit.data : null;
    const results = [];

    for (const candidate of candidates) {
      results.push(
        await step.run(`recover-interview-start-${candidate.sessionId}`, () =>
          recoverInterviewStartWorkflow({
            sessionId: candidate.sessionId,
            env,
          })
        )
      );
    }

    return {
      attempted: candidates.length,
      cleanupEnvironmentAvailable: env !== null,
      results,
    };
  }
);
