export function assertNonProductionScriptEnvironment(
  env: Record<string, string | undefined> = process.env
): void {
  const marker = env.MEELNI_ENV_PULL_ENVIRONMENT;
  const vercelEnvironment = env.VERCEL_ENV;
  if (marker === "production" || vercelEnvironment === "production") {
    throw new Error("legacy_script_production_target_denied");
  }
  if (marker && marker !== "preview") {
    throw new Error("legacy_script_environment_invalid");
  }
  if (
    vercelEnvironment &&
    !["development", "preview"].includes(vercelEnvironment)
  ) {
    throw new Error("legacy_script_environment_invalid");
  }
  if (marker && vercelEnvironment && marker !== vercelEnvironment) {
    throw new Error("legacy_script_environment_conflict");
  }

  if (!env.DATABASE_URL) return;
  let target: URL;
  try {
    target = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("legacy_script_database_target_invalid");
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) return;

  const productionRef = env.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF;
  if (
    productionRef &&
    (target.hostname.includes(productionRef) ||
      target.username.includes(productionRef))
  ) {
    throw new Error("legacy_script_production_target_denied");
  }
  if ((marker ?? vercelEnvironment) !== "preview") {
    throw new Error("legacy_script_shared_target_requires_preview_identity");
  }
}

// This module is imported before any database adapter in legacy scripts, so
// the ambient process is denied before provider initialization.
assertNonProductionScriptEnvironment();
