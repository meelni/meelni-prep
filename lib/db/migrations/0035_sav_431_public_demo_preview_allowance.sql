SET LOCAL search_path = public, pg_catalog;
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
  device_limit constant integer := 10;
  ip_daily_limit constant integer := 20;
  ip_burst_limit constant integer := 10;
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
      remaining := 0;
      recovery_claim_token := NULL;

      IF existing_session.deployment_scope <> requested_deployment_scope
        OR existing_session.ip_hash <> ip_identifier_hash
        OR existing_session.device_hash <> device_identifier_hash
      THEN
        decision := 'rate_limited';
        room_name := existing_session.room_name;
        limiting_scope := 'session';
        retry_after_seconds := GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (existing_session.expires_at - now_at)))::integer
        );
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
        room_name := existing_session.room_name;
        limiting_scope := NULL;
        retry_after_seconds := 0;
        recovery_claim_token := claim_token_value;
        deadline_at := existing_session.active_expires_at;
        RETURN NEXT;
        RETURN;
      END IF;

      IF existing_session.status IN ('provisioning', 'ready')
        AND existing_session.active_expires_at <= now_at
      THEN
        decision := 'rotate_session';
        room_name := NULL;
        limiting_scope := NULL;
        retry_after_seconds := 0;
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
      room_name := existing_session.room_name;
      limiting_scope := CASE
        WHEN existing_session.status = 'ready'
          AND existing_session.active_expires_at > now_at
          THEN 'active_device'
        ELSE 'session'
      END;
      retry_after_seconds := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (
          CASE
            WHEN limiting_scope = 'active_device'
              THEN existing_session.active_expires_at
            ELSE existing_session.expires_at
          END - now_at
        )))::integer
      );
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

  -- The global row serializes every accepted reservation in one deployment.
  -- Refresh the database clock only after obtaining that lock so timestamps
  -- stay ordered and exact failure refunds can remove one accepted entry.
  now_at := clock_timestamp();

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

  IF cardinality(ip_accepted) >= ip_daily_limit THEN
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
  )) >= ip_burst_limit THEN
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

  IF cardinality(device_accepted) >= device_limit THEN
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

  room_name := 'demo-' || replace(gen_random_uuid()::text, '-', '');
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
    ip_daily_limit - cardinality(ip_accepted),
    device_limit - cardinality(device_accepted)
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
  existing_session public_demo_session%ROWTYPE;
  global_hash constant text := repeat('0', 64);
BEGIN
  IF completed_session_id IS NULL
    OR completed_status NOT IN ('ready', 'failed')
    OR (safe_failure_code IS NOT NULL AND safe_failure_code !~ '^[a-z0-9_]{1,64}$')
  THEN
    RAISE EXCEPTION 'invalid public demo completion';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(completed_session_id::text, 0));

  SELECT * INTO existing_session
  FROM public_demo_session
  WHERE id = completed_session_id
  FOR UPDATE;

  IF NOT FOUND OR existing_session.status <> 'provisioning' THEN
    RETURN false;
  END IF;

  IF completed_status = 'ready'
    AND existing_session.active_expires_at < now_at + interval '5 seconds'
  THEN
    RETURN false;
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
  WHERE id = completed_session_id;

  IF completed_status = 'failed' THEN
    -- Match the reservation lock order before refunding the one exact accepted
    -- timestamp. Removing one ordinal, rather than every equal timestamp,
    -- keeps concurrent starts and clock collisions correctly accounted for.
    PERFORM 1
    FROM public_demo_rate_limit
    WHERE deployment_scope = existing_session.deployment_scope
      AND scope = 'global'
      AND identifier_hash = global_hash
    FOR UPDATE;

    UPDATE public_demo_rate_limit AS rate_limit
    SET accepted_at = COALESCE((
        SELECT array_agg(entry.accepted ORDER BY entry.ordinality)
        FROM unnest(rate_limit.accepted_at) WITH ORDINALITY
          AS entry(accepted, ordinality)
        WHERE entry.ordinality <> COALESCE((
          SELECT MIN(matching.ordinality)
          FROM unnest(rate_limit.accepted_at) WITH ORDINALITY
            AS matching(accepted, ordinality)
          WHERE matching.accepted = existing_session.created_at
        ), 0)
      ), ARRAY[]::timestamptz[]),
      updated_at = now_at
    WHERE deployment_scope = existing_session.deployment_scope
      AND (
        (scope = 'global' AND identifier_hash = global_hash)
        OR (scope = 'ip' AND identifier_hash = existing_session.ip_hash)
        OR (scope = 'device' AND identifier_hash = existing_session.device_hash)
      );
  END IF;

  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."reserve_public_demo_session"(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "public"."complete_public_demo_session"(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."reserve_public_demo_session"(uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION "public"."complete_public_demo_session"(uuid, text, text)
  TO service_role;
