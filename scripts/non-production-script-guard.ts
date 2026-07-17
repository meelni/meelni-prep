import { getSupabaseEnvironmentIdentityPolicy } from "./supabase-environment-guard.mjs";

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

  const environment = marker ?? vercelEnvironment;
  const identityPolicy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: env.DATABASE_URL,
    environment,
    expectedEnvironment: environment,
    productionProjectRef: env.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF,
    vercelEnvironment,
  });
  if (
    !identityPolicy.allowed ||
    identityPolicy.environmentIdentity !== "preview"
  ) {
    throw new Error("legacy_script_database_identity_denied");
  }
}

// This module is imported before any database adapter in legacy scripts, so
// the ambient process is denied before provider initialization.
assertNonProductionScriptEnvironment();
