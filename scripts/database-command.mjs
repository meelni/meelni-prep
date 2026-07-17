import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import {
  canonicalEnvironmentForEnvFile,
  getSupabaseEnvironmentIdentityPolicy,
} from "./supabase-environment-guard.mjs";
import {
  canonicalJson,
  consumeProductionActionAuthorization,
  PRODUCTION_ACTIONS,
  sha256,
} from "../lib/operations/production-action-authorization.mjs";

export function getDatabaseCommandPolicy({
  command,
  databaseUrl,
  envFile,
  allowRemoteMigration = false,
  allowRemoteStudio = false,
  environment,
  expectedEnvironment,
  productionProjectRef,
  vercelEnvironment,
}) {
  if (!databaseUrl) {
    return { allowed: false, reason: "DATABASE_URL is not configured" };
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { allowed: false, reason: "DATABASE_URL is invalid" };
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  // Supabase uses port 5432 for direct/session connections, including hosts
  // whose names contain "pooler". Port 6543 is the transaction pooler.
  const transactionPooler = parsed.port === "6543";

  if (command === "push" && !local) {
    return {
      allowed: false,
      reason:
        "db:push is forbidden for shared Preview and Production databases",
    };
  }
  if (command === "migrate" && transactionPooler) {
    return {
      allowed: false,
      reason: "Migrations require a direct or session database connection",
    };
  }
  if (command === "migrate" && !local) {
    if (!envFile || !allowRemoteMigration) {
      return {
        allowed: false,
        reason:
          "Remote migration requires explicit MEELNI_ENV_FILE and MEELNI_ALLOW_REMOTE_MIGRATION=1",
      };
    }
  }
  if (command === "studio" && !local && !allowRemoteStudio) {
    return {
      allowed: false,
      reason: "Remote Studio requires MEELNI_ALLOW_REMOTE_STUDIO=1",
    };
  }

  if (!local) {
    const identityPolicy = getSupabaseEnvironmentIdentityPolicy({
      databaseUrl,
      environment,
      expectedEnvironment,
      productionProjectRef,
      vercelEnvironment,
    });
    if (
      command === "studio" &&
      identityPolicy.allowed &&
      identityPolicy.reason === "verified_production"
    ) {
      return {
        allowed: false,
        reason:
          "Production Studio is forbidden; use an audited maintenance workflow",
      };
    }
    return identityPolicy;
  }

  return { allowed: true, reason: "local" };
}

export async function runDatabaseCommand({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  authorizeProductionAction = consumeProductionActionAuthorization,
  productionConfigurationSha256 = databaseMigrationConfigurationSha256,
  spawn = spawnSync,
} = {}) {
  const command = argv[0];
  if (!command || !["migrate", "push", "studio"].includes(command)) {
    throw new Error("Expected migrate, push, or studio database command");
  }

  const explicitEnvFile = env.MEELNI_ENV_FILE;
  const allowRemoteMigration = env.MEELNI_ALLOW_REMOTE_MIGRATION === "1";
  const allowRemoteStudio = env.MEELNI_ALLOW_REMOTE_STUDIO === "1";
  const envFile = explicitEnvFile || ".env.local";
  // An explicitly selected environment must win over inherited shell state;
  // otherwise a Production command could silently target Preview (or reverse).
  const loaded = config({
    path: resolve(cwd, envFile),
    override: Boolean(explicitEnvFile),
    processEnv: env,
    quiet: true,
  });
  if (explicitEnvFile) {
    if (loaded.error) {
      throw new Error(
        `Could not load explicitly selected env file: ${envFile}`
      );
    }
    const selectedDatabaseUrl = loaded.parsed?.DATABASE_URL;
    if (!selectedDatabaseUrl) {
      throw new Error(`Selected env file has no DATABASE_URL: ${envFile}`);
    }
    env.DATABASE_URL = selectedDatabaseUrl;
  }

  const policy = getDatabaseCommandPolicy({
    command,
    databaseUrl: env.DATABASE_URL,
    envFile: explicitEnvFile,
    allowRemoteMigration,
    allowRemoteStudio,
    environment: explicitEnvFile
      ? loaded.parsed?.MEELNI_ENV_PULL_ENVIRONMENT
      : env.MEELNI_ENV_PULL_ENVIRONMENT,
    expectedEnvironment: explicitEnvFile
      ? canonicalEnvironmentForEnvFile(explicitEnvFile, cwd)
      : undefined,
    productionProjectRef: explicitEnvFile
      ? loaded.parsed?.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF
      : env.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF,
    vercelEnvironment: explicitEnvFile
      ? loaded.parsed?.VERCEL_ENV
      : env.VERCEL_ENV,
  });
  if (!policy.allowed) throw new Error(policy.reason);

  if (command === "migrate" && policy.reason === "verified_production") {
    await authorizeProductionAction({
      authorizationPath: env.MEELNI_PRODUCTION_ACTION_AUTHORIZATION,
      repoRoot: cwd,
      expected: {
        action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
        provider: "supabase",
        configurationSha256: productionConfigurationSha256(cwd),
        targetFingerprint: databaseTargetSha256(env.DATABASE_URL),
      },
    });
  }

  console.info(`Database environment identity: ${policy.reason}`);
  console.info(
    `Database target fingerprint: ${databaseTargetFingerprint(env.DATABASE_URL)}`
  );

  const result = spawn("npx", ["drizzle-kit", command], {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function databaseTargetFingerprint(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const target = `${parsed.username}@${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  return createHash("sha256").update(target).digest("hex").slice(0, 12);
}

export function databaseTargetSha256(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const target = `${parsed.username}@${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  return sha256(`postgresql-target:${target}`);
}

export function databaseMigrationConfigurationSha256(repoRoot = process.cwd()) {
  const migrationRoot = resolve(repoRoot, "lib/db/migrations");
  const files = collectMigrationFiles(migrationRoot).map((path) => ({
    path: relative(repoRoot, path),
    sha256: sha256(readFileSync(path)),
  }));
  return sha256(
    canonicalJson({
      drizzleConfigSha256: sha256(
        readFileSync(resolve(repoRoot, "drizzle.config.ts"))
      ),
      files,
    })
  );
}

function collectMigrationFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = resolve(directory, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      throw new Error("Migration configuration cannot contain symlinks");
    }
    if (stats.isDirectory()) {
      files.push(...collectMigrationFiles(path));
    } else if (
      stats.isFile() &&
      (path.endsWith(".sql") || path.endsWith("/_journal.json"))
    ) {
      files.push(path);
    }
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDatabaseCommand()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Database command failed"
      );
      process.exitCode = 1;
    });
}
