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
  "b88622c7a970d748f058dd1c5eaa71e0ef31651c49505c2604bada48965b9b67";
// Filled from the clean PostgreSQL migration acceptance test. This contract
// includes the stable-evidence trigger, which the earlier schema fingerprints
// deliberately did not inspect.
export const STABLE_START_SCHEMA_FINGERPRINT =
  "0fcd5e505fdf94c8b40bb55a02bd04877874a18fa23d9e6b78b077b61174acbd";
export const CREDIT_RECOVERY_SCHEMA_FINGERPRINT =
  "7aa1f13cf16f918674d1d0c23e088b460fea851bd5fade8e3d44cbc2880bb3e1";
export const BILLING_TRUTH_SCHEMA_FINGERPRINT =
  "3db3ac26353810f292a77f98613498fec9bbeef760c9a63f71080302e141e802";
export const WEBHOOK_CONVERGENCE_SCHEMA_FINGERPRINT =
  "1baa26752813afbad3d6a2b9757c114eb261fac42eb6714f08b0d6d2501c5f80";
export const INVOICE_CONVERGENCE_SCHEMA_FINGERPRINT =
  "9cecd66aad91bea95bf3ce3c284e2759aad6219cc4ee3f6c853e35ca584a5680";
export const SUBSCRIPTION_RESOURCE_CONVERGENCE_SCHEMA_FINGERPRINT =
  "fb62af10dec1fb181c42b7e9d9e9e0066a1f69dcfb7818190ea4882c80e1c470";
export const DURABLE_LIVEKIT_DELETION_SCHEMA_FINGERPRINT =
  "74e34f1f300c640dd6910ed44f266a22308a5c733cc2d115eed8cff1a010c606";
export const FEEDBACK_V2_SCHEMA_FINGERPRINT =
  "660c82c89c7e4acdafc41a7e4a5fb83ae221c163c8173e6abe29e8a41f0585e3";
export const SERVER_OWNED_BILLING_PRIVILEGES_SCHEMA_FINGERPRINT =
  "90ac6ee5a1b9e26b0de15bbbeef4019bb54233247397ea976a8a8f4b095fe185";
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
