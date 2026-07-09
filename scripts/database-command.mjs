import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

export function getDatabaseCommandPolicy({
  command,
  databaseUrl,
  envFile,
  allowRemoteMigration = false,
  allowRemoteStudio = false,
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

  return { allowed: true, reason: local ? "local" : "explicit_remote" };
}

function main() {
  const command = process.argv[2];
  if (!command || !["migrate", "push", "studio"].includes(command)) {
    throw new Error("Expected migrate, push, or studio database command");
  }

  const explicitEnvFile = process.env.MEELNI_ENV_FILE;
  const envFile = explicitEnvFile || ".env.local";
  // An explicitly selected environment must win over inherited shell state;
  // otherwise a Production command could silently target Preview (or reverse).
  const loaded = config({
    path: resolve(process.cwd(), envFile),
    override: Boolean(explicitEnvFile),
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
    process.env.DATABASE_URL = selectedDatabaseUrl;
  }

  const policy = getDatabaseCommandPolicy({
    command,
    databaseUrl: process.env.DATABASE_URL,
    envFile: explicitEnvFile,
    allowRemoteMigration: process.env.MEELNI_ALLOW_REMOTE_MIGRATION === "1",
    allowRemoteStudio: process.env.MEELNI_ALLOW_REMOTE_STUDIO === "1",
  });
  if (!policy.allowed) throw new Error(policy.reason);

  console.info(
    `Database target fingerprint: ${databaseTargetFingerprint(process.env.DATABASE_URL)}`
  );

  const result = spawnSync("npx", ["drizzle-kit", command], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

export function databaseTargetFingerprint(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const target = `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  return createHash("sha256").update(target).digest("hex").slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Database command failed"
    );
    process.exit(1);
  }
}
