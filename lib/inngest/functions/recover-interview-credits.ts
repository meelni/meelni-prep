import {
  INTERVIEW_CREDIT_RECOVERY_LIMIT,
  listInterviewCreditRecoveryCandidates,
} from "@/lib/db/interview-credit-recovery";
import { inngest } from "@/lib/inngest/client";
import {
  recoverInterviewCreditCandidates,
  recoverInterviewCreditWorkflow,
} from "@/lib/workflows/recover-interview-credit";

export const recoverInterviewCredits = inngest.createFunction(
  {
    id: "interview-credit-recovery",
    name: "Recover Interview Credits",
    retries: 2,
    concurrency: [{ limit: 1 }],
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const candidates = await step.run("find-interview-credit-recovery", () =>
      listInterviewCreditRecoveryCandidates(
        new Date(),
        INTERVIEW_CREDIT_RECOVERY_LIMIT
      )
    );
    const results = await recoverInterviewCreditCandidates(
      candidates,
      (sessionId) =>
        step.run(`recover-interview-credit-${sessionId}`, () =>
          recoverInterviewCreditWorkflow(sessionId)
        )
    );
    return {
      attempted: candidates.length,
      limit: INTERVIEW_CREDIT_RECOVERY_LIMIT,
      results,
    };
  }
);
