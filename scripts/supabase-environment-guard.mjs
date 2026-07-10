import { resolve } from "node:path";

import { inferDatabaseProjectRef } from "./supabase-project-ref.mjs";

export const PRODUCTION_SUPABASE_PROJECT_REF_ENV =
  "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF";

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHARED_ENVIRONMENTS = new Set(["preview", "production"]);

export function getSupabaseEnvironmentIdentityPolicy({
  databaseUrl,
  environment,
  expectedEnvironment,
  productionProjectRef,
  vercelEnvironment,
}) {
  if (!databaseUrl) {
    return denied("DATABASE_URL is not configured");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return denied("DATABASE_URL is invalid");
  }

  if (isLoopbackHostname(parsed.hostname)) {
    return {
      allowed: true,
      environmentIdentity: "local",
      local: true,
      reason: "local",
    };
  }

  if (!SHARED_ENVIRONMENTS.has(environment)) {
    return denied(
      "Remote database access requires MEELNI_ENV_PULL_ENVIRONMENT=preview or production"
    );
  }

  if (!SHARED_ENVIRONMENTS.has(expectedEnvironment)) {
    return denied(
      "Remote database access requires a canonical Preview or Production env file"
    );
  }

  if (environment !== expectedEnvironment) {
    return denied(
      `Environment marker ${environment} does not match expected ${expectedEnvironment}`
    );
  }

  if (vercelEnvironment && vercelEnvironment !== environment) {
    return denied(
      `VERCEL_ENV=${vercelEnvironment} does not match MEELNI_ENV_PULL_ENVIRONMENT=${environment}`
    );
  }

  const declaredProductionRef = productionProjectRef?.trim();
  if (!SUPABASE_PROJECT_REF_PATTERN.test(declaredProductionRef ?? "")) {
    return denied(
      `${PRODUCTION_SUPABASE_PROJECT_REF_ENV} must be a 20-character lowercase Supabase project ref`
    );
  }

  const databaseProjectRef = inferDatabaseProjectRef(databaseUrl);
  if (!databaseProjectRef) {
    return denied(
      "Could not infer a Supabase project ref from the remote DATABASE_URL"
    );
  }

  if (
    environment === "preview" &&
    databaseProjectRef === declaredProductionRef
  ) {
    return denied(
      "Preview database target matches the declared Production Supabase project"
    );
  }

  if (
    environment === "production" &&
    databaseProjectRef !== declaredProductionRef
  ) {
    return denied(
      "Production database target does not match the declared Production Supabase project"
    );
  }

  return {
    allowed: true,
    databaseProjectRef,
    environmentIdentity: environment,
    local: false,
    reason: `verified_${environment}`,
  };
}

export function canonicalEnvironmentForEnvFile(envFile, root = process.cwd()) {
  if (!envFile) return undefined;

  const selected = resolve(root, envFile);
  if (selected === resolve(root, ".env.local")) return "preview";
  if (selected === resolve(root, ".env.production.local")) {
    return "production";
  }
  return undefined;
}

export function isLoopbackDatabaseUrl(databaseUrl) {
  try {
    return isLoopbackHostname(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function denied(reason) {
  return {
    allowed: false,
    environmentIdentity: undefined,
    local: false,
    reason,
  };
}
