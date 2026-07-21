SET LOCAL search_path = public, pg_catalog;
--> statement-breakpoint
CREATE TABLE "public_demo_rate_limit" (
  "deployment_scope" text NOT NULL,
  "scope" text NOT NULL,
  "identifier_hash" text NOT NULL,
  "accepted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "public_demo_rate_limit_pkey" PRIMARY KEY("deployment_scope","scope","identifier_hash"),
  CONSTRAINT "public_demo_rate_limit_deployment_scope_check" CHECK ("public_demo_rate_limit"."deployment_scope" IN ('production', 'preview', 'development')),
  CONSTRAINT "public_demo_rate_limit_scope_check" CHECK ("public_demo_rate_limit"."scope" IN ('global', 'ip', 'device')),
  CONSTRAINT "public_demo_rate_limit_hash_check" CHECK ("public_demo_rate_limit"."identifier_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "public_demo_rate_limit_capacity_check" CHECK (cardinality("public_demo_rate_limit"."accepted_at") <= 100)
);
--> statement-breakpoint
CREATE TABLE "public_demo_session" (
  "id" uuid PRIMARY KEY NOT NULL,
  "deployment_scope" text NOT NULL,
  "ip_hash" text NOT NULL,
  "device_hash" text NOT NULL,
  "room_name" text NOT NULL,
  "status" text DEFAULT 'provisioning' NOT NULL,
  "token_issues" integer DEFAULT 0 NOT NULL,
  "recovery_claim_token" uuid,
  "recovery_finalized_at" timestamp with time zone,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "active_expires_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "public_demo_session_room_name_unique" UNIQUE("room_name"),
  CONSTRAINT "public_demo_session_status_check" CHECK ("public_demo_session"."status" IN ('provisioning', 'ready', 'failed')),
  CONSTRAINT "public_demo_session_deployment_scope_check" CHECK ("public_demo_session"."deployment_scope" IN ('production', 'preview', 'development')),
  CONSTRAINT "public_demo_session_ip_hash_check" CHECK ("public_demo_session"."ip_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "public_demo_session_device_hash_check" CHECK ("public_demo_session"."device_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "public_demo_session_token_issues_check" CHECK ("public_demo_session"."token_issues" BETWEEN 0 AND 2),
  CONSTRAINT "public_demo_session_recovery_claim_check" CHECK (("public_demo_session"."recovery_claim_token" IS NULL AND "public_demo_session"."recovery_finalized_at" IS NULL) OR ("public_demo_session"."status" = 'ready' AND "public_demo_session"."token_issues" = 2 AND ("public_demo_session"."recovery_finalized_at" IS NULL OR "public_demo_session"."recovery_claim_token" IS NOT NULL))),
  CONSTRAINT "public_demo_session_failure_code_check" CHECK ("public_demo_session"."failure_code" IS NULL OR "public_demo_session"."failure_code" ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT "public_demo_session_expiry_order_check" CHECK ("public_demo_session"."active_expires_at" <= "public_demo_session"."expires_at")
);
--> statement-breakpoint
CREATE INDEX "public_demo_session_device_expiry_idx" ON "public_demo_session" USING btree ("deployment_scope","device_hash","active_expires_at");
--> statement-breakpoint
CREATE INDEX "public_demo_session_expiry_idx" ON "public_demo_session" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "public_demo_rate_limit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public_demo_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "public_demo_rate_limit", "public_demo_session"
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "public_demo_rate_limit", "public_demo_session"
  TO service_role;
--> statement-breakpoint
CREATE POLICY "Service role has full access to public_demo_rate_limit"
  ON "public_demo_rate_limit" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access to public_demo_session"
  ON "public_demo_session" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION "public"."reserve_public_demo_session"(
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
  "recovery_claim_token" uuid
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
  INSERT INTO public_demo_session (
    id, deployment_scope, ip_hash, device_hash, room_name,
    active_expires_at, expires_at
  ) VALUES (
    requested_session_id,
    requested_deployment_scope,
    ip_identifier_hash,
    device_identifier_hash,
    room_name,
    now_at + interval '3 minutes',
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
CREATE FUNCTION "public"."complete_public_demo_session"(
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
    AND status = 'provisioning';
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."finalize_public_demo_recovery_token"(
  "completed_session_id" uuid,
  "completed_claim_token" uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF completed_session_id IS NULL OR completed_claim_token IS NULL THEN
    RAISE EXCEPTION 'valid public demo recovery finalization inputs are required';
  END IF;

  UPDATE public_demo_session
  SET recovery_finalized_at = COALESCE(recovery_finalized_at, clock_timestamp()),
    updated_at = clock_timestamp()
  WHERE id = completed_session_id
    AND status = 'ready'
    AND token_issues = 2
    AND recovery_claim_token = completed_claim_token;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "public"."rollback_public_demo_recovery_token"(
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
CREATE FUNCTION "public"."fail_public_demo_recovery_session"(
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
CREATE FUNCTION "public"."prune_public_demo_abuse_data"()
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
