import { cleanupStaleContactRateLimits } from "@/lib/db/contact-submissions";
import { inngest } from "@/lib/inngest/client";
import { cleanupContactRateLimits } from "@/lib/workflows/cleanup-contact-rate-limits";

export const cleanupContactSubmissionRateLimits = inngest.createFunction(
  {
    id: "contact-submission-rate-limit-cleanup",
    name: "Clean Up Contact Submission Rate Limits",
    retries: 2,
    concurrency: [{ limit: 1 }],
  },
  { cron: "17 * * * *" },
  async ({ step }) =>
    cleanupContactRateLimits((batchSize, batchIndex) =>
      step.run(`cleanup-batch-${batchIndex + 1}`, () =>
        cleanupStaleContactRateLimits(batchSize)
      )
    )
);
