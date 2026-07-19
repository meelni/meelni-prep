import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { runServiceHealthDatabasePreflight } from "../lib/operations/service-health-database-preflight";
import { createDrizzleServiceHealthEvidenceReader } from "../lib/operations/service-health-store";
import { assertNonProductionScriptEnvironment } from "./non-production-script-guard";

async function main() {
  assertNonProductionScriptEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("database_not_configured");

  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 3,
    idle_timeout: 1,
  });
  try {
    const result = await runServiceHealthDatabasePreflight({
      reader: createDrizzleServiceHealthEvidenceReader(
        drizzle(client) as never
      ),
    });
    write(result, result.status === "passed");
  } finally {
    await client.end({ timeout: 1 });
  }
}

function write(
  result: Awaited<ReturnType<typeof runServiceHealthDatabasePreflight>>,
  passed: boolean
) {
  const output = `${JSON.stringify(result)}\n`;
  if (passed) process.stdout.write(output);
  else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}

void main().catch(() => {
  write(
    {
      preflight: "meelni_service_health_database",
      version: 1,
      checkedAt: new Date().toISOString(),
      status: "failed",
      code: "database_evidence_query_failed",
    },
    false
  );
});
