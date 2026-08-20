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
export const ANALYTICS_CONSENT_SCHEMA_FINGERPRINT =
  "d6b855e326a11e0f44732bcbb4a25b0565af76074a4976d3caec750877bd9701";
export const PUBLIC_DEMO_LIMITS_SCHEMA_FINGERPRINT =
  "82586c6f559387b1a1b98f955565b9e7efbf91265a36234adac41079d4d381ba";
// Refreshed after the forward-only ten-preview allowance changes the two
// public-demo function definitions without changing the table shape.
export const PUBLIC_DEMO_PREVIEW_ALLOWANCE_SCHEMA_FINGERPRINT =
  "c6b818b528246faee01597450cff4a3b5d4ebca70c0738990a6e92f1a188634e";
export const RUNTIME_SETTLEMENT_COMMAND_SCHEMA_FINGERPRINT =
  "7b260723e163004467cf2913341d0fa5169ad8378b8e23c37f8a02e2ff54cb88";
export const FEEDBACK_STAGE_ATTEMPT_SCHEMA_FINGERPRINT =
  "e8fa457fb30012ddc2d519078ebd1bb64103c72749e1994f1a7a539a70f0bcc7";
export const VERIFIED_PREFIX_PARTIAL_SCORECARDS_SCHEMA_FINGERPRINT =
  "3ff3223a059e3dd0f8891745f7fd06ff178fb95ae7bbe81de824515b24a2799b";
// Refreshed by the clean PostgreSQL migration acceptance test whenever the
// service-only shadow artifact contract changes.
export const SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT =
  "90ee1265eed98424299cf06a01e225ccb3905071e6295ff51e4652fa00b62985";
// Migration 0040 makes managed-provider default grants converge to the same
// least-privilege catalog already produced by a clean local migration.
export const MANAGED_SERVICE_ROLE_GRANTS_SCHEMA_FINGERPRINT =
  SHADOW_FEEDBACK_ARTIFACT_SCHEMA_FINGERPRINT;
// Refreshed by the clean PostgreSQL migration acceptance test after the
// dimension-coverage score tuple closes around total-bearing scorecards.
export const TOTAL_REQUIRED_SCORECARDS_SCHEMA_FINGERPRINT =
  "2275da50d525599642694689c989f787c6751de9f995a70abc03629a79844683";
export const QUESTION_RANKING_INDEXES_SCHEMA_FINGERPRINT =
  "c8cc178009d344b489eafef781a099c2411f9a173646784be7f02187b68d6dfa";
export const DURABLE_PREVIEW_SHADOW_CONTROL_PLANE_SCHEMA_FINGERPRINT =
  "6527d4c95a623e4759c92197f380e9bded41ca557165d4300e4e497fedc6cd48";
// Refreshed by the clean PostgreSQL migration acceptance test whenever the
// canonical migration lineage changes.
export const QUESTION_PROVENANCE_SCHEMA_FINGERPRINT =
  "6089186d1df02b3d47f78d9926859a3f6b2aac90e935c9e3d7e56f88fed36af3";
export const FOCUSED_PRACTICE_SCHEMA_FINGERPRINT =
  "e78473ada45f32f6e453b7987876ae97021310020b7dc8cbf513f80464affc91";
export const DURABLE_CONTACT_SCHEMA_FINGERPRINT =
  "53a6b8b16ce3a17ef7d243c8f7b9102ae193efb5b67ca0e462c1a1b2655a6acf";
export const TRANSCRIPT_WATERMARK_SCHEMA_FINGERPRINT =
  "a5823f2722a10f93e1a688b0d1be822fb6f656b71743e4c7e425f68e265313c1";
export const FEEDBACK_OUTCOMES_SCHEMA_FINGERPRINT =
  "b4ae3d866bb1c0f21f7a796848d5515012b31769c5ad12d9e95632ce6e2ac029";
export const DIMENSION_COVERAGE_SCHEMA_FINGERPRINT =
  "d6b725447d079a953d4b688adcc1dc921d6f661dec30cf8026779d87fe152f6b";
// Refreshed by the clean PostgreSQL migration acceptance test whenever the
// canonical focused-practice contract changes.
export const FOCUSED_PRACTICE_SCORELESS_SCHEMA_FINGERPRINT =
  "cabe0c6d65698adce1ca47b84ac13633239c897a1ff4ab6da82f777a1177a5fb";
