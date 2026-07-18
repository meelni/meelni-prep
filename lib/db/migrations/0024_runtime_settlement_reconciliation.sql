DO $runtime_settlement_reconciliation$
DECLARE
  has_writer_table boolean;
  has_settlement_generation boolean;
  has_turn_generation boolean;
  has_marker_generation boolean;
  current_columns_match boolean;
  current_constraints_match boolean;
  current_indexes_match boolean;
  current_policies_match boolean;
  current_grants_match boolean;
  legacy_columns_match boolean;
  legacy_constraints_match boolean;
  legacy_indexes_match boolean;
  legacy_evidence_columns_match boolean;
  legacy_turn_contract_match boolean;
  legacy_policy_match boolean;
  legacy_grants_match boolean;
  legacy_settlement_rows bigint;
  legacy_canonical_turn_rows bigint;
  legacy_marker_rows bigint;
  runtime_ledger_rows integer;
  runtime_ledger_hash text;
  reconciliation_attempted boolean := false;
BEGIN
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog, public', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(664882365002400013::bigint);

  SELECT pg_catalog.count(*)::integer, pg_catalog.min(hash)
    INTO runtime_ledger_rows, runtime_ledger_hash
  FROM drizzle.__drizzle_migrations
  WHERE created_at = 1783892420196;
  IF runtime_ledger_rows <> 1
    OR runtime_ledger_hash NOT IN (
      '39a7508699f29fb5ab5619088ca09d900d49f9b5afac9b86e64c0db894b372e2',
      '0a27cbb7e47147f2dc6aa653c48a1fa4edbcc8c4a5acb89a74a1cbe433822099'
    ) THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_unknown_ledger';
  END IF;

  SELECT pg_catalog.to_regclass('public.transcript_runtime_writer') IS NOT NULL
    INTO has_writer_table;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_settlement'
      AND column_name = 'writer_generation'
  ) INTO has_settlement_generation;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_turn'
      AND column_name = 'writer_generation'
  ) INTO has_turn_generation;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_interruption_marker'
      AND column_name = 'writer_generation'
  ) INTO has_marker_generation;

  IF pg_catalog.to_regclass('public.transcript_runtime_settlement') IS NULL
    OR pg_catalog.to_regclass('public.transcript_turn') IS NULL
    OR pg_catalog.to_regclass('public.transcript_interruption_marker') IS NULL
    OR pg_catalog.to_regclass('public.interview_session') IS NULL THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_missing_shape';
  END IF;

  LOCK TABLE
    public.transcript_runtime_settlement,
    public.transcript_turn,
    public.transcript_interruption_marker
    IN ACCESS EXCLUSIVE MODE;
  IF has_writer_table THEN
    LOCK TABLE public.transcript_runtime_writer IN ACCESS EXCLUSIVE MODE;
  END IF;

  LOOP
  IF has_writer_table
    AND has_settlement_generation
    AND has_turn_generation
    AND has_marker_generation THEN
    SELECT
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            column_name,
            data_type,
            udt_name,
            is_nullable,
            COALESCE(column_default, '')
          ) ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transcript_runtime_writer'
      ) = '[
        ["session_id", "uuid", "uuid", "NO", ""],
        ["generation", "integer", "int4", "NO", ""],
        ["contract_version", "integer", "int4", "NO", ""],
        ["room_name", "text", "text", "NO", ""],
        ["writer_id", "text", "text", "NO", ""],
        ["registered_at", "timestamp with time zone", "timestamptz", "NO", ""],
        ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"]
      ]'::jsonb
      AND (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            column_name,
            data_type,
            udt_name,
            is_nullable,
            COALESCE(column_default, '')
          ) ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transcript_runtime_settlement'
      ) = '[
        ["session_id", "uuid", "uuid", "NO", ""],
        ["writer_generation", "integer", "int4", "NO", ""],
        ["contract_version", "integer", "int4", "NO", ""],
        ["room_name", "text", "text", "NO", ""],
        ["writer_id", "text", "text", "NO", ""],
        ["state", "text", "text", "NO", ""],
        ["settled_at", "timestamp with time zone", "timestamptz", "NO", ""],
        ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"]
      ]'::jsonb
      AND (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            column_name, data_type, udt_name, is_nullable,
            COALESCE(column_default, '')
          ) ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transcript_turn'
      ) = '[
        ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
        ["session_id", "uuid", "uuid", "NO", ""],
        ["speaker", "text", "text", "NO", ""],
        ["started_at", "timestamp with time zone", "timestamptz", "YES", ""],
        ["ended_at", "timestamp with time zone", "timestamptz", "YES", ""],
        ["text", "text", "text", "YES", ""],
        ["audio_ms", "integer", "int4", "YES", ""],
        ["latency_ms", "integer", "int4", "YES", ""],
        ["section", "text", "text", "YES", ""],
        ["contract_version", "integer", "int4", "YES", ""],
        ["event_id", "text", "text", "YES", ""],
        ["writer_id", "text", "text", "YES", ""],
        ["sequence", "bigint", "int8", "YES", ""],
        ["room_name", "text", "text", "YES", ""],
        ["delivery_state", "text", "text", "YES", ""],
        ["writer_generation", "integer", "int4", "YES", ""]
      ]'::jsonb
      AND (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_array(
            column_name, data_type, udt_name, is_nullable,
            COALESCE(column_default, '')
          ) ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transcript_interruption_marker'
      ) = '[
        ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
        ["session_id", "uuid", "uuid", "NO", ""],
        ["contract_version", "integer", "int4", "NO", ""],
        ["event_id", "text", "text", "NO", ""],
        ["writer_id", "text", "text", "NO", ""],
        ["sequence", "bigint", "int8", "NO", ""],
        ["room_name", "text", "text", "NO", ""],
        ["speaker", "text", "text", "NO", ""],
        ["occurred_at", "timestamp with time zone", "timestamptz", "NO", ""],
        ["reason", "text", "text", "NO", ""],
        ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"],
        ["writer_generation", "integer", "int4", "NO", ""]
      ]'::jsonb
      INTO current_columns_match;

    WITH expected(table_name, constraint_name, definition) AS (
      VALUES
        ('transcript_runtime_writer', 'transcript_runtime_writer_pkey', 'PRIMARY KEY (session_id, generation)'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_contract_check', 'CHECK ((contract_version = 1))'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_generation_check', 'CHECK ((generation > 0))'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_session_id_interview_session_id_fk', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_pkey', 'PRIMARY KEY (session_id, writer_generation)'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_contract_check', 'CHECK ((contract_version = 1))'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_state_check', 'CHECK ((state = ANY (ARRAY[''settled''::text, ''degraded''::text])))'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_writer_generation_check', 'CHECK ((writer_generation > 0))'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_session_id_interview_session_id_f', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_writer_fk', 'FOREIGN KEY (session_id, writer_generation, writer_id) REFERENCES transcript_runtime_writer(session_id, generation, writer_id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_pkey', 'PRIMARY KEY (id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_contract_check', 'CHECK ((contract_version = 1))'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_speaker_check', 'CHECK ((speaker = ANY (ARRAY[''user''::text, ''interviewer''::text])))'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_sequence_check', 'CHECK ((sequence > 0))'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_reason_check', 'CHECK ((reason = ANY (ARRAY[''no_provider_confirmed_prefix''::text, ''canonicalization_failed''::text])))'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_session_id_interview_session_id_', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_runtime_writer_fk', 'FOREIGN KEY (session_id, writer_generation, writer_id) REFERENCES transcript_runtime_writer(session_id, generation, writer_id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_writer_generation_check', 'CHECK ((writer_generation > 0))'),
        ('transcript_turn', 'transcript_turn_pkey', 'PRIMARY KEY (id)'),
        ('transcript_turn', 'speaker_check', 'CHECK ((speaker = ANY (ARRAY[''user''::text, ''interviewer''::text])))'),
        ('transcript_turn', 'transcript_turn_contract_version_check', 'CHECK (((contract_version IS NULL) OR (contract_version = 2)))'),
        ('transcript_turn', 'transcript_turn_sequence_check', 'CHECK (((sequence IS NULL) OR (sequence > 0)))'),
        ('transcript_turn', 'transcript_turn_delivery_state_check', 'CHECK (((delivery_state IS NULL) OR (delivery_state = ANY (ARRAY[''delivered''::text, ''partially_delivered''::text]))))'),
        ('transcript_turn', 'transcript_turn_session_id_interview_session_id_fk', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
        ('transcript_turn', 'transcript_turn_runtime_writer_fk', 'FOREIGN KEY (session_id, writer_generation, writer_id) REFERENCES transcript_runtime_writer(session_id, generation, writer_id)'),
        ('transcript_turn', 'transcript_turn_canonical_identity_check', 'CHECK ((((contract_version IS NULL) AND (event_id IS NULL) AND (writer_id IS NULL) AND (writer_generation IS NULL) AND (sequence IS NULL) AND (room_name IS NULL) AND (delivery_state IS NULL)) OR ((contract_version = 2) AND (event_id IS NOT NULL) AND (writer_id IS NOT NULL) AND (writer_generation IS NOT NULL) AND (sequence IS NOT NULL) AND (room_name IS NOT NULL) AND (started_at IS NOT NULL) AND (ended_at IS NOT NULL) AND (text IS NOT NULL) AND (audio_ms IS NOT NULL) AND (section IS NOT NULL) AND (delivery_state IS NOT NULL))))')
    )
    SELECT pg_catalog.count(*) = 26
      AND pg_catalog.count(c.oid) = 26
      AND pg_catalog.bool_and(
        pg_catalog.pg_get_constraintdef(c.oid) = expected.definition
      )
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint all_constraints
        WHERE all_constraints.conrelid IN (
          'public.transcript_runtime_writer'::regclass,
          'public.transcript_runtime_settlement'::regclass,
          'public.transcript_interruption_marker'::regclass,
          'public.transcript_turn'::regclass
        )
      ) = 26
      INTO current_constraints_match
    FROM expected
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.relname = expected.table_name
     AND relation.relnamespace = 'public'::regnamespace
    LEFT JOIN pg_catalog.pg_constraint c
      ON c.conrelid = relation.oid
     AND c.conname = expected.constraint_name;

    WITH expected(table_name, index_name, definition) AS (
      VALUES
        ('transcript_runtime_writer', 'transcript_runtime_writer_pkey', 'CREATE UNIQUE INDEX transcript_runtime_writer_pkey ON public.transcript_runtime_writer USING btree (session_id, generation)'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_session_writer_idx', 'CREATE UNIQUE INDEX transcript_runtime_writer_session_writer_idx ON public.transcript_runtime_writer USING btree (session_id, writer_id)'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_identity_idx', 'CREATE UNIQUE INDEX transcript_runtime_writer_identity_idx ON public.transcript_runtime_writer USING btree (session_id, generation, writer_id)'),
        ('transcript_runtime_writer', 'transcript_runtime_writer_room_generation_idx', 'CREATE INDEX transcript_runtime_writer_room_generation_idx ON public.transcript_runtime_writer USING btree (room_name, generation)'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_pkey', 'CREATE UNIQUE INDEX transcript_runtime_settlement_pkey ON public.transcript_runtime_settlement USING btree (session_id, writer_generation)'),
        ('transcript_runtime_settlement', 'transcript_runtime_settlement_room_settled_at_idx', 'CREATE INDEX transcript_runtime_settlement_room_settled_at_idx ON public.transcript_runtime_settlement USING btree (room_name, settled_at)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_pkey', 'CREATE UNIQUE INDEX transcript_interruption_marker_pkey ON public.transcript_interruption_marker USING btree (id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_event_id_idx', 'CREATE UNIQUE INDEX transcript_interruption_marker_event_id_idx ON public.transcript_interruption_marker USING btree (event_id)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_session_writer_sequence_idx', 'CREATE UNIQUE INDEX transcript_interruption_marker_session_writer_sequence_idx ON public.transcript_interruption_marker USING btree (session_id, writer_id, sequence)'),
        ('transcript_interruption_marker', 'transcript_interruption_marker_session_occurred_at_idx', 'CREATE INDEX transcript_interruption_marker_session_occurred_at_idx ON public.transcript_interruption_marker USING btree (session_id, occurred_at)'),
        ('transcript_turn', 'transcript_turn_pkey', 'CREATE UNIQUE INDEX transcript_turn_pkey ON public.transcript_turn USING btree (id)'),
        ('transcript_turn', 'transcript_turn_event_id_idx', 'CREATE UNIQUE INDEX transcript_turn_event_id_idx ON public.transcript_turn USING btree (event_id) WHERE (event_id IS NOT NULL)'),
        ('transcript_turn', 'transcript_turn_session_writer_sequence_idx', 'CREATE UNIQUE INDEX transcript_turn_session_writer_sequence_idx ON public.transcript_turn USING btree (session_id, writer_id, sequence) WHERE ((writer_id IS NOT NULL) AND (sequence IS NOT NULL))'),
        ('transcript_turn', 'transcript_turn_chronological_idx', 'CREATE INDEX transcript_turn_chronological_idx ON public.transcript_turn USING btree (session_id, started_at, writer_generation, writer_id, sequence, event_id, id)')
    )
    SELECT pg_catalog.count(*) = 14
      AND pg_catalog.count(indexes.indexname) = 14
      AND pg_catalog.bool_and(indexes.indexdef = expected.definition)
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_indexes all_indexes
        WHERE all_indexes.schemaname = 'public'
          AND all_indexes.tablename IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn'
          )
      ) = 14
      INTO current_indexes_match
    FROM expected
    LEFT JOIN pg_catalog.pg_indexes indexes
      ON indexes.schemaname = 'public'
     AND indexes.tablename = expected.table_name
     AND indexes.indexname = expected.index_name;

    WITH expected(
      table_name, policy_name, roles, command, qualifier, check_expression
    ) AS (
      VALUES
        ('transcript_runtime_writer', 'Service role has full access to transcript_runtime_writer', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
        ('transcript_runtime_settlement', 'Service role has full access to transcript_runtime_settlement', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
        ('transcript_interruption_marker', 'Service role has full access to transcript_interruption_marker', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
        ('transcript_turn', 'Service role has full access to transcript_turn', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
        ('transcript_turn', 'Users can view own transcript turns', ARRAY['authenticated']::name[], 'SELECT', '(EXISTS ( SELECT 1 FROM interview_session WHERE ((interview_session.id = transcript_turn.session_id) AND (interview_session.user_id = auth.uid()))))', NULL)
    )
    SELECT pg_catalog.count(*) = 5
      AND pg_catalog.count(policies.policyname) = 5
      AND pg_catalog.bool_and(
        policies.roles = expected.roles
        AND policies.cmd = expected.command
        AND pg_catalog.regexp_replace(
          policies.qual, '[[:space:]]+', ' ', 'g'
        ) = expected.qualifier
        AND pg_catalog.regexp_replace(
          policies.with_check, '[[:space:]]+', ' ', 'g'
        ) IS NOT DISTINCT FROM expected.check_expression
      )
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies all_policies
        WHERE all_policies.schemaname = 'public'
          AND all_policies.tablename IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn'
          )
      ) = 5
      INTO current_policies_match
    FROM expected
    LEFT JOIN pg_catalog.pg_policies policies
      ON policies.schemaname = 'public'
     AND policies.tablename = expected.table_name
     AND policies.policyname = expected.policy_name;

    SELECT
      NOT EXISTS (
        SELECT 1 FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn'
          )
          AND grantee IN ('PUBLIC', 'anon')
      )
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker'
          )
          AND grantee = 'authenticated'
      )
      AND (
        SELECT pg_catalog.count(*) FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn'
          )
          AND grantee = 'service_role'
      ) = 28
      AND (
        SELECT pg_catalog.count(*) FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name IN (
            'transcript_runtime_writer',
            'transcript_runtime_settlement',
            'transcript_interruption_marker',
            'transcript_turn'
          )
          AND grantee = 'authenticated'
      ) = 1
      INTO current_grants_match;

    IF NOT current_columns_match
      OR NOT current_constraints_match
      OR NOT current_indexes_match
      OR NOT current_policies_match
      OR NOT current_grants_match
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = 'public.transcript_runtime_writer'::regclass
          AND relrowsecurity
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = 'public.transcript_runtime_settlement'::regclass
          AND relrowsecurity
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = 'public.transcript_interruption_marker'::regclass
          AND relrowsecurity
      )
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE oid = 'public.transcript_turn'::regclass
          AND relrowsecurity
      ) THEN
      RAISE EXCEPTION 'runtime_settlement_reconciliation_partial_current_shape';
    END IF;

    RETURN;
  END IF;

  IF has_writer_table
    OR has_settlement_generation
    OR has_turn_generation
    OR has_marker_generation THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_mixed_shape';
  END IF;

  IF runtime_ledger_hash <>
    '39a7508699f29fb5ab5619088ca09d900d49f9b5afac9b86e64c0db894b372e2' THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_legacy_shape_with_current_ledger';
  END IF;

  IF reconciliation_attempted THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_postcondition_failed';
  END IF;
  reconciliation_attempted := true;

  SELECT (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        column_name,
        data_type,
        udt_name,
        is_nullable,
        COALESCE(column_default, '')
      ) ORDER BY ordinal_position
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_settlement'
  ) = '[
    ["session_id", "uuid", "uuid", "NO", ""],
    ["contract_version", "integer", "int4", "NO", ""],
    ["room_name", "text", "text", "NO", ""],
    ["writer_id", "text", "text", "NO", ""],
    ["state", "text", "text", "NO", ""],
    ["settled_at", "timestamp with time zone", "timestamptz", "NO", ""],
    ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"]
  ]'::jsonb
  INTO legacy_columns_match;

  SELECT
    (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          column_name, data_type, udt_name, is_nullable,
          COALESCE(column_default, '')
        ) ORDER BY ordinal_position
      )
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transcript_interruption_marker'
    ) = '[
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["session_id", "uuid", "uuid", "NO", ""],
      ["contract_version", "integer", "int4", "NO", ""],
      ["event_id", "text", "text", "NO", ""],
      ["writer_id", "text", "text", "NO", ""],
      ["sequence", "bigint", "int8", "NO", ""],
      ["room_name", "text", "text", "NO", ""],
      ["speaker", "text", "text", "NO", ""],
      ["occurred_at", "timestamp with time zone", "timestamptz", "NO", ""],
      ["reason", "text", "text", "NO", ""],
      ["created_at", "timestamp with time zone", "timestamptz", "NO", "now()"]
    ]'::jsonb
    AND (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          column_name, data_type, udt_name, is_nullable,
          COALESCE(column_default, '')
        ) ORDER BY ordinal_position
      )
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transcript_turn'
    ) = '[
      ["id", "uuid", "uuid", "NO", "gen_random_uuid()"],
      ["session_id", "uuid", "uuid", "NO", ""],
      ["speaker", "text", "text", "NO", ""],
      ["started_at", "timestamp with time zone", "timestamptz", "YES", ""],
      ["ended_at", "timestamp with time zone", "timestamptz", "YES", ""],
      ["text", "text", "text", "YES", ""],
      ["audio_ms", "integer", "int4", "YES", ""],
      ["latency_ms", "integer", "int4", "YES", ""],
      ["section", "text", "text", "YES", ""],
      ["contract_version", "integer", "int4", "YES", ""],
      ["event_id", "text", "text", "YES", ""],
      ["writer_id", "text", "text", "YES", ""],
      ["sequence", "bigint", "int8", "YES", ""],
      ["room_name", "text", "text", "YES", ""],
      ["delivery_state", "text", "text", "YES", ""]
    ]'::jsonb
    INTO legacy_evidence_columns_match;

  WITH expected(table_name, constraint_name, definition) AS (
    VALUES
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_pkey', 'PRIMARY KEY (session_id)'),
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_contract_check', 'CHECK ((contract_version = 1))'),
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_state_check', 'CHECK ((state = ANY (ARRAY[''settled''::text, ''degraded''::text])))'),
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_session_id_interview_session_id_f', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_pkey', 'PRIMARY KEY (id)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_contract_check', 'CHECK ((contract_version = 1))'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_speaker_check', 'CHECK ((speaker = ANY (ARRAY[''user''::text, ''interviewer''::text])))'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_sequence_check', 'CHECK ((sequence > 0))'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_reason_check', 'CHECK ((reason = ANY (ARRAY[''no_provider_confirmed_prefix''::text, ''canonicalization_failed''::text])))'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_session_id_interview_session_id_', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
      ('transcript_turn', 'transcript_turn_pkey', 'PRIMARY KEY (id)'),
      ('transcript_turn', 'speaker_check', 'CHECK ((speaker = ANY (ARRAY[''user''::text, ''interviewer''::text])))'),
      ('transcript_turn', 'transcript_turn_contract_version_check', 'CHECK (((contract_version IS NULL) OR (contract_version = 2)))'),
      ('transcript_turn', 'transcript_turn_sequence_check', 'CHECK (((sequence IS NULL) OR (sequence > 0)))'),
      ('transcript_turn', 'transcript_turn_delivery_state_check', 'CHECK (((delivery_state IS NULL) OR (delivery_state = ANY (ARRAY[''delivered''::text, ''partially_delivered''::text]))))'),
      ('transcript_turn', 'transcript_turn_session_id_interview_session_id_fk', 'FOREIGN KEY (session_id) REFERENCES interview_session(id)'),
      ('transcript_turn', 'transcript_turn_canonical_identity_check', 'CHECK ((((contract_version IS NULL) AND (event_id IS NULL) AND (writer_id IS NULL) AND (sequence IS NULL) AND (room_name IS NULL) AND (delivery_state IS NULL)) OR ((contract_version = 2) AND (event_id IS NOT NULL) AND (writer_id IS NOT NULL) AND (sequence IS NOT NULL) AND (room_name IS NOT NULL) AND (started_at IS NOT NULL) AND (ended_at IS NOT NULL) AND (text IS NOT NULL) AND (audio_ms IS NOT NULL) AND (section IS NOT NULL) AND (delivery_state IS NOT NULL))))')
  )
  SELECT pg_catalog.count(*) = 17
    AND pg_catalog.count(c.oid) = 17
    AND pg_catalog.bool_and(
      pg_catalog.pg_get_constraintdef(c.oid) = expected.definition
    )
    AND (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint all_constraints
      WHERE all_constraints.conrelid IN (
        'public.transcript_runtime_settlement'::regclass,
        'public.transcript_interruption_marker'::regclass,
        'public.transcript_turn'::regclass
      )
    ) = 17
    INTO legacy_constraints_match
  FROM expected
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relname = expected.table_name
   AND relation.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conrelid = relation.oid
   AND c.conname = expected.constraint_name;

  WITH expected(table_name, index_name, definition) AS (
    VALUES
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_pkey', 'CREATE UNIQUE INDEX transcript_runtime_settlement_pkey ON public.transcript_runtime_settlement USING btree (session_id)'),
      ('transcript_runtime_settlement', 'transcript_runtime_settlement_room_settled_at_idx', 'CREATE INDEX transcript_runtime_settlement_room_settled_at_idx ON public.transcript_runtime_settlement USING btree (room_name, settled_at)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_pkey', 'CREATE UNIQUE INDEX transcript_interruption_marker_pkey ON public.transcript_interruption_marker USING btree (id)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_event_id_idx', 'CREATE UNIQUE INDEX transcript_interruption_marker_event_id_idx ON public.transcript_interruption_marker USING btree (event_id)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_session_writer_sequence_idx', 'CREATE UNIQUE INDEX transcript_interruption_marker_session_writer_sequence_idx ON public.transcript_interruption_marker USING btree (session_id, writer_id, sequence)'),
      ('transcript_interruption_marker', 'transcript_interruption_marker_session_occurred_at_idx', 'CREATE INDEX transcript_interruption_marker_session_occurred_at_idx ON public.transcript_interruption_marker USING btree (session_id, occurred_at)'),
      ('transcript_turn', 'transcript_turn_pkey', 'CREATE UNIQUE INDEX transcript_turn_pkey ON public.transcript_turn USING btree (id)'),
      ('transcript_turn', 'transcript_turn_event_id_idx', 'CREATE UNIQUE INDEX transcript_turn_event_id_idx ON public.transcript_turn USING btree (event_id) WHERE (event_id IS NOT NULL)'),
      ('transcript_turn', 'transcript_turn_session_writer_sequence_idx', 'CREATE UNIQUE INDEX transcript_turn_session_writer_sequence_idx ON public.transcript_turn USING btree (session_id, writer_id, sequence) WHERE ((writer_id IS NOT NULL) AND (sequence IS NOT NULL))'),
      ('transcript_turn', 'transcript_turn_chronological_idx', 'CREATE INDEX transcript_turn_chronological_idx ON public.transcript_turn USING btree (session_id, started_at, writer_id, sequence)')
  )
  SELECT pg_catalog.count(*) = 10
    AND pg_catalog.count(indexes.indexname) = 10
    AND pg_catalog.bool_and(indexes.indexdef = expected.definition)
    AND (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_indexes all_indexes
      WHERE all_indexes.schemaname = 'public'
        AND all_indexes.tablename IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn'
        )
    ) = 10
    INTO legacy_indexes_match
  FROM expected
  LEFT JOIN pg_catalog.pg_indexes indexes
    ON indexes.schemaname = 'public'
   AND indexes.tablename = expected.table_name
   AND indexes.indexname = expected.index_name;

  legacy_turn_contract_match := true;

  WITH expected(
    table_name, policy_name, roles, command, qualifier, check_expression
  ) AS (
    VALUES
      ('transcript_runtime_settlement', 'Service role has full access to transcript_runtime_settlement', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
      ('transcript_interruption_marker', 'Service role has full access to transcript_interruption_marker', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
      ('transcript_turn', 'Service role has full access to transcript_turn', ARRAY['service_role']::name[], 'ALL', 'true', 'true'),
      ('transcript_turn', 'Users can view own transcript turns', ARRAY['authenticated']::name[], 'SELECT', '(EXISTS ( SELECT 1 FROM interview_session WHERE ((interview_session.id = transcript_turn.session_id) AND (interview_session.user_id = auth.uid()))))', NULL)
  )
  SELECT pg_catalog.count(*) = 4
    AND pg_catalog.count(policies.policyname) = 4
    AND pg_catalog.bool_and(
      policies.roles = expected.roles
      AND policies.cmd = expected.command
      AND pg_catalog.regexp_replace(
        policies.qual, '[[:space:]]+', ' ', 'g'
      ) = expected.qualifier
      AND pg_catalog.regexp_replace(
        policies.with_check, '[[:space:]]+', ' ', 'g'
      ) IS NOT DISTINCT FROM expected.check_expression
    )
    AND (
      SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies all_policies
      WHERE all_policies.schemaname = 'public'
        AND all_policies.tablename IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn'
        )
    ) = 4
    INTO legacy_policy_match
  FROM expected
  LEFT JOIN pg_catalog.pg_policies policies
    ON policies.schemaname = 'public'
   AND policies.tablename = expected.table_name
   AND policies.policyname = expected.policy_name;

  SELECT
    NOT EXISTS (
      SELECT 1 FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn'
        )
        AND grantee IN ('PUBLIC', 'anon')
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker'
        )
        AND grantee = 'authenticated'
    )
    AND (
      SELECT pg_catalog.count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn'
        )
        AND grantee = 'service_role'
    ) = 21
    AND (
      SELECT pg_catalog.count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN (
          'transcript_runtime_settlement',
          'transcript_interruption_marker',
          'transcript_turn'
        )
        AND grantee = 'authenticated'
    ) = 1
    INTO legacy_grants_match;

  IF NOT legacy_columns_match
    OR NOT legacy_evidence_columns_match
    OR NOT legacy_constraints_match
    OR NOT legacy_indexes_match
    OR NOT legacy_turn_contract_match
    OR NOT legacy_policy_match
    OR NOT legacy_grants_match
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.transcript_runtime_settlement'::regclass
        AND relrowsecurity
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.transcript_interruption_marker'::regclass
        AND relrowsecurity
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.transcript_turn'::regclass
        AND relrowsecurity
    ) THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_unknown_legacy_shape';
  END IF;

  SELECT pg_catalog.count(*) INTO legacy_settlement_rows
  FROM public.transcript_runtime_settlement;
  SELECT pg_catalog.count(*) INTO legacy_canonical_turn_rows
  FROM public.transcript_turn
  WHERE contract_version = 2;
  SELECT pg_catalog.count(*) INTO legacy_marker_rows
  FROM public.transcript_interruption_marker;

  IF legacy_settlement_rows <> 0
    OR legacy_canonical_turn_rows <> 0
    OR legacy_marker_rows <> 0 THEN
    RAISE EXCEPTION 'runtime_settlement_reconciliation_nonempty_legacy_evidence';
  END IF;

  CREATE TABLE public.transcript_runtime_writer (
    session_id uuid NOT NULL,
    generation integer NOT NULL,
    contract_version integer NOT NULL,
    room_name text NOT NULL,
    writer_id text NOT NULL,
    registered_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
    CONSTRAINT transcript_runtime_writer_pkey
      PRIMARY KEY (session_id, generation),
    CONSTRAINT transcript_runtime_writer_contract_check
      CHECK (contract_version = 1),
    CONSTRAINT transcript_runtime_writer_generation_check
      CHECK (generation > 0)
  );

  ALTER TABLE public.transcript_turn
    DROP CONSTRAINT transcript_turn_canonical_identity_check;
  DROP INDEX public.transcript_turn_chronological_idx;
  ALTER TABLE public.transcript_interruption_marker
    ADD COLUMN writer_generation integer;
  ALTER TABLE public.transcript_turn
    ADD COLUMN writer_generation integer;
  ALTER TABLE public.transcript_interruption_marker
    ALTER COLUMN writer_generation SET NOT NULL;

  DROP TABLE public.transcript_runtime_settlement;
  CREATE TABLE public.transcript_runtime_settlement (
    session_id uuid NOT NULL,
    writer_generation integer NOT NULL,
    contract_version integer NOT NULL,
    room_name text NOT NULL,
    writer_id text NOT NULL,
    state text NOT NULL,
    settled_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
    CONSTRAINT transcript_runtime_settlement_pkey
      PRIMARY KEY (session_id, writer_generation),
    CONSTRAINT transcript_runtime_settlement_contract_check
      CHECK (contract_version = 1),
    CONSTRAINT transcript_runtime_settlement_state_check
      CHECK (state IN ('settled', 'degraded')),
    CONSTRAINT transcript_runtime_settlement_writer_generation_check
      CHECK (writer_generation > 0)
  );

  CREATE UNIQUE INDEX transcript_runtime_writer_session_writer_idx
    ON public.transcript_runtime_writer (session_id, writer_id);
  CREATE UNIQUE INDEX transcript_runtime_writer_identity_idx
    ON public.transcript_runtime_writer (session_id, generation, writer_id);
  CREATE INDEX transcript_runtime_writer_room_generation_idx
    ON public.transcript_runtime_writer (room_name, generation);

  ALTER TABLE public.transcript_runtime_settlement
    ADD CONSTRAINT transcript_runtime_settlement_session_id_interview_session_id_fk
      FOREIGN KEY (session_id) REFERENCES public.interview_session(id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  ALTER TABLE public.transcript_runtime_settlement
    ADD CONSTRAINT transcript_runtime_settlement_writer_fk
      FOREIGN KEY (session_id, writer_generation, writer_id)
      REFERENCES public.transcript_runtime_writer(session_id, generation, writer_id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  ALTER TABLE public.transcript_runtime_writer
    ADD CONSTRAINT transcript_runtime_writer_session_id_interview_session_id_fk
      FOREIGN KEY (session_id) REFERENCES public.interview_session(id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  ALTER TABLE public.transcript_interruption_marker
    ADD CONSTRAINT transcript_interruption_marker_runtime_writer_fk
      FOREIGN KEY (session_id, writer_generation, writer_id)
      REFERENCES public.transcript_runtime_writer(session_id, generation, writer_id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  ALTER TABLE public.transcript_turn
    ADD CONSTRAINT transcript_turn_runtime_writer_fk
      FOREIGN KEY (session_id, writer_generation, writer_id)
      REFERENCES public.transcript_runtime_writer(session_id, generation, writer_id)
      ON DELETE NO ACTION ON UPDATE NO ACTION;

  CREATE INDEX transcript_runtime_settlement_room_settled_at_idx
    ON public.transcript_runtime_settlement (room_name, settled_at);
  CREATE INDEX transcript_turn_chronological_idx
    ON public.transcript_turn (
      session_id,
      started_at,
      writer_generation,
      writer_id,
      sequence,
      event_id,
      id
    );

  ALTER TABLE public.transcript_interruption_marker
    ADD CONSTRAINT transcript_interruption_marker_writer_generation_check
      CHECK (writer_generation > 0);
  ALTER TABLE public.transcript_turn
    ADD CONSTRAINT transcript_turn_canonical_identity_check CHECK ((
      contract_version IS NULL AND
      event_id IS NULL AND
      writer_id IS NULL AND
      writer_generation IS NULL AND
      sequence IS NULL AND
      room_name IS NULL AND
      delivery_state IS NULL
    ) OR (
      contract_version = 2 AND
      event_id IS NOT NULL AND
      writer_id IS NOT NULL AND
      writer_generation IS NOT NULL AND
      sequence IS NOT NULL AND
      room_name IS NOT NULL AND
      started_at IS NOT NULL AND
      ended_at IS NOT NULL AND
      text IS NOT NULL AND
      audio_ms IS NOT NULL AND
      section IS NOT NULL AND
      delivery_state IS NOT NULL
    ));

  ALTER TABLE public.transcript_runtime_writer ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.transcript_runtime_settlement ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.transcript_runtime_writer
    FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE public.transcript_runtime_writer TO service_role;
  REVOKE ALL ON TABLE public.transcript_runtime_settlement
    FROM PUBLIC, anon, authenticated;
  GRANT ALL ON TABLE public.transcript_runtime_settlement TO service_role;

  CREATE POLICY "Service role has full access to transcript_runtime_writer"
    ON public.transcript_runtime_writer
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  CREATE POLICY "Service role has full access to transcript_runtime_settlement"
    ON public.transcript_runtime_settlement
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

  SELECT pg_catalog.to_regclass('public.transcript_runtime_writer') IS NOT NULL
    INTO has_writer_table;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_runtime_settlement'
      AND column_name = 'writer_generation'
  ) INTO has_settlement_generation;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_turn'
      AND column_name = 'writer_generation'
  ) INTO has_turn_generation;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transcript_interruption_marker'
      AND column_name = 'writer_generation'
  ) INTO has_marker_generation;
  END LOOP;
END
$runtime_settlement_reconciliation$;
