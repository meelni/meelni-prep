import { createHash } from "node:crypto";

import type postgres from "postgres";

type Queryable = postgres.Sql | postgres.TransactionSql;

export const RELAUNCH_SCHEMA_FINGERPRINT =
  "fc9bdc57d3f4f80a7c694a62da1ec2d11cbba69533a82bbd3b4ee4318d884e89";
export const SESSION_LIFECYCLE_SCHEMA_FINGERPRINT =
  "3953f5a151a268941ed48bacb0ed15bf7c4016026ecab249189ec367e0a39ab3";
export const ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT =
  "db50dd715e13bcc70277b98e182c743293d5e6681d30c3d1e84ec24813476500";
export const DURABLE_CONTACT_SCHEMA_FINGERPRINT =
  "61db2f56df15abccba1db794572a1330450cd5f1b00e7a86ddcbc69295c30997";
export const CLEAN_0001_SCHEMA_FINGERPRINT =
  "6fc56e7c409481ed74bc7307dd3eab7ab5313f7bf7a0146d9a64b83b145faff0";
export const LEGACY_RELAUNCH_SCHEMA_FINGERPRINT =
  "60386a34754efe07a9cd9b1ddf298feafa44a0117f4e9f1f0fe7308632469004";

export async function getDatabasePreMigrationContract(sql: Queryable) {
  const [columns, constraints, indexes] = await Promise.all([
    sql`
      SELECT table_name, column_name, data_type, udt_name, is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `,
    sql`
      SELECT relname AS table_name, conname, contype,
        pg_get_constraintdef(pg_constraint.oid) AS definition
      FROM pg_constraint
      JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE pg_namespace.nspname = 'public'
      ORDER BY relname, conname
    `,
    sql`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `,
  ]);
  return { columns, constraints, indexes };
}

export async function getDatabaseSchemaContract(sql: Queryable) {
  const [columns, constraints, indexes, policies, rls, grants, limiter] =
    await Promise.all([
      sql`
        SELECT table_name, column_name, data_type, udt_name, is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `,
      sql`
        SELECT relname AS table_name, conname, contype,
          pg_get_constraintdef(pg_constraint.oid) AS definition
        FROM pg_constraint
        JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
        ORDER BY relname, conname
      `,
      sql`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `,
      sql`
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname
      `,
      sql`
        SELECT relname AS table_name, relrowsecurity, relforcerowsecurity
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public' AND pg_class.relkind = 'r'
        ORDER BY relname
      `,
      sql`
        SELECT table_name, grantee,
          array_agg(privilege_type ORDER BY privilege_type) AS privileges
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee IN ('anon', 'authenticated', 'service_role')
        GROUP BY table_name, grantee
        ORDER BY table_name, grantee
      `,
      sql`
        SELECT p.proname, p.prosecdef, p.provolatile,
          pg_get_function_identity_arguments(p.oid) AS arguments,
          pg_get_function_result(p.oid) AS result,
          pg_get_functiondef(p.oid) AS definition,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
          has_function_privilege('authenticated', p.oid, 'EXECUTE')
            AS authenticated_execute,
          has_function_privilege('service_role', p.oid, 'EXECUTE')
            AS service_execute
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'consume_livekit_reconnect_rate_limit',
            'consume_contact_submission_rate_limit',
            'cleanup_contact_submission_rate_limits',
            'list_contact_submissions',
            'read_contact_submission',
            'set_contact_submission_triage_state'
          )
        ORDER BY p.proname, arguments
      `,
    ]);

  return { columns, constraints, indexes, policies, rls, grants, limiter };
}

export function databaseSchemaFingerprint(contract: unknown): string {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
