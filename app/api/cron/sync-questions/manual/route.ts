import { createManualQuestionSyncHandler } from "@/lib/question-sync/routes";
import { runQuestionSyncWorkflow } from "@/lib/workflows/sync-question-bank";

export const maxDuration = 300;

/**
 * Manual live sync is an operator action. An authenticated product session is
 * intentionally insufficient; callers must present the separate operator
 * bearer secret.
 */
export const POST = createManualQuestionSyncHandler({
  getSecret: () => process.env.QUESTION_SYNC_OPERATOR_SECRET,
  run: runQuestionSyncWorkflow,
});
