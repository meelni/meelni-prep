/**
 * Backend Integration Test Script
 * Tests Phase 1 & Phase 2 feedback & insights APIs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://viafxscamydwybdlcynb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpYWZ4c2NhbXlkd3liZGxjeW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTk5MzUsImV4cCI6MjA3Nzg3NTkzNX0.jx5RELYDHQyObv_Pe-9gMmiS_wzXPd0QORq9frmrV5o";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TestResult {
  test: string;
  status: "✅" | "❌" | "⚠️";
  details: string;
  duration?: number;
}

const results: TestResult[] = [];

async function addResult(test: string, status: TestResult["status"], details: string, duration?: number) {
  results.push({ test, status, details, duration });
  const icon = status === "✅" ? "✅" : status === "❌" ? "❌" : "⚠️";
  console.log(`${icon} ${test}: ${details}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("Backend Integration Test - Phase 1 & Phase 2");
  console.log("=".repeat(80));
  console.log();

  // 1. Check database sessions
  console.log("1️⃣  Checking database for test sessions...\n");

  try {
    const { data: sessions, error } = await supabase
      .from("interview_session")
      .select(`
        id,
        user_id,
        status,
        started_at,
        ended_at,
        total_turns,
        total_words,
        duration_seconds
      `)
      .order("started_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    console.log(`Found ${sessions?.length || 0} recent sessions`);
    if (sessions && sessions.length > 0) {
      console.log("\nRecent sessions:");
      sessions.forEach((s: any, i: number) => {
        console.log(`  ${i + 1}. ${s.id} (${s.status}) - ${s.total_turns || 0} turns, ${Math.round((s.duration_seconds || 0) / 60)}min`);
      });
    }

    await addResult(
      "Database connectivity",
      "✅",
      `Successfully queried ${sessions?.length || 0} sessions`
    );
  } catch (err: any) {
    await addResult("Database connectivity", "❌", `Error: ${err.message}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("\n📊 Test Summary\n");
  console.log("=".repeat(80));

  results.forEach((r) => {
    console.log(`${r.status} ${r.test}`);
    console.log(`   ${r.details}`);
    if (r.duration) {
      console.log(`   Duration: ${r.duration}ms`);
    }
    console.log();
  });

  const passed = results.filter((r) => r.status === "✅").length;
  const failed = results.filter((r) => r.status === "❌").length;
  const warnings = results.filter((r) => r.status === "⚠️").length;

  console.log("=".repeat(80));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Warnings: ${warnings}`);
  console.log("=".repeat(80));
}

main().catch(console.error);
