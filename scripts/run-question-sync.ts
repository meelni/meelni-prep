import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { config } from "dotenv";

export interface ProductionActionAuthorizationInput {
  authorizationPath: string | undefined;
  expected: {
    action: string;
    provider: string;
    configurationSha256: string;
    targetFingerprint: string;
  };
}

type ProductionActionAuthorization = (
  input: ProductionActionAuthorizationInput
) => Promise<unknown>;

export async function main(): Promise<void> {
  const explicitEnvFile = process.env.MEELNI_ENV_FILE;
  const envFile = explicitEnvFile || ".env.local";
  const loaded = config({
    path: envFile,
    override: Boolean(explicitEnvFile),
    quiet: true,
  });
  if (explicitEnvFile && loaded.error) {
    throw new Error("question_sync_environment_file_unavailable");
  }

  const args = process.argv.slice(2);
  const unsupported = args.filter((argument) => argument !== "--dry-run");
  if (unsupported.length > 0) {
    console.error("Question sync accepts only the optional --dry-run flag.");
    process.exitCode = 2;
    return;
  }

  await authorizeProductionQuestionSync({
    dryRun: args.includes("--dry-run"),
    env: process.env,
  });

  const { runQuestionSyncWorkflow } = await import(
    "@/lib/workflows/sync-question-bank"
  );
  const result = await runQuestionSyncWorkflow({
    trigger: "cli",
    dryRun: args.includes("--dry-run"),
  });

  process.exitCode = result.status === "completed" ? 0 : 1;
}

export async function authorizeProductionQuestionSync({
  dryRun,
  env,
  authorize,
}: {
  dryRun: boolean;
  env: Record<string, string | undefined>;
  authorize?: ProductionActionAuthorization;
}): Promise<"not-required" | "authorized"> {
  const marker = env.MEELNI_ENV_PULL_ENVIRONMENT;
  const vercelEnvironment = env.VERCEL_ENV;
  if (marker && marker !== "preview" && marker !== "production") {
    throw new Error("question_sync_environment_invalid");
  }
  if (
    vercelEnvironment &&
    !["development", "preview", "production"].includes(vercelEnvironment)
  ) {
    throw new Error("question_sync_environment_invalid");
  }
  if (marker && vercelEnvironment && marker !== vercelEnvironment) {
    throw new Error("question_sync_environment_conflict");
  }

  const environment = marker ?? vercelEnvironment ?? "development";
  if (dryRun || environment !== "production") return "not-required";

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("question_sync_database_target_missing");
  let databaseTarget: string;
  try {
    const parsed = new URL(databaseUrl);
    databaseTarget = `${parsed.username}@${parsed.hostname}:${
      parsed.port || "5432"
    }${parsed.pathname}`;
  } catch {
    throw new Error("question_sync_database_target_invalid");
  }

  const sourceMaterial = JSON.stringify({
    csvUrl: env.GOOGLE_SHEET_CSV_URL ?? null,
    sheetId: env.GOOGLE_SHEET_ID ?? null,
    sheetName: env.GOOGLE_SHEET_NAME ?? null,
  });
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const authorizeProductionAction =
    authorize ??
    ((await import("../lib/operations/production-action-authorization.mjs"))
      .consumeProductionActionAuthorization as ProductionActionAuthorization);

  await authorizeProductionAction({
    authorizationPath: env.MEELNI_PRODUCTION_ACTION_AUTHORIZATION,
    expected: {
      action: "production-question-sync-manual",
      provider: "google-sheets",
      configurationSha256: digest(
        JSON.stringify({
          sourceSha256: digest(sourceMaterial),
          trigger: "cli",
          workflow: "locked-question-bank-sync-v1",
        })
      ),
      targetFingerprint: digest(
        `question-sync:${databaseTarget}:${digest(sourceMaterial)}`
      ),
    },
  });
  return "authorized";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error("Question sync could not be completed.");
    process.exitCode = 1;
  });
}
