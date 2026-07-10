import {
  createDrizzleInterviewCreditRecoveryStore,
  type InterviewCreditRecoveryStore,
} from "@/lib/db/interview-credit-recovery";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";

export interface RecoverInterviewCreditDeps {
  store: InterviewCreditRecoveryStore;
  settleCredit(sessionId: string): Promise<{ disposition: string }>;
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
  if (prepared === "no_longer_recoverable") {
    return { disposition: "no_longer_recoverable" };
  }
  const credit = await deps.settleCredit(sessionId);
  return { disposition: "recovered", creditDisposition: credit.disposition };
}

function createRecoverInterviewCreditDeps(): RecoverInterviewCreditDeps {
  return {
    store: createDrizzleInterviewCreditRecoveryStore(),
    settleCredit: convergeDrizzleInterviewCreditSettlement,
    now: () => new Date(),
  };
}
