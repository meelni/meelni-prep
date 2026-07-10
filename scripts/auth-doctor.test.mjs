import assert from "node:assert/strict";
import test from "node:test";

import {
  checkAuthCallbackRedirect,
  checkRequiredSupabaseEnv,
  inferDatabaseProjectRef,
  inferSupabaseProjectRef,
  summarizeResults,
} from "./auth-doctor.mjs";

test("checkRequiredSupabaseEnv fails when core Supabase env is missing", () => {
  const results = checkRequiredSupabaseEnv(
    new Map([
      [
        "DATABASE_URL",
        "postgresql://postgres:secret@db.viafxscamydwybdlcynb.supabase.co:5432/postgres",
      ],
      ["NEXT_PUBLIC_SUPABASE_URL", "https://viafxscamydwybdlcynb.supabase.co"],
    ])
  );

  assert.deepEqual(
    results
      .filter((result) => result.status === "fail")
      .map((result) => result.name),
    ["Supabase anon key"]
  );
});

test("project ref inference supports direct and pooler database URLs", () => {
  assert.equal(
    inferSupabaseProjectRef("https://viafxscamydwybdlcynb.supabase.co"),
    "viafxscamydwybdlcynb"
  );
  assert.equal(
    inferDatabaseProjectRef(
      "postgresql://postgres:secret@db.viafxscamydwybdlcynb.supabase.co:5432/postgres"
    ),
    "viafxscamydwybdlcynb"
  );
  assert.equal(
    inferDatabaseProjectRef(
      "postgresql://postgres.viafxscamydwybdlcynb:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
    ),
    "viafxscamydwybdlcynb"
  );
  assert.equal(
    inferDatabaseProjectRef(
      "postgresql://postgres:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
    ),
    undefined
  );
  assert.equal(
    inferDatabaseProjectRef(
      "postgresql://postgres.viafxscamydwybdlcynb:secret@evil.example:5432/postgres"
    ),
    undefined
  );
  assert.equal(
    inferDatabaseProjectRef(
      "https://postgres.viafxscamydwybdlcynb:secret@aws-0-us-west-1.pooler.supabase.com/postgres"
    ),
    undefined
  );
  assert.equal(
    inferDatabaseProjectRef(
      "postgresql://postgres.viafxscamydwybdlcynb:secret@aws-0-us-west-1.pooler.supabase.com,evil.example:5432/postgres"
    ),
    undefined
  );
});

test("checkAuthCallbackRedirect warns when callback ignores redirectTo", () => {
  const result = checkAuthCallbackRedirect(`
    export async function GET(request) {
      return NextResponse.redirect('/dashboard');
    }
  `);

  assert.equal(result.status, "warn");
  assert.match(result.message, /redirectTo/);
});

test("summarizeResults counts failures and warnings", () => {
  const summary = summarizeResults([
    { status: "pass", name: "A", message: "ok" },
    { status: "warn", name: "B", message: "hm" },
    { status: "fail", name: "C", message: "bad" },
  ]);

  assert.deepEqual(summary, { failures: 1, warnings: 1 });
});
