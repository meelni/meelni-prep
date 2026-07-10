import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readEnvFile } from "./local-env.mjs";
import {
  inferDatabaseProjectRef,
  inferSupabaseProjectRef,
} from "./supabase-project-ref.mjs";

export {
  inferDatabaseProjectRef,
  inferSupabaseProjectRef,
} from "./supabase-project-ref.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredSupabaseEnv = [
  ["DATABASE_URL", "Database URL"],
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"],
];

const requiredTables = [
  "app_user",
  "interview_session",
  "feedback",
  "transcript_turn",
  "user_settings",
  "user_insights",
  "interview_question",
  "session_question",
  "subscription",
  "usage_record",
  "payment_history",
  "stripe_event_log",
  "stripe_customer_mapping",
];

const migrationFiles = [
  "lib/db/migrations/0000_many_nocturne.sql",
  "lib/db/migrations/0001_panoramic_otto_octavius.sql",
  "lib/db/migrations/0002_pricing_rls_policies.sql",
  "supabase/migrations/apply_all_rls.sql",
];

export function checkRequiredSupabaseEnv(values) {
  return requiredSupabaseEnv.map(([key, name]) => {
    const value = getEnvValue(values, key);

    if (!value) {
      return fail(name, `${key} is missing or empty in .env.local.`);
    }

    if (key === "NEXT_PUBLIC_SUPABASE_URL" && !inferSupabaseProjectRef(value)) {
      return fail(
        name,
        `${key} must look like https://<project-ref>.supabase.co.`
      );
    }

    if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && !looksLikeJwt(value)) {
      return warn(
        name,
        `${key} is present but does not look like a Supabase JWT anon key.`
      );
    }

    if (key === "DATABASE_URL" && !looksLikePostgresUrl(value)) {
      return fail(name, `${key} must be a PostgreSQL connection string.`);
    }

    return pass(name, `${key} is configured.`);
  });
}

export function checkProjectAlignment(values) {
  const supabaseRef = inferSupabaseProjectRef(
    getEnvValue(values, "NEXT_PUBLIC_SUPABASE_URL")
  );
  const databaseRef = inferDatabaseProjectRef(
    getEnvValue(values, "DATABASE_URL")
  );

  if (!supabaseRef || !databaseRef) {
    return warn(
      "Supabase project alignment",
      "Could not infer project refs from both NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL."
    );
  }

  if (supabaseRef !== databaseRef) {
    return fail(
      "Supabase project alignment",
      "NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL appear to point at different Supabase projects."
    );
  }

  return pass(
    "Supabase project alignment",
    `Both URLs point at project ${supabaseRef}.`
  );
}

export function checkServiceRole(values) {
  return getEnvValue(values, "SUPABASE_SERVICE_ROLE_KEY")
    ? pass(
        "Service role key",
        "SUPABASE_SERVICE_ROLE_KEY is present for server-only maintenance tasks."
      )
    : warn(
        "Service role key",
        "SUPABASE_SERVICE_ROLE_KEY is not set. Some admin/backfill tasks may need it."
      );
}

export function checkMigrationFiles(root = repoRoot) {
  return migrationFiles.map((relativePath) =>
    existsSync(resolve(root, relativePath))
      ? pass("Migration file", `${relativePath} exists.`)
      : fail("Migration file", `${relativePath} is missing.`)
  );
}

