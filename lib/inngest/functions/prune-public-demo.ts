import { prunePublicDemoAbuseData } from "@/lib/db/demo-rate-limits";
import { inngest } from "@/lib/inngest/client";

export const prunePublicDemo = inngest.createFunction(
  {
    id: "prune-public-demo-abuse-data",
    name: "Prune public voice preview abuse data",
    retries: 3,
  },
  { cron: "17 * * * *" },
  async ({ step }) =>
    step.run("prune-expired-pseudonymous-identifiers", () =>
      prunePublicDemoAbuseData()
    )
);
