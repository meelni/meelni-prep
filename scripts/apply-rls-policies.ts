import { sql } from "drizzle-orm";
import { assertNonProductionScriptEnvironment } from "./non-production-script-guard";

assertNonProductionScriptEnvironment();

import fs from "fs";
import path from "path";

const { db } = await import("@/lib/db");

async function applyRLSPolicies() {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20251113000001_add_billing_rls_policies.sql"
  );

  console.log("Reading migration file...");
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  console.log("Applying RLS policies to Supabase database...");

  try {
    // Split SQL into individual statements (simple approach)
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 60)}...`);
        await db.execute(sql.raw(statement));
      }
    }

    console.log("✅ RLS policies applied successfully!");
    console.log("\nApplied policies:");
    console.log(
      "- Enabled RLS on 5 tables: subscription, usage_record, payment_history, stripe_event_log, stripe_customer_mapping"
    );
    console.log(
      "- Created user isolation policies for subscription, usage_record, payment_history"
    );
    console.log(
      "- Created service-role-only policies for stripe_event_log, stripe_customer_mapping"
    );
  } catch (error) {
    console.error("❌ Error applying RLS policies:", error);
    throw error;
  }
}

applyRLSPolicies()
  .then(() => {
    console.log("\n✅ Migration complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
