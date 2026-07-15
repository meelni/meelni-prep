import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  checkAuthCallbackRedirect,
  checkMigrationFiles,
  checkRequiredSupabaseEnv,
  checkRuntimeTranscriptDatabaseBoundary,
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

test("auth doctor follows the complete canonical Drizzle journal", () => {
  const results = checkMigrationFiles();

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "pass");
  assert.match(results[0].message, /14 canonical Drizzle migration files/);
  assert.match(results[0].message, /0013_runtime_settlement/);
  assert.doesNotMatch(results[0].message, /supabase\/migrations/);
});

test("auth doctor fails closed on every browser transcript mutation", () => {
  const safe = {
    unsafePolicyCount: 0,
    authenticatedTranscriptMutation: false,
    authenticatedMarkerMutation: false,
    authenticatedWriterMutation: false,
    authenticatedSettlementMutation: false,
    anonTranscriptMutation: false,
    anonMarkerMutation: false,
    anonWriterMutation: false,
    anonSettlementMutation: false,
    serviceTranscriptInsert: true,
    serviceMarkerInsert: true,
    serviceWriterInsert: true,
    serviceSettlementInsert: true,
  };

  assert.equal(checkRuntimeTranscriptDatabaseBoundary(safe).status, "pass");
  for (const mutation of [
    "authenticatedTranscriptMutation",
    "authenticatedMarkerMutation",
    "authenticatedWriterMutation",
    "authenticatedSettlementMutation",
    "anonTranscriptMutation",
    "anonMarkerMutation",
    "anonWriterMutation",
    "anonSettlementMutation",
  ]) {
    assert.equal(
      checkRuntimeTranscriptDatabaseBoundary({
        ...safe,
        [mutation]: true,
      }).status,
      "fail",
      `${mutation} must fail closed`
    );
  }
  assert.equal(
    checkRuntimeTranscriptDatabaseBoundary({
      ...safe,
      unsafePolicyCount: 1,
    }).status,
    "fail"
  );
  assert.equal(
    checkRuntimeTranscriptDatabaseBoundary({
      ...safe,
      serviceWriterInsert: false,
    }).status,
    "fail"
  );
});

test("advertised security paths cannot restore legacy transcript writes", () => {
  const migrationDirectory = "supabase/migrations";
  const runtimeTables = [
    "transcript_turn",
    "transcript_interruption_marker",
    "transcript_runtime_writer",
    "transcript_runtime_settlement",
  ];
  for (const file of readdirSync(migrationDirectory).filter((name) =>
    name.endsWith(".sql")
  )) {
    const source = readFileSync(`${migrationDirectory}/${file}`, "utf8");
    assertNoBrowserRuntimeMutationSql(source, file, runtimeTables);
  }

  const securityDocs = [
    "docs/security/README.md",
    "docs/security/RLS_DEPLOYMENT_GUIDE.md",
    "docs/security/QUICK_START_SECURITY_FIX.md",
    "docs/security/SECURITY_AUDIT_2025-11-18.md",
  ].map((file) => readFileSync(file, "utf8"));
  for (const source of securityDocs) {
    assert.doesNotMatch(source, /apply_all_rls|feedback_system_rls/i);
    assert.doesNotMatch(source, /authenticated users?.*insert.*transcript/is);
  }
  assert.match(securityDocs.join("\n"), /canonical.*Drizzle journal/is);
});

test("static RLS guard rejects every mutation verb on every runtime table", () => {
  const runtimeTables = [
    "transcript_turn",
    "transcript_interruption_marker",
    "transcript_runtime_writer",
    "transcript_runtime_settlement",
  ];
  for (const table of runtimeTables) {
    for (const verb of ["INSERT", "UPDATE", "DELETE"]) {
      for (const role of ["authenticated", "anon", "public"]) {
        assert.throws(() =>
          assertNoBrowserRuntimeMutationSql(
            `GRANT ${verb} ON public.${table} TO ${role};`,
            "fixture.sql",
            runtimeTables
          )
        );
        assert.throws(() =>
          assertNoBrowserRuntimeMutationSql(
            `CREATE POLICY unsafe ON public.${table} FOR ${verb} TO ${role} USING (true);`,
            "fixture.sql",
            runtimeTables
          )
        );
      }
    }
  }
  assert.doesNotThrow(() =>
    assertNoBrowserRuntimeMutationSql(
      "GRANT SELECT ON TABLE public.transcript_turn TO authenticated;",
      "fixture.sql",
      runtimeTables
    )
  );
  assert.doesNotThrow(() =>
    assertNoBrowserRuntimeMutationSql(
      "CREATE POLICY service_write ON public.transcript_runtime_writer FOR ALL TO service_role USING (true) WITH CHECK (true);",
      "fixture.sql",
      runtimeTables
    )
  );
});

test("live auth-doctor query checks every mutation privilege", () => {
  const source = readFileSync("scripts/auth-doctor.mjs", "utf8");
  for (const table of [
    "transcript_turn",
    "transcript_interruption_marker",
    "transcript_runtime_writer",
    "transcript_runtime_settlement",
  ]) {
    for (const role of ["authenticated", "anon"]) {
      for (const verb of ["INSERT", "UPDATE", "DELETE"]) {
        assert.match(
          source,
          new RegExp(
            `has_table_privilege\\(\\s*['\"]${role}['\"]\\s*,\\s*['\"]public\\.${table}['\"]\\s*,\\s*['\"]${verb}['\"]`,
            "i"
          ),
          `${role} ${verb} on ${table} must be checked`
        );
      }
    }
  }
  assert.match(source, /cmd IN \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/);
  assert.match(
    source,
    /transcript_runtime_settlement'[\s\S]*?cmd IN \([\s\S]*?'DELETE'/
  );
});

function assertNoBrowserRuntimeMutationSql(source, file, runtimeTables) {
  for (const statement of source.split(";")) {
    for (const table of runtimeTables) {
      const targetsTable = new RegExp(
        `ON\\s+(?:TABLE\\s+)?(?:public\\.)?${table}\\b`,
        "i"
      ).test(statement);
      if (!targetsTable) continue;
      if (
        /\bGRANT\b/i.test(statement) &&
        /\bTO\s+(?:anon|authenticated|public)\b/i.test(statement)
      ) {
        assert.doesNotMatch(
          statement,
          /\b(?:INSERT|UPDATE|DELETE|ALL)\b/i,
          `${file} must not grant browser mutations on ${table}`
        );
      }
      if (/\bFOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(statement)) {
        assert.match(
          statement,
          /\bTO\s+service_role\b/i,
          `${file} ${table} write policies must be service-role scoped`
        );
      }
    }
  }
}