export function checkAuthCallbackRedirect(source) {
  const readsRedirectTo = /searchParams\.get\(["']redirectTo["']\)/.test(
    source
  );
  const redirectsDashboardOnly = /redirect\([^)]*\/dashboard/.test(source);

  if (!readsRedirectTo || redirectsDashboardOnly) {
    return warn(
      "Auth callback redirect",
      "app/auth/callback/route.ts does not fully honor redirectTo; OAuth deep links may land on /dashboard first."
    );
  }

  return pass("Auth callback redirect", "OAuth callback reads redirectTo.");
}

export function checkMiddlewareCoverage(source) {
  const missingRoutes = ["/dashboard", "/setup", "/interview"].filter(
    (route) => !source.includes(route)
  );

  if (missingRoutes.length > 0) {
    return fail(
      "Middleware protected routes",
      `Missing protected route(s): ${missingRoutes.join(", ")}.`
    );
  }

  return pass(
    "Middleware protected routes",
    "Dashboard, setup, and interview routes are protected."
  );
}

export async function runDatabaseChecks(databaseUrl) {
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: "require",
    connect_timeout: 8,
    idle_timeout: 1,
  });

  try {
    const tableRows = await sql`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const policyRows = await sql`
      SELECT tablename, count(*)::int AS policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
    `;

    const tableMap = new Map(
      tableRows.map((row) => [row.tablename, row.rowsecurity])
    );
    const policyMap = new Map(
      policyRows.map((row) => [row.tablename, row.policy_count])
    );
    const missingTables = requiredTables.filter(
      (table) => !tableMap.has(table)
    );
    const rlsDisabled = requiredTables.filter(
      (table) => tableMap.has(table) && !tableMap.get(table)
    );
    const missingPolicies = requiredTables.filter(
      (table) => tableMap.has(table) && !policyMap.get(table)
    );

    const results = [];

    results.push(
      missingTables.length === 0
        ? pass(
            "Database tables",
            `All ${requiredTables.length} expected auth/product tables exist.`
          )
        : fail(
            "Database tables",
            `Missing table(s): ${missingTables.join(", ")}.`
          )
    );

    results.push(
      rlsDisabled.length === 0
        ? pass("Database RLS", "RLS is enabled on expected tables.")
        : fail("Database RLS", `RLS is disabled on: ${rlsDisabled.join(", ")}.`)
    );

    results.push(
      missingPolicies.length === 0
        ? pass(
            "Database policies",
            "Expected tables have at least one RLS policy."
          )
        : warn(
            "Database policies",
            `No RLS policies found for: ${missingPolicies.join(", ")}.`
          )
    );

    return results;
  } catch (error) {
    return [
      fail(
        "Database connection",
        error instanceof Error
          ? error.message
          : "Could not connect to the configured database."
      ),
    ];
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function summarizeResults(results) {
  return {
    failures: results.filter((result) => result.status === "fail").length,
    warnings: results.filter((result) => result.status === "warn").length,
  };
}

async function main() {
  const includeDb = process.argv.includes("--db");
  const envPath = resolve(repoRoot, ".env.local");
  const values = readEnvFile(envPath);
  const results = [];

  results.push(
    existsSync(envPath)
      ? pass("Env file", ".env.local exists.")
      : fail(
          "Env file",
          ".env.local is missing. Run `npm run setup:local` or `npm run env:pull`."
        )
  );

  results.push(...checkRequiredSupabaseEnv(values));
  results.push(checkProjectAlignment(values));
  results.push(checkServiceRole(values));
  results.push(...checkMigrationFiles(repoRoot));
  results.push(
    checkAuthCallbackRedirect(readSource("app/auth/callback/route.ts"))
  );
  results.push(checkMiddlewareCoverage(readSource("middleware.ts")));

  if (includeDb) {
    const databaseUrl = getEnvValue(values, "DATABASE_URL");
    if (databaseUrl) {
      results.push(...(await runDatabaseChecks(databaseUrl)));
    }
  } else {
    results.push(
      warn(
        "Database checks",
        "Skipped live DB checks. Run `npm run auth:doctor:db` to verify schema and RLS."
      )
    );
  }

  console.log("Auth/Supabase doctor\n");
  for (const result of results) {
    console.log(`${result.status.padEnd(6)} ${result.name}: ${result.message}`);
  }

  const summary = summarizeResults(results);
  console.log("");

  if (summary.failures > 0) {
    console.log(
      `Doctor found ${summary.failures} failure(s) and ${summary.warnings} warning(s).`
    );
    process.exit(1);
  }

  console.log(`Doctor passed with ${summary.warnings} warning(s).`);
}

function getEnvValue(values, key) {
  const value = values instanceof Map ? values.get(key) : values?.[key];
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function looksLikeJwt(value) {
  return value.split(".").length === 3;
}

function looksLikePostgresUrl(value) {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function readSource(relativePath) {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function pass(name, message) {
  return { status: "pass", name, message };
}

function warn(name, message) {
  return { status: "warn", name, message };
}

function fail(name, message) {
  return { status: "fail", name, message };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
