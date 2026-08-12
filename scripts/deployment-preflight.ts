import { RoomServiceClient } from "livekit-server-sdk";
import {
  QUESTION_ROUND_TYPES,
  questionTypeStorageAliasesForRound,
} from "@meelni/core";

import {
  runDeploymentPreflight,
  type DeploymentTarget,
  type LiveKitProjectReader,
  type SupabaseProjectReader,
} from "@/lib/deployment/deployment-preflight";
import { PREVIEW_LIVEKIT_IDENTITY } from "@/lib/deployment/provider-identities";
import { createStripeCatalogReader } from "@/lib/deployment/stripe-catalog-reader";
import { createOpenAiModelReader } from "@/lib/deployment/openai-model-reader";
import { resolveLiveKitDeploymentCapability } from "@meelni/integrations";

export const CANONICAL_VERCEL_DEPLOYMENT_IDENTITY = {
  projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
  repositoryOwner: "meelni",
  repositorySlug: "meelni-prep",
} as const;

void main().catch(() => {
  console.error(
    "Deployment preflight failed because a check could not complete."
  );
  process.exit(1);
});

async function main() {
  const ifDeploy = process.argv.includes("--if-deploy");
  const target = resolveTarget(process.argv.slice(2), process.env, ifDeploy);

  if (!target) {
    if (ifDeploy && process.env.VERCEL !== "1") {
      console.log(
        "Deployment preflight: skipped outside Vercel Preview/Production."
      );
      return;
    }
    console.error(
      ifDeploy
        ? "Deployment preflight could not resolve the Vercel Preview/Production target."
        : "Deployment preflight requires --target=preview or --target=production."
    );
    process.exit(1);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const stripeCatalogReader = stripeSecretKey
    ? createStripeCatalogReader(stripeSecretKey)
    : undefined;
  const liveKitCapability = resolveLiveKitDeploymentCapability(process.env);
  const liveKitProjectReader =
    liveKitCapability.mode === "enabled"
      ? createLiveKitProjectReader(process.env)
      : undefined;
  const openAiModelReader = createOpenAiModelReader(process.env.OPENAI_API_KEY);
  const supabaseProjectReader = createSupabaseProjectReader(process.env);
  const result = await runDeploymentPreflight({
    env: process.env,
    liveKitProjectReader,
    openAiModelReader,
    previewLiveKitIdentity: PREVIEW_LIVEKIT_IDENTITY,
    stripeCatalogReader,
    supabaseProjectReader,
    target,
  });

  console.log(`Deployment preflight target: ${result.target}`);
  for (const check of result.passedChecks) {
    console.log(`PASS ${check}`);
  }
  for (const skipped of result.skippedChecks) {
    console.log(
      `SKIP ${skipped.check} ${skipped.reason} (voice is intentionally disabled in generic Preview)`
    );
  }

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`FAIL ${failure.area}/${failure.code} ${failure.message}`);
    }
    console.error(
      `Deployment preflight failed (${result.failures.length} checks).`
    );
    process.exit(1);
  }

  console.log(
    `Deployment preflight passed (${result.passedChecks.length} checks).`
  );
}

function createSupabaseProjectReader(
  env: Record<string, string | undefined>
): SupabaseProjectReader | undefined {
  const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !anonKey || !serviceRoleKey) return undefined;

  return {
    async verifyAnonKey() {
      await verifySupabaseCredential(
        new URL("/auth/v1/settings", projectUrl),
        anonKey
      );
    },
    async verifyServiceRoleKey() {
      await verifySupabaseCredential(
        new URL("/rest/v1/", projectUrl),
        serviceRoleKey
      );
    },
    async verifyPublishedQuestionBank() {
      await Promise.all(
        QUESTION_ROUND_TYPES.map(async (roundType) => {
          const url = new URL("/rest/v1/interview_question", projectUrl);
          url.searchParams.set("select", "id");
          url.searchParams.set("is_active", "eq.true");
          url.searchParams.set("quality_status", "eq.published");
          url.searchParams.set(
            "question_type",
            `in.(${questionTypeStorageAliasesForRound(roundType)
              .map(quotePostgrestValue)
              .join(",")})`
          );
          url.searchParams.set("limit", "1");

          const response = await fetch(url, {
            headers: {
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`,
            },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error("Question bank verification failed");
          }
          const rows = (await response.json()) as unknown;
          if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("Published question round is empty");
          }
        })
      );
    },
  };
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function verifySupabaseCredential(url: URL, credential: string) {
  const response = await fetch(url, {
    headers: {
      apikey: credential,
      authorization: `Bearer ${credential}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Supabase credential verification failed");
}

function createLiveKitProjectReader(
  env: Record<string, string | undefined>
): LiveKitProjectReader | undefined {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return undefined;

  const client = new RoomServiceClient(
    url.replace(/^wss:/, "https:"),
    apiKey,
    apiSecret
  );
  return {
    async verifyProjectAccess() {
      await client.listRooms(["__meelni_deploy_preflight_nonexistent__"]);
    },
  };
}

function resolveTarget(
  args: string[],
  env: Record<string, string | undefined>,
  requireVercelIdentity: boolean
): DeploymentTarget | undefined {
  if (
    requireVercelIdentity &&
    env.VERCEL === "1" &&
    !isCanonicalVercelDeployment(env)
  ) {
    return undefined;
  }
  const explicit = args
    .find((argument) => argument.startsWith("--target="))
    ?.slice("--target=".length);
  if (
    explicit &&
    env.VERCEL === "1" &&
    (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production") &&
    explicit !== env.VERCEL_ENV
  ) {
    return undefined;
  }
  const candidate =
    explicit ?? (env.VERCEL === "1" ? env.VERCEL_ENV : undefined);
  return candidate === "preview" || candidate === "production"
    ? candidate
    : undefined;
}

function isCanonicalVercelDeployment(
  env: Record<string, string | undefined>
): boolean {
  return (
    env.VERCEL_PROJECT_ID === CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.projectId &&
    env.VERCEL_GIT_REPO_OWNER ===
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositoryOwner &&
    env.VERCEL_GIT_REPO_SLUG ===
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositorySlug
  );
}
