import { inferDatabaseProjectRef } from "./supabase-project-ref.mjs";

export const PRODUCTION_SUPABASE_PROJECT_REF_ENV =
  "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF";

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHARED_ENVIRONMENTS = new Set(["preview", "production"]);

export function getSupabaseEnvironmentIdentityPolicy({
  databaseUrl,
  environment,
  productionProjectRef,
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
