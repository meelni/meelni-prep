import { createHash } from "node:crypto";

import type postgres from "postgres";

type Queryable = postgres.Sql | postgres.TransactionSql;

export const RELAUNCH_SCHEMA_FINGERPRINT =
  "fc9bdc57d3f4f80a7c694a62da1ec2d11cbba69533a82bbd3b4ee4318d884e89";
export const SESSION_LIFECYCLE_SCHEMA_FINGERPRINT =
  "3953f5a151a268941ed48bacb0ed15bf7c4016026ecab249189ec367e0a39ab3";
export const ATOMIC_SESSION_COMPLETION_SCHEMA_FINGERPRINT =
  "db50dd715e13bcc70277b98e182c743293d5e6681d30c3d1e84ec24813476500";
export const INTERVIEW_RECONNECT_SCHEMA_FINGERPRINT =
  "65bcedd27cdaab0539c8613306628d2a1d930b12981e14a63f9062a80b7468a5";
export const INTERVIEW_RECONNECT_V1_SCHEMA_FINGERPRINT =
  "5239993de11d3309995c1a65f34d5add73fc7306d9fb142f59c2cdc43a4bf337";
export const DEADLINE_ROOM_CLEANUP_SCHEMA_FINGERPRINT =
  "798b7bad358d6a8e90a90da31fab303ba4fecb163459175c821e78d6549804b5";
export const TRANSCRIPT_INGEST_SCHEMA_FINGERPRINT =
  "797aa461a517ab80b2e78b59bdcf46e80e2d9bfe14f93e18a3cb299d57bccc13";
export const TRANSCRIPT_PRIVACY_SCHEMA_FINGERPRINT =
  "c77ee4fcbe14d7d7689850d7e68a629ec22e76951864527c9ea5f5d268af6caa";
export const RUNTIME_SETTLEMENT_SCHEMA_FINGERPRINT =
  "b5d68fa180f7b39fe56b440b2a0c21725f275f9d342d99df98a241089bbb7899";
// Filled from the clean PostgreSQL migration acceptance test. This contract
// includes the stable-evidence trigger, which the earlier schema fingerprints
// deliberately did not inspect.
export const STABLE_START_SCHEMA_FINGERPRINT =
  "01eb23d537b61f1c3aefccbde75d7cefb2679741cd96c411af59993f4cf7bf93";
export const CREDIT_RECOVERY_SCHEMA_FINGERPRINT =
  "780a24caf2e4b720dc78ab794fdc56a082a5da2dc154b8e77d0f135d69ad4dc4";
export const BILLING_TRUTH_SCHEMA_FINGERPRINT =
  "44575b936bcb4d5efc03a93662e12cbcad45e60305ba261522028b98a4b9c017";
export const WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT =
  "55db33c4d32f403774f536cbbbc00e377d9d89425ebae65fe62f472d78f12679";
export const INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT =
  "b85ad87c2328485ed607874466e3ce9e1c4e708383a70eb22b05d223ccd4b033";
export const SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT =
  "84258688f337fd827f9fd68c67bb8323833f3c0728c5bb15051d5f6499c53562";
export const DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT =
  "168f01298334ee329e69c6c7616b43a0ba3781ffb762aeee7296d08bd9eaaa5f";
export const FEEDBACK_V2_SCHEMA_FINGERPRINT =
  "38467dff62157c758d2b17896588f3daccd23a03474c4db558a5cddf564f405e";
export const SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT =
  "ca1f6074c933164b9b26425e8b835123dc14363efe19c03c96829ce5d09aa013";
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
          AND p.proname = 'consume_livekit_reconnect_rate_limit'
        ORDER BY p.proname, arguments
      `,
    ]);

  return { columns, constraints, indexes, policies, rls, grants, limiter };
}

export async function getStableStartDatabaseSchemaContract(sql: Queryable) {
  const [schema, stableEvidenceFunctions, stableEvidenceTriggers] =
    await Promise.all([
      getDatabaseSchemaContract(sql),
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
            'protect_interview_session_stable_evidence',
            'enforce_interview_credit_evidence_immutable',
            'enforce_billing_adjustment_immutable'
          )
        ORDER BY p.proname, arguments
      `,
      sql`
        SELECT event_object_table AS table_name, trigger_name,
          action_timing, event_manipulation,
          action_orientation, action_statement
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
          AND trigger_name IN (
            'protect_interview_session_stable_evidence',
            'interview_credit_evidence_immutable',
            'billing_adjustment_immutable'
          )
        ORDER BY event_object_table, trigger_name, event_manipulation
      `,
    ]);

  return { schema, stableEvidenceFunctions, stableEvidenceTriggers };
}

export function databaseSchemaFingerprint(contract: unknown): string {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
