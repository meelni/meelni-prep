import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveProductionWebShadowCanaryAccess } from "@/lib/interview/production-shadow-canary-access";

import { ProductionShadowCanaryClient } from "./production-shadow-canary-client";

export const dynamic = "force-dynamic";

export default async function ProductionShadowCanaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const access = resolveProductionWebShadowCanaryAccess(
    process.env,
    error ? null : user?.id
  );
  if (!access.allowed) notFound();

  return (
    <ProductionShadowCanaryClient
      expectedRunId={access.runId}
      expectedCandidateGitSha={access.candidateGitSha}
    />
  );
}
