import {
  createDrizzleInterviewCreditRecoveryStore,
  type InterviewCreditRecoveryStore,
} from "@/lib/db/interview-credit-recovery";

export interface RecoverInterviewCreditDeps {
  store: InterviewCreditRecoveryStore;
  now(): Date;
}
export async function recoverInterviewCreditWorkflow(
  sessionId: string,
  deps: RecoverInterviewCreditDeps = createRecoverInterviewCreditDeps()
): Promise<
  | { disposition: "no_longer_recoverable" }
  | { disposition: "recovered"; creditDisposition: string }
> {
  const prepared = await deps.store.prepare({ sessionId, now: deps.now() });
  if (prepared.disposition === "no_longer_recoverable") {
    return { disposition: "no_longer_recoverable" };
  }
  return prepared;
}

function createRecoverInterviewCreditDeps(): RecoverInterviewCreditDeps {
  return {
    store: createDrizzleInterviewCreditRecoveryStore(),
    now: () => new Date(),
  };
}

export async function recoverInterviewCreditCandidates(
  candidates: Array<{ sessionId: string }>,
  recover: (sessionId: string) => Promise<unknown>
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const candidate of candidates) {
    try {
      results.push(await recover(candidate.sessionId));
    } catch {
      results.push({
        disposition: "failed",
        sessionId: candidate.sessionId,
        errorCode: "interview_credit_recovery_failed",
      });
    }
  }
  return results;
}
