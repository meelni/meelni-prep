import { createScheduledQuestionSyncHandler } from "@/lib/question-sync/routes";
import { runQuestionSyncWorkflow } from "@/lib/workflows/sync-question-bank";

export const maxDuration = 300;

export const GET = createScheduledQuestionSyncHandler({
  getSecret: () => process.env.CRON_SECRET,
  getDatabaseIdentity: () => ({
    databaseUrl: process.env.DATABASE_URL,
    environmentMarker: process.env.MEELNI_ENV_PULL_ENVIRONMENT,
    vercelEnvironment: process.env.VERCEL_ENV,
  }),
  run: runQuestionSyncWorkflow,
});
