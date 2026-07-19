DO $preview_lineage_reconciliation$
DECLARE
  migration_rows integer;
  lineage_hashes text[];
  historical_lineage boolean;
  current_lineage boolean;
  historical_demo_shape boolean;
  current_demo_shape boolean;
  reserve_result text;
  reserve_definition text;
  complete_definition text;
  finalize_definition text;
  fail_definition text;
  shared_columns_fingerprint text;
  shared_constraints_fingerprint text;
  shared_indexes_fingerprint text;
  shared_policies_fingerprint text;
  shared_privileges_fingerprint text;
  function_contract_match boolean;
  consent_columns jsonb;
  consent_check_definition text;
  consent_metadata_definition text;
  canonical_table_owner name;
  original_search_path text := pg_catalog.current_setting('search_path');
BEGIN
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog, public', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(664882365002600013::bigint);

  SELECT pg_catalog.count(*)::integer
    INTO migration_rows
  FROM drizzle.__drizzle_migrations;

  SELECT pg_catalog.array_agg(hash ORDER BY created_at)
    INTO lineage_hashes
  FROM drizzle.__drizzle_migrations
  WHERE created_at IN (
    1784277329897,
    1784347830003,
    1784347831000
  );

  historical_lineage := lineage_hashes = ARRAY[
    '4fc47aafade67f243276521d3541261adcbffd084f6c8e3be9eb33abc607b046',
    '1e69634a9abef39e5787369005278f81abf80896ec9318bb86e3eb4b61ed782d',
    'cc11ee565d384af9f5adc65197245dbce92b1a9f408af4874c7d0f0fe405775b'
  ]::text[];
  current_lineage := lineage_hashes = ARRAY[
    'e7e821c5ad6d29c91c1c72d752b1bd907bd6afa2d31da3ac290bd296acb17047',
    '0e04aa089ceaf81eb6a26d47bf80d39ee633ddfe531d5b1b5f17dc67edec5c53',
    '053336fbbcbbf22530098129b2c0cdfc99eb9c992963ad194c95c24b7d94981f'
  ]::text[];

  IF migration_rows <> 26
    OR COALESCE(historical_lineage, false)
      = COALESCE(current_lineage, false)
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_unknown_ledger';
  END IF;

  IF pg_catalog.to_regclass('public.user_settings') IS NULL
    OR pg_catalog.to_regclass('public.interview_session') IS NULL
    OR pg_catalog.to_regclass('public.transcript_runtime_writer') IS NULL
    OR pg_catalog.to_regclass('public.transcript_runtime_settlement') IS NULL
    OR pg_catalog.to_regclass('public.transcript_interruption_marker') IS NULL
    OR pg_catalog.to_regclass('public.transcript_turn') IS NULL
    OR pg_catalog.to_regclass('public.public_demo_rate_limit') IS NULL
    OR pg_catalog.to_regclass('public.public_demo_session') IS NULL
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_missing_shape';
  END IF;

  LOCK TABLE
    public.user_settings,
    public.interview_session,
    public.transcript_runtime_writer,
    public.transcript_runtime_settlement,
    public.transcript_interruption_marker,
    public.transcript_turn,
    public.public_demo_rate_limit,
    public.public_demo_session
    IN ACCESS EXCLUSIVE MODE;

  SELECT pg_catalog.pg_get_userbyid(relowner)::name
    INTO canonical_table_owner
  FROM pg_catalog.pg_class
  WHERE oid = 'public.interview_session'::regclass;

  WITH target(table_name) AS (
    VALUES
      ('transcript_runtime_writer'),
      ('transcript_runtime_settlement'),
      ('transcript_interruption_marker'),
      ('transcript_turn'),
      ('public_demo_rate_limit'),
      ('public_demo_session')
  )
  SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s|%s|%s|%s|%s|%s',
        columns.table_name,
        columns.column_name,
        columns.data_type,
        columns.udt_name,
        columns.is_nullable,
        COALESCE(columns.column_default, '')
      ),
      E'\n' ORDER BY columns.table_name, columns.column_name
    ))
    INTO shared_columns_fingerprint
  FROM information_schema.columns columns
  JOIN target USING (table_name)
  WHERE columns.table_schema = 'public';

  WITH target(table_name) AS (
    VALUES
      ('transcript_runtime_writer'),
      ('transcript_runtime_settlement'),
      ('transcript_interruption_marker'),
      ('transcript_turn'),
      ('public_demo_rate_limit'),
      ('public_demo_session')
  )
  SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s|%s|%s|%s|%s',
        relation.relname,
        constraint_row.conname,
        constraint_row.contype,
        constraint_row.convalidated,
        pg_catalog.pg_get_constraintdef(constraint_row.oid)
      ),
      E'\n' ORDER BY relation.relname, constraint_row.conname
    ))
    INTO shared_constraints_fingerprint
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class relation
    ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = relation.relnamespace
  JOIN target ON target.table_name = relation.relname
  WHERE namespace.nspname = 'public';

  WITH target(table_name) AS (
    VALUES
      ('transcript_runtime_writer'),
      ('transcript_runtime_settlement'),
      ('transcript_interruption_marker'),
      ('transcript_turn'),
      ('public_demo_rate_limit'),
      ('public_demo_session')
  )
  SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s|%s|%s', indexes.tablename, indexes.indexname, indexes.indexdef
      ),
      E'\n' ORDER BY indexes.tablename, indexes.indexname
    ))
    INTO shared_indexes_fingerprint
  FROM pg_catalog.pg_indexes indexes
  JOIN target ON target.table_name = indexes.tablename
  WHERE indexes.schemaname = 'public';

  WITH target(table_name) AS (
    VALUES
      ('transcript_runtime_writer'),
      ('transcript_runtime_settlement'),
      ('transcript_interruption_marker'),
      ('transcript_turn'),
      ('public_demo_rate_limit'),
      ('public_demo_session')
  )
  SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s|%s|%s|%s|%s|%s|%s',
        policies.tablename,
        policies.policyname,
        policies.permissive,
        policies.roles::text,
        policies.cmd,
        COALESCE(pg_catalog.regexp_replace(
          policies.qual, '[[:space:]]+', ' ', 'g'
        ), ''),
        COALESCE(pg_catalog.regexp_replace(
          policies.with_check, '[[:space:]]+', ' ', 'g'
        ), '')
      ),
      E'\n' ORDER BY policies.tablename, policies.policyname
    ))
    INTO shared_policies_fingerprint
  FROM pg_catalog.pg_policies policies
  JOIN target ON target.table_name = policies.tablename
  WHERE policies.schemaname = 'public';

  WITH target(table_name) AS (
    VALUES
      ('transcript_runtime_writer'),
      ('transcript_runtime_settlement'),
      ('transcript_interruption_marker'),
      ('transcript_turn'),
      ('public_demo_rate_limit'),
      ('public_demo_session')
  )
  SELECT pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.format(
        '%s|%s|%s|%s',
        privileges.table_name,
        privileges.grantee,
        privileges.privilege_type,
        privileges.is_grantable
      ),
      E'\n' ORDER BY
        privileges.table_name,
        privileges.grantee,
        privileges.privilege_type
    ))
    INTO shared_privileges_fingerprint
  FROM information_schema.table_privileges privileges
  JOIN target USING (table_name)
  WHERE privileges.table_schema = 'public'
    AND privileges.grantee IN (
      'PUBLIC', 'anon', 'authenticated', 'service_role'
    );

  IF shared_columns_fingerprint IS DISTINCT FROM
      'e694df26231272afb21add2c20eb9ff7'
    OR shared_constraints_fingerprint IS DISTINCT FROM
      '265ad9568364b48eafaf4d11ed6103a5'
    OR shared_indexes_fingerprint IS DISTINCT FROM
      '7a7c0f511bdc60a9c33751438ead3770'
    OR shared_policies_fingerprint IS DISTINCT FROM
      'f3f77c36e4238aefa07697b4dcf8beac'
    OR shared_privileges_fingerprint IS DISTINCT FROM
      'dbe2b7dcee5dfc8579d3fb559447fe5d'
    OR EXISTS (
      SELECT 1
      FROM information_schema.table_privileges privileges
      JOIN pg_catalog.pg_class relation
        ON relation.relname = privileges.table_name
       AND relation.relnamespace = 'public'::regnamespace
      WHERE privileges.table_schema = 'public'
        AND privileges.table_name IN (
          'transcript_runtime_writer',
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn',
          'public_demo_rate_limit',
          'public_demo_session'
        )
        AND privileges.grantee NOT IN (
          'service_role',
          'authenticated',
          pg_catalog.pg_get_userbyid(relation.relowner)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class
      WHERE oid IN (
        'public.transcript_runtime_writer'::regclass,
        'public.transcript_runtime_settlement'::regclass,
        'public.transcript_interruption_marker'::regclass,
        'public.transcript_turn'::regclass,
        'public.public_demo_rate_limit'::regclass,
        'public.public_demo_session'::regclass
      )
        AND (NOT relrowsecurity OR relforcerowsecurity)
    )
    OR (
      current_lineage
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class
        WHERE oid IN (
          'public.transcript_runtime_writer'::regclass,
          'public.transcript_runtime_settlement'::regclass,
          'public.transcript_interruption_marker'::regclass,
          'public.transcript_turn'::regclass,
          'public.public_demo_rate_limit'::regclass,
          'public.public_demo_session'::regclass
        )
          AND pg_catalog.pg_get_userbyid(relowner) <> canonical_table_owner
      )
    )
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_shared_contract_mismatch'
      USING DETAIL = pg_catalog.format(
        'columns=%s constraints=%s indexes=%s policies=%s privileges=%s',
        shared_columns_fingerprint,
        shared_constraints_fingerprint,
        shared_indexes_fingerprint,
        shared_policies_fingerprint,
        shared_privileges_fingerprint
      );
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      column_name,
      data_type,
      udt_name,
      is_nullable,
      COALESCE(column_default, '')
    ) ORDER BY ordinal_position)
    INTO consent_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_settings'
    AND column_name LIKE 'analytics_consent%';

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO consent_check_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.user_settings'::regclass
    AND conname = 'analytics_consent_check'
    AND contype = 'c'
    AND convalidated;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO consent_metadata_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.user_settings'::regclass
    AND conname = 'analytics_consent_metadata_check'
    AND contype = 'c'
    AND convalidated;

  IF consent_check_definition IS DISTINCT FROM
      'CHECK ((analytics_consent = ANY (ARRAY[''undecided''::text, ''accepted''::text, ''declined''::text])))'
    OR (
      historical_lineage
      AND (
        consent_columns IS DISTINCT FROM '[
          ["analytics_consent", "text", "text", "NO", "''undecided''::text"],
          ["analytics_consent_version", "integer", "int4", "YES", ""],
          ["analytics_consent_source", "text", "text", "YES", ""],
          ["analytics_consent_updated_at", "timestamp with time zone", "timestamptz", "YES", ""]
        ]'::jsonb
        OR consent_metadata_definition IS DISTINCT FROM
          'CHECK ((((analytics_consent = ''undecided''::text) AND (analytics_consent_version IS NULL) AND (analytics_consent_source IS NULL) AND (analytics_consent_updated_at IS NULL)) OR ((analytics_consent = ANY (ARRAY[''accepted''::text, ''declined''::text])) AND (analytics_consent_version > 0) AND (analytics_consent_source = ANY (ARRAY[''banner''::text, ''settings''::text, ''legacy_decline''::text, ''account_sync''::text])) AND (analytics_consent_updated_at IS NOT NULL))))'
      )
    )
    OR (
      current_lineage
      AND (
        consent_columns IS DISTINCT FROM '[
          ["analytics_consent", "text", "text", "NO", "''undecided''::text"],
          ["analytics_consent_version", "integer", "int4", "YES", ""],
          ["analytics_consent_source", "text", "text", "YES", ""],
          ["analytics_consent_updated_at", "timestamp with time zone", "timestamptz", "YES", ""],
          ["analytics_consent_revision", "bigint", "int8", "NO", "0"]
        ]'::jsonb
        OR consent_metadata_definition IS DISTINCT FROM
          'CHECK ((((analytics_consent = ''undecided''::text) AND (analytics_consent_version IS NULL) AND (analytics_consent_source IS NULL) AND (analytics_consent_updated_at IS NULL) AND (analytics_consent_revision = 0)) OR ((analytics_consent = ANY (ARRAY[''accepted''::text, ''declined''::text])) AND (analytics_consent_version > 0) AND (analytics_consent_source = ANY (ARRAY[''banner''::text, ''settings''::text, ''legacy_decline''::text, ''account_sync''::text])) AND (analytics_consent_updated_at IS NOT NULL) AND (analytics_consent_revision > 0))))'
      )
    )
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_shape_mismatch';
  END IF;

  IF historical_lineage AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'analytics_consent_revision'
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_shape_mismatch';
  END IF;

  IF current_lineage AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'analytics_consent_revision'
      AND data_type = 'bigint'
      AND is_nullable = 'NO'
      AND column_default = '0'
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_shape_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'analytics_consent_metadata_check'
      AND contype = 'c'
      AND (
        (historical_lineage
          AND pg_catalog.pg_get_constraintdef(oid)
            NOT LIKE '%analytics_consent_revision%')
        OR
        (current_lineage
          AND pg_catalog.pg_get_constraintdef(oid)
            LIKE '%analytics_consent_revision%')
      )
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_shape_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_demo_session'
      AND column_name = 'active_expires_at'
      AND data_type = 'timestamp with time zone'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'public_demo_session'
      AND column_name = 'recovery_claim_token'
      AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_public_demo_shape_mismatch';
  END IF;

  SELECT pg_catalog.pg_get_function_result(oid),
    pg_catalog.pg_get_functiondef(oid)
    INTO reserve_result, reserve_definition
  FROM pg_catalog.pg_proc
  WHERE oid = pg_catalog.to_regprocedure(
    'public.reserve_public_demo_session(uuid,text,text,text)'
  );

  SELECT pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.complete_public_demo_session(uuid,text,text)'
      )
    ),
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.finalize_public_demo_recovery_token(uuid,uuid)'
      )
    ),
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.fail_public_demo_recovery_session(uuid,uuid,text)'
      )
    )
    INTO complete_definition, finalize_definition, fail_definition;

  historical_demo_shape :=
    reserve_result IS NOT NULL
    AND reserve_result NOT LIKE '%deadline_at%'
    AND reserve_definition LIKE '%interval ''3 minutes''%'
    AND complete_definition NOT LIKE '%interval ''5 seconds''%'
    AND finalize_definition NOT LIKE '%interval ''5 seconds''%'
    AND fail_definition NOT LIKE '%recovery_claim_token = NULL%';
  current_demo_shape :=
    reserve_result LIKE '%deadline_at%'
    AND reserve_definition LIKE '%deadline_at := now_at + interval ''2 minutes''%'
    AND complete_definition LIKE '%active_expires_at >= now_at + interval ''5 seconds''%'
    AND finalize_definition LIKE '%active_expires_at >= now_at + interval ''5 seconds''%'
    AND fail_definition LIKE '%recovery_claim_token = NULL%';

  IF (historical_lineage AND NOT COALESCE(historical_demo_shape, false))
    OR (current_lineage AND NOT COALESCE(current_demo_shape, false))
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_public_demo_shape_mismatch';
  END IF;

  IF (
    SELECT pg_catalog.count(*) <> 6
      OR pg_catalog.bool_or(proc.prosecdef)
      OR pg_catalog.bool_or(
        proc.proconfig IS DISTINCT FROM ARRAY['search_path=public']
      )
    FROM pg_catalog.pg_proc proc
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_public_demo_acl_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ) OR (
    SELECT pg_catalog.count(*) <> 6
      OR pg_catalog.bool_or(is_grantable <> 'NO')
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
      AND grantee = 'service_role'
      AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_public_demo_acl_mismatch';
  END IF;

  WITH expected(
    function_name,
    identity_arguments,
    historical_body_hash,
    current_body_hash,
    historical_result,
    current_result
  ) AS (
    VALUES
      (
        'reserve_public_demo_session',
        'requested_session_id uuid, requested_deployment_scope text, ip_identifier_hash text, device_identifier_hash text',
        '90ff3e367800568cc24cf643253ef95b',
        '1957461c7311ca977608b0c1d1b90545',
        'TABLE(decision text, room_name text, limiting_scope text, retry_after_seconds integer, remaining integer, recovery_claim_token uuid)',
        'TABLE(decision text, room_name text, limiting_scope text, retry_after_seconds integer, remaining integer, recovery_claim_token uuid, deadline_at timestamp with time zone)'
      ),
      (
        'complete_public_demo_session',
        'completed_session_id uuid, completed_status text, safe_failure_code text',
        'b9e55cf0f7fbe4482d5de630454b1934',
        '5f976b37ae2136112e4e1a2638be8f48',
        'boolean',
        'boolean'
      ),
      (
        'finalize_public_demo_recovery_token',
        'completed_session_id uuid, completed_claim_token uuid',
        '038c4e8c136d81648831e4005d4d8625',
        'b6b016769dc140b29ef2fd4a45bf1628',
        'boolean',
        'boolean'
      ),
      (
        'rollback_public_demo_recovery_token',
        'failed_session_id uuid, failed_claim_token uuid',
        '26afe0bc6575c79896c67c9524009351',
        '26afe0bc6575c79896c67c9524009351',
        'boolean',
        'boolean'
      ),
      (
        'fail_public_demo_recovery_session',
        'failed_session_id uuid, failed_claim_token uuid, safe_failure_code text',
        'f1d8bcd533f9250ed9ac54b39724b43a',
        'da76b3e25526015373c7c9d12913dec5',
        'boolean',
        'boolean'
      ),
      (
        'prune_public_demo_abuse_data',
        '',
        '8b4586ed2d3d4e9302a4e0f0840f1e28',
        '8b4586ed2d3d4e9302a4e0f0840f1e28',
        'TABLE(deleted_sessions integer, deleted_limits integer)',
        'TABLE(deleted_sessions integer, deleted_limits integer)'
      )
  )
  SELECT pg_catalog.count(*) = 6
    AND pg_catalog.count(proc.oid) = 6
    AND pg_catalog.bool_and(
      pg_catalog.pg_get_function_identity_arguments(proc.oid)
        = expected.identity_arguments
      AND pg_catalog.md5(proc.prosrc) = CASE
        WHEN historical_lineage THEN expected.historical_body_hash
        ELSE expected.current_body_hash
      END
      AND pg_catalog.pg_get_function_result(proc.oid) = CASE
        WHEN historical_lineage THEN expected.historical_result
        ELSE expected.current_result
      END
      AND NOT proc.prosecdef
      AND proc.proconfig = ARRAY['search_path=public']
    )
    INTO function_contract_match
  FROM expected
  LEFT JOIN pg_catalog.pg_proc proc
    ON proc.proname = expected.function_name
   AND proc.pronamespace = 'public'::regnamespace;

  IF NOT COALESCE(function_contract_match, false)
    OR (
      SELECT pg_catalog.count(*) <> 6
        OR pg_catalog.bool_or(is_grantable <> 'NO')
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN (
          'reserve_public_demo_session',
          'complete_public_demo_session',
          'finalize_public_demo_recovery_token',
          'rollback_public_demo_recovery_token',
          'fail_public_demo_recovery_session',
          'prune_public_demo_abuse_data'
        )
        AND grantee = 'service_role'
        AND privilege_type = 'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges privileges
      JOIN pg_catalog.pg_proc proc
        ON proc.proname = privileges.routine_name
       AND proc.pronamespace = 'public'::regnamespace
      WHERE privileges.routine_schema = 'public'
        AND privileges.routine_name IN (
          'reserve_public_demo_session',
          'complete_public_demo_session',
          'finalize_public_demo_recovery_token',
          'rollback_public_demo_recovery_token',
          'fail_public_demo_recovery_session',
          'prune_public_demo_abuse_data'
        )
        AND privileges.grantee NOT IN (
          'service_role',
          pg_catalog.pg_get_userbyid(proc.proowner)
        )
    )
    OR (
      current_lineage
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc proc
        WHERE proc.pronamespace = 'public'::regnamespace
          AND proc.proname IN (
            'reserve_public_demo_session',
            'complete_public_demo_session',
            'finalize_public_demo_recovery_token',
            'rollback_public_demo_recovery_token',
            'fail_public_demo_recovery_session',
            'prune_public_demo_abuse_data'
          )
          AND pg_catalog.pg_get_userbyid(proc.proowner)
            <> canonical_table_owner
      )
    )
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_function_contract_mismatch';
  END IF;

  IF historical_lineage AND EXISTS (
    SELECT 1
    FROM public.public_demo_session
    WHERE status IN ('provisioning', 'ready')
      AND active_expires_at > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_active_demo_session';
  END IF;

  IF historical_lineage THEN
    ALTER TABLE public.user_settings
      ADD COLUMN analytics_consent_revision bigint DEFAULT 0 NOT NULL;
  END IF;

  IF historical_lineage THEN
    UPDATE public.user_settings
    SET analytics_consent_revision = 1
    WHERE analytics_consent IN ('accepted', 'declined');

    ALTER TABLE public.user_settings
      DROP CONSTRAINT analytics_consent_metadata_check;
    ALTER TABLE public.user_settings
      ADD CONSTRAINT analytics_consent_metadata_check CHECK (
      (
        analytics_consent = 'undecided'
        AND analytics_consent_version IS NULL
        AND analytics_consent_source IS NULL
        AND analytics_consent_updated_at IS NULL
        AND analytics_consent_revision = 0
      )
      OR
      (
        analytics_consent IN ('accepted', 'declined')
        AND analytics_consent_version > 0
        AND analytics_consent_source IN (
          'banner',
          'settings',
          'legacy_decline',
          'account_sync'
        )
        AND analytics_consent_updated_at IS NOT NULL
        AND analytics_consent_revision > 0
      )
      ) NOT VALID;
    ALTER TABLE public.user_settings
      VALIDATE CONSTRAINT analytics_consent_metadata_check;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(relowner)::name
    INTO canonical_table_owner
  FROM pg_catalog.pg_class
  WHERE oid = 'public.interview_session'::regclass;

  IF canonical_table_owner IS NULL THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_missing_owner';
  END IF;

  IF current_lineage AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid IN (
      'public.transcript_runtime_writer'::regclass,
      'public.transcript_runtime_settlement'::regclass,
      'public.transcript_interruption_marker'::regclass,
      'public.transcript_turn'::regclass,
      'public.public_demo_rate_limit'::regclass,
      'public.public_demo_session'::regclass
    )
      AND pg_catalog.pg_get_userbyid(relowner) <> canonical_table_owner
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_owner_mismatch';
  END IF;

  IF current_lineage AND EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc proc
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
      AND pg_catalog.pg_get_userbyid(proc.proowner) <> canonical_table_owner
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_function_owner_mismatch';
  END IF;

  IF historical_lineage THEN
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.transcript_runtime_writer OWNER TO %I',
      canonical_table_owner
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.transcript_runtime_settlement OWNER TO %I',
      canonical_table_owner
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.transcript_interruption_marker OWNER TO %I',
      canonical_table_owner
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.transcript_turn OWNER TO %I',
      canonical_table_owner
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.public_demo_rate_limit OWNER TO %I',
      canonical_table_owner
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.public_demo_session OWNER TO %I',
      canonical_table_owner
    );

    UPDATE public.public_demo_session
    SET active_expires_at = LEAST(
        active_expires_at,
        created_at + interval '2 minutes'
      ),
      updated_at = pg_catalog.clock_timestamp()
    WHERE active_expires_at > created_at + interval '2 minutes';

    EXECUTE 'DROP FUNCTION public.reserve_public_demo_session(uuid, text, text, text)';
  END IF;

  PERFORM pg_catalog.set_config('search_path', original_search_path, true);
