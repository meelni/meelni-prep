import { config } from "dotenv";

async function main(): Promise<void> {
  const envFile = process.env.MEELNI_ENV_FILE || ".env.local";
  config({ path: envFile, quiet: true });

  const args = process.argv.slice(2);
  const unsupported = args.filter((argument) => argument !== "--dry-run");
  if (unsupported.length > 0) {
    console.error("Question sync accepts only the optional --dry-run flag.");
    process.exitCode = 2;
    return;
  }

  const { runQuestionSyncWorkflow } = await import(
    "@/lib/workflows/sync-question-bank"
  );
  const result = await runQuestionSyncWorkflow({
    trigger: "cli",
    dryRun: args.includes("--dry-run"),
  });

  process.exitCode = result.status === "completed" ? 0 : 1;
}

main().catch(() => {
  console.error("Question sync could not be completed.");
  process.exitCode = 1;
});