// Refreshed by the clean PostgreSQL migration acceptance test whenever the
// canonical feedback-quality persistence contract changes.
export const FEEDBACK_QUALITY_SCHEMA_FINGERPRINT =
  "39d1950225d3939d19c65e386e514ee59528a4fdf9af135dc4a46f6736b5f11f";
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
            'reserve_public_demo_session',
            'complete_public_demo_session',
            'finalize_public_demo_recovery_token',
            'rollback_public_demo_recovery_token',
            'fail_public_demo_recovery_session',
            'prune_public_demo_abuse_data',
            'can_read_owned_feedback_quality_signal',
            'consume_feedback_quality_signal_rate_limit'
          )
        ORDER BY p.proname, arguments
      `,
    ]);

  return { columns, constraints, indexes, policies, rls, grants, limiter };
}

export async function getStableStartDatabaseSchemaContract(sql: Queryable) {
  const [
    schema,
    stableEvidenceFunctions,
    stableEvidenceTriggers,
    contactTriageRole,
    contactTriagePrivileges,
    contactTriageFunctions,
    contactTriageTableGrants,
  ] = await Promise.all([
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
            'enforce_billing_adjustment_immutable',
            'enforce_focused_practice_attempt_transition',
            'can_read_owned_focused_practice_attempt',
            'consume_contact_submission_rate_limit',
            'cleanup_contact_submission_rate_limits',
            'list_contact_submissions',
            'read_contact_submission',
            'set_contact_submission_triage_state'
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
            'billing_adjustment_immutable',
            'focused_practice_attempt_transition_guard'
          )
        ORDER BY event_object_table, trigger_name, event_manipulation
      `,
    sql`
        SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
          rolcanlogin, rolreplication, rolbypassrls,
          pg_has_role('anon', oid, 'MEMBER') AS anon_member,
          pg_has_role('authenticated', oid, 'MEMBER') AS authenticated_member,
          pg_has_role('service_role', oid, 'MEMBER') AS service_member,
          CASE
            WHEN to_regrole('authenticator') IS NULL THEN false
            ELSE pg_has_role('authenticator', oid, 'MEMBER')
          END AS authenticator_member
        FROM pg_catalog.pg_roles
        WHERE rolname = 'meelni_contact_triage'
          AND to_regclass('public.contact_submission') IS NOT NULL
      `,
    sql`
        SELECT
          has_schema_privilege(
            'meelni_contact_triage', 'public', 'USAGE'
          ) AS schema_usage,
          has_table_privilege(
            'meelni_contact_triage', 'public.contact_submission', 'SELECT'
          ) AS submission_select,
          has_table_privilege(
            'meelni_contact_triage',
            'public.contact_submission_access_audit',
            'SELECT'
          ) AS audit_select,
          has_table_privilege(
            'meelni_contact_triage',
            'public.contact_submission_rate_limit',
            'SELECT'
          ) AS limiter_select
        WHERE to_regclass('public.contact_submission') IS NOT NULL
      `,
    sql`
        SELECT p.proname,
          has_function_privilege(
            'service_role', p.oid, 'EXECUTE'
          ) AS service_execute,
          has_function_privilege(
            'meelni_contact_triage', p.oid, 'EXECUTE'
          ) AS contact_triage_execute
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND to_regclass('public.contact_submission') IS NOT NULL
          AND p.proname IN (
            'consume_contact_submission_rate_limit',
            'cleanup_contact_submission_rate_limits',
            'list_contact_submissions',
            'read_contact_submission',
            'set_contact_submission_triage_state'
          )
        ORDER BY p.proname
      `,
    sql`
        SELECT table_name,
          array_agg(privilege_type ORDER BY privilege_type) AS privileges
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'meelni_contact_triage'
          AND table_name IN (
            'contact_submission',
            'contact_submission_access_audit',
            'contact_submission_rate_limit'
          )
        GROUP BY table_name
        ORDER BY table_name
      `,
  ]);

  const stableContract = {
    schema,
    stableEvidenceFunctions,
    stableEvidenceTriggers,
  };
  return contactTriageRole.length === 0
    ? stableContract
    : {
        ...stableContract,
        contactTriageRole,
        contactTriagePrivileges,
        contactTriageFunctions,
        contactTriageTableGrants,
      };
}

export function databaseSchemaFingerprint(contract: unknown): string {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