END
$preview_lineage_reconciliation$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."reserve_public_demo_session"(
  "requested_session_id" uuid,
  "requested_deployment_scope" text,
  "ip_identifier_hash" text,
  "device_identifier_hash" text
)
RETURNS TABLE (
  "decision" text,
  "room_name" text,
  "limiting_scope" text,
  "retry_after_seconds" integer,
  "remaining" integer,
  "recovery_claim_token" uuid,
  "deadline_at" timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  now_at timestamp with time zone := clock_timestamp();
  existing_session public_demo_session%ROWTYPE;
  global_accepted timestamp with time zone[] := ARRAY[]::timestamptz[];
  ip_accepted timestamp with time zone[] := ARRAY[]::timestamptz[];
  device_accepted timestamp with time zone[] := ARRAY[]::timestamptz[];
  global_limit integer;
  ip_retry integer := 0;
  device_retry integer := 0;
  active_device_retry integer := 0;
  active_device_expiry timestamp with time zone;
  claim_token_value uuid;
  global_hash constant text := repeat('0', 64);
BEGIN
  IF requested_session_id IS NULL
    OR requested_deployment_scope NOT IN ('production', 'preview', 'development')
    OR ip_identifier_hash !~ '^[0-9a-f]{64}$'
    OR device_identifier_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'valid public demo reservation inputs are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(requested_session_id::text, 0));

  SELECT * INTO existing_session
  FROM public_demo_session
  WHERE id = requested_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_session.expires_at > now_at THEN
      room_name := existing_session.room_name;
      remaining := GREATEST(0, 2 - existing_session.token_issues);
      recovery_claim_token := NULL;

      IF existing_session.deployment_scope <> requested_deployment_scope
        OR existing_session.ip_hash <> ip_identifier_hash
        OR existing_session.device_hash <> device_identifier_hash
      THEN
        decision := 'rate_limited';
        limiting_scope := 'session';
        retry_after_seconds := GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (existing_session.expires_at - now_at)))::integer
        );
        remaining := 0;
        RETURN NEXT;
        RETURN;
      END IF;

      IF existing_session.status = 'ready'
        AND existing_session.active_expires_at > now_at
        AND existing_session.token_issues = 1
        AND existing_session.recovery_claim_token IS NULL
      THEN
        claim_token_value := gen_random_uuid();
        UPDATE public_demo_session
        SET token_issues = 2,
          recovery_claim_token = claim_token_value,
          recovery_finalized_at = NULL,
          updated_at = now_at
        WHERE id = requested_session_id;
        decision := 'issue_token';
        limiting_scope := NULL;
        retry_after_seconds := 0;
        remaining := 0;
        recovery_claim_token := claim_token_value;
        deadline_at := existing_session.active_expires_at;
        RETURN NEXT;
        RETURN;
      END IF;

      decision := CASE
        WHEN existing_session.status = 'provisioning'
          AND existing_session.active_expires_at > now_at
          THEN 'provisioning'
        WHEN existing_session.status = 'failed' THEN 'failed'
        ELSE 'rate_limited'
      END;
      limiting_scope := 'session';
      retry_after_seconds := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (existing_session.expires_at - now_at)))::integer
      );
      remaining := 0;
      RETURN NEXT;
      RETURN;
    END IF;

    DELETE FROM public_demo_session WHERE id = requested_session_id;
  END IF;

  INSERT INTO public_demo_rate_limit (deployment_scope, scope, identifier_hash)
  VALUES (requested_deployment_scope, 'global', global_hash)
  ON CONFLICT (deployment_scope, scope, identifier_hash) DO NOTHING;

  SELECT accepted_at INTO global_accepted
  FROM public_demo_rate_limit
  WHERE deployment_scope = requested_deployment_scope
    AND scope = 'global'
    AND identifier_hash = global_hash
  FOR UPDATE;

  SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::timestamptz[])
  INTO global_accepted
  FROM unnest(global_accepted) AS value
  WHERE value > now_at - interval '24 hours';

  global_limit := CASE
    WHEN requested_deployment_scope = 'production' THEN 100
    ELSE 20
  END;
  IF cardinality(global_accepted) >= global_limit THEN
    decision := 'rate_limited';
    room_name := NULL;
    limiting_scope := 'global';
    retry_after_seconds := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        global_accepted[1] + interval '24 hours' - now_at
      )))::integer
    );
    remaining := 0;
    recovery_claim_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::timestamptz[])
  INTO ip_accepted
  FROM unnest(COALESCE((
    SELECT accepted_at
    FROM public_demo_rate_limit
    WHERE deployment_scope = requested_deployment_scope
      AND scope = 'ip'
      AND identifier_hash = ip_identifier_hash
  ), ARRAY[]::timestamptz[])) AS value
  WHERE value > now_at - interval '24 hours';

  IF cardinality(ip_accepted) >= 20 THEN
    ip_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        ip_accepted[1] + interval '24 hours' - now_at
      )))::integer
    );
  ELSIF cardinality(ARRAY(
    SELECT value
    FROM unnest(ip_accepted) AS value
    WHERE value > now_at - interval '10 minutes'
  )) >= 3 THEN
    SELECT GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        MIN(value) + interval '10 minutes' - now_at
      )))::integer
    )
    INTO ip_retry
    FROM unnest(ip_accepted) AS value
    WHERE value > now_at - interval '10 minutes';
  END IF;
  IF ip_retry > 0 THEN
    decision := 'rate_limited';
    room_name := NULL;
    limiting_scope := 'ip';
    retry_after_seconds := ip_retry;
    remaining := 0;
    recovery_claim_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::timestamptz[])
  INTO device_accepted
  FROM unnest(COALESCE((
    SELECT accepted_at
    FROM public_demo_rate_limit
    WHERE deployment_scope = requested_deployment_scope
      AND scope = 'device'
      AND identifier_hash = device_identifier_hash
  ), ARRAY[]::timestamptz[])) AS value
  WHERE value > now_at - interval '24 hours';

  IF cardinality(device_accepted) >= 2 THEN
    device_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        device_accepted[1] + interval '24 hours' - now_at
      )))::integer
    );
  END IF;

  SELECT MAX(active_expires_at) INTO active_device_expiry
  FROM public_demo_session
  WHERE deployment_scope = requested_deployment_scope
    AND device_hash = device_identifier_hash
    AND status IN ('provisioning', 'ready')
    AND active_expires_at > now_at;

  IF active_device_expiry IS NOT NULL THEN
    active_device_retry := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        active_device_expiry - now_at
      )))::integer
    );
  END IF;

  retry_after_seconds := GREATEST(device_retry, active_device_retry);
  IF retry_after_seconds > 0 THEN
    decision := 'rate_limited';
    room_name := NULL;
    limiting_scope := CASE
      WHEN active_device_retry > 0
        AND retry_after_seconds = active_device_retry
        THEN 'active_device'
      ELSE 'device'
    END;
    remaining := 0;
    recovery_claim_token := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  global_accepted := array_append(global_accepted, now_at);
  ip_accepted := array_append(ip_accepted, now_at);
  device_accepted := array_append(device_accepted, now_at);

  UPDATE public_demo_rate_limit
  SET accepted_at = global_accepted, updated_at = now_at
  WHERE deployment_scope = requested_deployment_scope
    AND scope = 'global'
    AND identifier_hash = global_hash;

  INSERT INTO public_demo_rate_limit (
    deployment_scope, scope, identifier_hash, accepted_at, updated_at
  ) VALUES (
    requested_deployment_scope, 'ip', ip_identifier_hash, ip_accepted, now_at
  )
  ON CONFLICT (deployment_scope, scope, identifier_hash)
  DO UPDATE SET accepted_at = EXCLUDED.accepted_at, updated_at = EXCLUDED.updated_at;

  INSERT INTO public_demo_rate_limit (
    deployment_scope, scope, identifier_hash, accepted_at, updated_at
  ) VALUES (
    requested_deployment_scope, 'device', device_identifier_hash, device_accepted, now_at
  )
  ON CONFLICT (deployment_scope, scope, identifier_hash)
  DO UPDATE SET accepted_at = EXCLUDED.accepted_at, updated_at = EXCLUDED.updated_at;

  room_name := 'demo-' || replace(requested_session_id::text, '-', '');
  deadline_at := now_at + interval '2 minutes';
  INSERT INTO public_demo_session (
    id, deployment_scope, ip_hash, device_hash, room_name,
    created_at, updated_at, active_expires_at, expires_at
  ) VALUES (
    requested_session_id,
    requested_deployment_scope,
    ip_identifier_hash,
    device_identifier_hash,
    room_name,
    now_at,
    now_at,
    deadline_at,
    now_at + interval '15 minutes'
  );

  decision := 'provision';
  limiting_scope := NULL;
  retry_after_seconds := 0;
  remaining := LEAST(
    global_limit - cardinality(global_accepted),
    20 - cardinality(ip_accepted),
    2 - cardinality(device_accepted)
  );
  recovery_claim_token := NULL;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."complete_public_demo_session"(
  "completed_session_id" uuid,
  "completed_status" text,
  "safe_failure_code" text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  now_at timestamp with time zone := clock_timestamp();
  updated_rows integer;
BEGIN
  IF completed_status NOT IN ('ready', 'failed')
    OR (safe_failure_code IS NOT NULL AND safe_failure_code !~ '^[a-z0-9_]{1,64}$')
  THEN
    RAISE EXCEPTION 'invalid public demo completion';
  END IF;

  UPDATE public_demo_session
  SET status = completed_status,
    token_issues = CASE WHEN completed_status = 'ready' THEN 1 ELSE token_issues END,
    failure_code = CASE WHEN completed_status = 'failed' THEN safe_failure_code ELSE NULL END,
    active_expires_at = CASE
      WHEN completed_status = 'failed' THEN LEAST(active_expires_at, now_at)
      ELSE active_expires_at
    END,
    updated_at = now_at
  WHERE id = completed_session_id
    AND status = 'provisioning'
    AND (
      completed_status = 'failed'
      OR active_expires_at >= now_at + interval '5 seconds'
    );
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."finalize_public_demo_recovery_token"(
  "completed_session_id" uuid,
  "completed_claim_token" uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  now_at timestamp with time zone := clock_timestamp();
BEGIN
  IF completed_session_id IS NULL OR completed_claim_token IS NULL THEN
    RAISE EXCEPTION 'valid public demo recovery finalization inputs are required';
  END IF;

  UPDATE public_demo_session
  SET recovery_finalized_at = COALESCE(recovery_finalized_at, now_at),
    updated_at = now_at
  WHERE id = completed_session_id
    AND status = 'ready'
    AND token_issues = 2
    AND recovery_claim_token = completed_claim_token
    AND active_expires_at >= now_at + interval '5 seconds';
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."rollback_public_demo_recovery_token"(
  "failed_session_id" uuid,
  "failed_claim_token" uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF failed_session_id IS NULL OR failed_claim_token IS NULL THEN
    RAISE EXCEPTION 'valid public demo recovery rollback inputs are required';
  END IF;

  UPDATE public_demo_session
  SET token_issues = 1,
    recovery_claim_token = NULL,
    recovery_finalized_at = NULL,
    updated_at = clock_timestamp()
  WHERE id = failed_session_id
    AND status = 'ready'
    AND token_issues = 2
    AND recovery_claim_token = failed_claim_token
    AND recovery_finalized_at IS NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."fail_public_demo_recovery_session"(
  "failed_session_id" uuid,
  "failed_claim_token" uuid,
  "safe_failure_code" text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  now_at timestamp with time zone := clock_timestamp();
BEGIN
  IF failed_session_id IS NULL
    OR failed_claim_token IS NULL
    OR safe_failure_code !~ '^[a-z0-9_]{1,64}$'
  THEN
    RAISE EXCEPTION 'valid public demo recovery failure inputs are required';
  END IF;

  UPDATE public_demo_session
  SET status = 'failed',
    failure_code = safe_failure_code,
    recovery_claim_token = NULL,
    recovery_finalized_at = NULL,
    active_expires_at = LEAST(active_expires_at, now_at),
    updated_at = now_at
  WHERE id = failed_session_id
    AND status = 'ready'
    AND token_issues = 2
    AND recovery_claim_token = failed_claim_token
    AND recovery_finalized_at IS NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."prune_public_demo_abuse_data"()
RETURNS TABLE ("deleted_sessions" integer, "deleted_limits" integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public_demo_session
  WHERE expires_at < clock_timestamp() - interval '48 hours';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  DELETE FROM public_demo_rate_limit
  WHERE updated_at < clock_timestamp() - interval '48 hours';
  GET DIAGNOSTICS deleted_limits = ROW_COUNT;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."reserve_public_demo_session"(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."complete_public_demo_session"(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."finalize_public_demo_recovery_token"(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."rollback_public_demo_recovery_token"(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."fail_public_demo_recovery_session"(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."prune_public_demo_abuse_data"()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."reserve_public_demo_session"(uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."complete_public_demo_session"(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."finalize_public_demo_recovery_token"(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."rollback_public_demo_recovery_token"(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."fail_public_demo_recovery_session"(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."prune_public_demo_abuse_data"()
  TO service_role;
--> statement-breakpoint
DO $preview_lineage_reconciliation_postflight$
DECLARE
  canonical_table_owner name;
  original_search_path text := pg_catalog.current_setting('search_path');
  signature text;
  shared_contract_fingerprint text;
  consent_columns jsonb;
  consent_check_definition text;
  consent_metadata_definition text;
  function_contract_match boolean;
BEGIN
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog, public', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(664882365002600013::bigint);

  SELECT pg_catalog.pg_get_userbyid(relowner)::name
    INTO canonical_table_owner
  FROM pg_catalog.pg_class
  WHERE oid = 'public.interview_session'::regclass;

  FOREACH signature IN ARRAY ARRAY[
    'public.reserve_public_demo_session(uuid, text, text, text)',
    'public.complete_public_demo_session(uuid, text, text)',
    'public.finalize_public_demo_recovery_token(uuid, uuid)',
    'public.rollback_public_demo_recovery_token(uuid, uuid)',
    'public.fail_public_demo_recovery_session(uuid, uuid, text)',
    'public.prune_public_demo_abuse_data()'
  ]::text[] LOOP
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s OWNER TO %I',
      signature,
      canonical_table_owner
    );
  END LOOP;

  SELECT pg_catalog.md5(pg_catalog.concat_ws(
      '|',
      (
        SELECT pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s|%s|%s',
            columns.table_name,
            columns.column_name,
            columns.data_type,
            columns.udt_name,
            columns.is_nullable,
            COALESCE(columns.column_default, '')
          ),
          E'\n' ORDER BY columns.table_name, columns.column_name
        ))
        FROM information_schema.columns columns
        WHERE columns.table_schema = 'public'
          AND columns.table_name = ANY(ARRAY[
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn',
            'public_demo_rate_limit',
            'public_demo_session'
          ])
      ),
      (
        SELECT pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s|%s',
            relation.relname,
            constraint_row.conname,
            constraint_row.contype,
            constraint_row.convalidated,
            pg_catalog.pg_get_constraintdef(constraint_row.oid)
          ),
          E'\n' ORDER BY relation.relname, constraint_row.conname
        ))
        FROM pg_catalog.pg_constraint constraint_row
        JOIN pg_catalog.pg_class relation
          ON relation.oid = constraint_row.conrelid
        WHERE relation.relnamespace = 'public'::regnamespace
          AND relation.relname = ANY(ARRAY[
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn',
            'public_demo_rate_limit',
            'public_demo_session'
          ])
      ),
      (
        SELECT pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s', indexes.tablename, indexes.indexname, indexes.indexdef
          ),
          E'\n' ORDER BY indexes.tablename, indexes.indexname
        ))
        FROM pg_catalog.pg_indexes indexes
        WHERE indexes.schemaname = 'public'
          AND indexes.tablename = ANY(ARRAY[
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn',
            'public_demo_rate_limit',
            'public_demo_session'
          ])
      ),
      (
        SELECT pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s|%s|%s|%s',
            policies.tablename,
            policies.policyname,
            policies.permissive,
            policies.roles::text,
            policies.cmd,
            COALESCE(pg_catalog.regexp_replace(
              policies.qual, '[[:space:]]+', ' ', 'g'
            ), ''),
            COALESCE(pg_catalog.regexp_replace(
              policies.with_check, '[[:space:]]+', ' ', 'g'
            ), '')
          ),
          E'\n' ORDER BY policies.tablename, policies.policyname
        ))
        FROM pg_catalog.pg_policies policies
        WHERE policies.schemaname = 'public'
          AND policies.tablename = ANY(ARRAY[
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn',
            'public_demo_rate_limit',
            'public_demo_session'
          ])
      ),
      (
        SELECT pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.format(
            '%s|%s|%s|%s',
            privileges.table_name,
            privileges.grantee,
            privileges.privilege_type,
            privileges.is_grantable
          ),
          E'\n' ORDER BY
            privileges.table_name,
            privileges.grantee,
            privileges.privilege_type
        ))
        FROM information_schema.table_privileges privileges
        WHERE privileges.table_schema = 'public'
          AND privileges.table_name = ANY(ARRAY[
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn',
            'public_demo_rate_limit',
            'public_demo_session'
          ])
          AND privileges.grantee IN (
            'PUBLIC', 'anon', 'authenticated', 'service_role'
          )
      )
    ))
    INTO shared_contract_fingerprint;

  IF shared_contract_fingerprint IS DISTINCT FROM
      'c6bf6737aaffc99f8959aab6f1a55eb9'
    OR EXISTS (
      SELECT 1
      FROM information_schema.table_privileges privileges
      JOIN pg_catalog.pg_class relation
        ON relation.relname = privileges.table_name
       AND relation.relnamespace = 'public'::regnamespace
      WHERE privileges.table_schema = 'public'
        AND privileges.table_name = ANY(ARRAY[
          'transcript_runtime_writer',
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn',
          'public_demo_rate_limit',
          'public_demo_session'
        ])
        AND privileges.grantee NOT IN (
          'service_role',
          'authenticated',
          pg_catalog.pg_get_userbyid(relation.relowner)
        )
    )
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_shared_postflight_failed';
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      column_name,
      data_type,
      udt_name,
      is_nullable,
      COALESCE(column_default, '')
    ) ORDER BY ordinal_position)
    INTO consent_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_settings'
    AND column_name LIKE 'analytics_consent%';

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO consent_check_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.user_settings'::regclass
    AND conname = 'analytics_consent_check'
    AND contype = 'c'
    AND convalidated;

  SELECT pg_catalog.pg_get_constraintdef(oid)
    INTO consent_metadata_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.user_settings'::regclass
    AND conname = 'analytics_consent_metadata_check'
    AND contype = 'c'
    AND convalidated;

  IF consent_columns IS DISTINCT FROM '[
      ["analytics_consent", "text", "text", "NO", "''undecided''::text"],
      ["analytics_consent_version", "integer", "int4", "YES", ""],
      ["analytics_consent_source", "text", "text", "YES", ""],
      ["analytics_consent_updated_at", "timestamp with time zone", "timestamptz", "YES", ""],
      ["analytics_consent_revision", "bigint", "int8", "NO", "0"]
    ]'::jsonb
    OR consent_check_definition IS DISTINCT FROM
      'CHECK ((analytics_consent = ANY (ARRAY[''undecided''::text, ''accepted''::text, ''declined''::text])))'
    OR consent_metadata_definition IS DISTINCT FROM
      'CHECK ((((analytics_consent = ''undecided''::text) AND (analytics_consent_version IS NULL) AND (analytics_consent_source IS NULL) AND (analytics_consent_updated_at IS NULL) AND (analytics_consent_revision = 0)) OR ((analytics_consent = ANY (ARRAY[''accepted''::text, ''declined''::text])) AND (analytics_consent_version > 0) AND (analytics_consent_source = ANY (ARRAY[''banner''::text, ''settings''::text, ''legacy_decline''::text, ''account_sync''::text])) AND (analytics_consent_updated_at IS NOT NULL) AND (analytics_consent_revision > 0))))'
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_postflight_failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class
    WHERE oid IN (
      'public.transcript_runtime_writer'::regclass,
      'public.transcript_runtime_settlement'::regclass,
      'public.transcript_interruption_marker'::regclass,
      'public.transcript_turn'::regclass,
      'public.public_demo_rate_limit'::regclass,
      'public.public_demo_session'::regclass
    )
      AND (
        pg_catalog.pg_get_userbyid(relowner) <> canonical_table_owner
        OR NOT relrowsecurity
        OR relforcerowsecurity
      )
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_table_postflight_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'analytics_consent_metadata_check'
      AND contype = 'c'
      AND convalidated
      AND pg_catalog.pg_get_constraintdef(oid)
        LIKE '%analytics_consent_revision%'
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_consent_postflight_failed';
  END IF;

  IF (
    SELECT pg_catalog.count(*) <> 6
      OR pg_catalog.bool_or(proc.prosecdef)
      OR pg_catalog.bool_or(
        proc.proconfig IS DISTINCT FROM ARRAY['search_path=public']
      )
      OR pg_catalog.bool_or(
        pg_catalog.pg_get_userbyid(proc.proowner) <> canonical_table_owner
      )
    FROM pg_catalog.pg_proc proc
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname IN (
        'reserve_public_demo_session',
        'complete_public_demo_session',
        'finalize_public_demo_recovery_token',
        'rollback_public_demo_recovery_token',
        'fail_public_demo_recovery_session',
        'prune_public_demo_abuse_data'
      )
  ) THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_function_postflight_failed';
  END IF;

  WITH expected(
    function_name, identity_arguments, body_hash, result_type
  ) AS (
    VALUES
      (
        'reserve_public_demo_session',
        'requested_session_id uuid, requested_deployment_scope text, ip_identifier_hash text, device_identifier_hash text',
        '1957461c7311ca977608b0c1d1b90545',
        'TABLE(decision text, room_name text, limiting_scope text, retry_after_seconds integer, remaining integer, recovery_claim_token uuid, deadline_at timestamp with time zone)'
      ),
      (
        'complete_public_demo_session',
        'completed_session_id uuid, completed_status text, safe_failure_code text',
        '5f976b37ae2136112e4e1a2638be8f48',
        'boolean'
      ),
      (
        'finalize_public_demo_recovery_token',
        'completed_session_id uuid, completed_claim_token uuid',
        'b6b016769dc140b29ef2fd4a45bf1628',
        'boolean'
      ),
      (
        'rollback_public_demo_recovery_token',
        'failed_session_id uuid, failed_claim_token uuid',
        '26afe0bc6575c79896c67c9524009351',
        'boolean'
      ),
      (
        'fail_public_demo_recovery_session',
        'failed_session_id uuid, failed_claim_token uuid, safe_failure_code text',
        'da76b3e25526015373c7c9d12913dec5',
        'boolean'
      ),
      (
        'prune_public_demo_abuse_data',
        '',
        '8b4586ed2d3d4e9302a4e0f0840f1e28',
        'TABLE(deleted_sessions integer, deleted_limits integer)'
      )
  )
  SELECT pg_catalog.count(*) = 6
    AND pg_catalog.count(proc.oid) = 6
    AND pg_catalog.bool_and(
      pg_catalog.pg_get_function_identity_arguments(proc.oid)
        = expected.identity_arguments
      AND pg_catalog.md5(proc.prosrc) = expected.body_hash
      AND pg_catalog.pg_get_function_result(proc.oid) = expected.result_type
      AND NOT proc.prosecdef
      AND proc.proconfig = ARRAY['search_path=public']
      AND pg_catalog.pg_get_userbyid(proc.proowner) = canonical_table_owner
    )
    INTO function_contract_match
  FROM expected
  LEFT JOIN pg_catalog.pg_proc proc
    ON proc.proname = expected.function_name
   AND proc.pronamespace = 'public'::regnamespace;

  IF NOT COALESCE(function_contract_match, false)
    OR (
      SELECT pg_catalog.count(*) <> 6
        OR pg_catalog.bool_or(is_grantable <> 'NO')
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN (
          'reserve_public_demo_session',
          'complete_public_demo_session',
          'finalize_public_demo_recovery_token',
          'rollback_public_demo_recovery_token',
          'fail_public_demo_recovery_session',
          'prune_public_demo_abuse_data'
        )
        AND grantee = 'service_role'
        AND privilege_type = 'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges privileges
      JOIN pg_catalog.pg_proc proc
        ON proc.proname = privileges.routine_name
       AND proc.pronamespace = 'public'::regnamespace
      WHERE privileges.routine_schema = 'public'
        AND privileges.routine_name IN (
          'reserve_public_demo_session',
          'complete_public_demo_session',
          'finalize_public_demo_recovery_token',
          'rollback_public_demo_recovery_token',
          'fail_public_demo_recovery_session',
          'prune_public_demo_abuse_data'
        )
        AND privileges.grantee NOT IN (
          'service_role',
          pg_catalog.pg_get_userbyid(proc.proowner)
        )
    )
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_function_contract_postflight_failed';
  END IF;

  IF pg_catalog.pg_get_function_result(
    pg_catalog.to_regprocedure(
      'public.reserve_public_demo_session(uuid,text,text,text)'
    )
  ) NOT LIKE '%deadline_at%'
    OR pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.reserve_public_demo_session(uuid,text,text,text)'
      )
    ) NOT LIKE '%deadline_at := now_at + interval ''2 minutes''%'
    OR pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.complete_public_demo_session(uuid,text,text)'
      )
    ) NOT LIKE '%active_expires_at >= now_at + interval ''5 seconds''%'
    OR pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.finalize_public_demo_recovery_token(uuid,uuid)'
      )
    ) NOT LIKE '%active_expires_at >= now_at + interval ''5 seconds''%'
    OR pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.fail_public_demo_recovery_session(uuid,uuid,text)'
      )
    ) NOT LIKE '%recovery_claim_token = NULL%'
  THEN
    RAISE EXCEPTION 'preview_lineage_reconciliation_function_body_postflight_failed';
  END IF;

  PERFORM pg_catalog.set_config('search_path', original_search_path, true);
END
$preview_lineage_reconciliation_postflight$;
