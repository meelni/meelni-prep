import { createScheduledQuestionSyncHandler } from "@/lib/question-sync/routes";
import { runQuestionSyncWorkflow } from "@/lib/workflows/sync-question-bank";

export const maxDuration = 300;

export const GET = createScheduledQuestionSyncHandler({
  getSecret: () => process.env.CRON_SECRET,
  run: runQuestionSyncWorkflow,
});
