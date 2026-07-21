SET LOCAL search_path = public, pg_catalog;
--> statement-breakpoint
CREATE TABLE "support_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_hash" text NOT NULL,
	"email_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_submission_idempotency_hash_unique" UNIQUE("idempotency_hash"),
	CONSTRAINT "support_submission_idempotency_hash_check" CHECK ("support_submission"."idempotency_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_submission_email_hash_check" CHECK ("support_submission"."email_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_submission_ip_hash_check" CHECK ("support_submission"."ip_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_submission_reason_check" CHECK ("support_submission"."reason" IN ('account', 'billing', 'interview', 'feedback', 'privacy', 'other')),
	CONSTRAINT "support_submission_status_check" CHECK ("support_submission"."status" IN ('received', 'reviewing', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "support_submission_rate_limit" (
	"scope" text NOT NULL,
	"identifier_hash" text NOT NULL,
	"accepted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_submission_rate_limit_pkey" PRIMARY KEY("scope","identifier_hash"),
	CONSTRAINT "support_submission_rate_limit_scope_check" CHECK ("support_submission_rate_limit"."scope" IN ('global', 'ip', 'email')),
	CONSTRAINT "support_submission_rate_limit_hash_check" CHECK ("support_submission_rate_limit"."identifier_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "support_submission_rate_limit_capacity_check" CHECK (cardinality("support_submission_rate_limit"."accepted_at") <= 100)
);
--> statement-breakpoint
CREATE INDEX "support_submission_email_created_idx" ON "support_submission" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "support_submission_status_created_idx" ON "support_submission" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "support_submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_submission_rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "support_submission", "support_submission_rate_limit"
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "support_submission", "support_submission_rate_limit"
  TO service_role;
--> statement-breakpoint
CREATE POLICY "Service role has full access to support_submission"
  ON "support_submission" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access to support_submission_rate_limit"
  ON "support_submission_rate_limit" FOR ALL TO service_role
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION "public"."submit_support_request"(
  "request_idempotency_hash" text,
  "request_ip_hash" text,
  "request_email_hash" text,
  "request_name" text,
  "request_email" text,
  "request_reason" text,
  "request_message" text
)
RETURNS TABLE (
  "submission_id" uuid,
  "created_at" timestamp with time zone,
  "duplicate" boolean,
  "rate_limited" boolean,
  "limiting_scope" text,
  "retry_after_seconds" integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  now_at timestamp with time zone := clock_timestamp();
  existing_submission support_submission%ROWTYPE;
  global_hash constant text := repeat('0', 64);
  accepted timestamp with time zone[] := ARRAY[]::timestamptz[];
  retry_seconds integer := 0;
  current_scope text;
  current_hash text;
BEGIN
  IF request_idempotency_hash !~ '^[0-9a-f]{64}$'
    OR request_ip_hash !~ '^[0-9a-f]{64}$'
    OR request_email_hash !~ '^[0-9a-f]{64}$'
    OR request_reason NOT IN ('account', 'billing', 'interview', 'feedback', 'privacy', 'other')
    OR btrim(request_name) = ''
    OR btrim(request_email) = ''
    OR btrim(request_message) = ''
  THEN
    RAISE EXCEPTION 'valid support request inputs are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(request_idempotency_hash, 0));

  SELECT * INTO existing_submission
  FROM support_submission
  WHERE idempotency_hash = request_idempotency_hash
  FOR UPDATE;

  IF FOUND THEN
    submission_id := existing_submission.id;
    created_at := existing_submission.created_at;
    duplicate := true;
    rate_limited := false;
    limiting_scope := NULL;
    retry_after_seconds := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR current_scope IN SELECT unnest(ARRAY['global', 'ip', 'email']::text[])
  LOOP
    current_hash := CASE
      WHEN current_scope = 'global' THEN global_hash
      WHEN current_scope = 'ip' THEN request_ip_hash
      ELSE request_email_hash
    END;

    INSERT INTO support_submission_rate_limit (scope, identifier_hash)
    VALUES (current_scope, current_hash)
    ON CONFLICT (scope, identifier_hash) DO NOTHING;

    SELECT accepted_at
    INTO accepted
    FROM support_submission_rate_limit
    WHERE scope = current_scope
      AND identifier_hash = current_hash
    FOR UPDATE;

    SELECT COALESCE(array_agg(value ORDER BY value), ARRAY[]::timestamptz[])
    INTO accepted
    FROM unnest(accepted) AS value
    WHERE value > now_at - interval '24 hours';

    retry_seconds := 0;
    IF current_scope = 'global' AND cardinality(accepted) >= 100 THEN
      retry_seconds := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (accepted[1] + interval '24 hours' - now_at)))::integer
      );
    ELSIF current_scope = 'ip' AND cardinality(accepted) >= 10 THEN
      retry_seconds := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (accepted[1] + interval '24 hours' - now_at)))::integer
      );
    ELSIF current_scope = 'email' AND cardinality(accepted) >= 5 THEN
      retry_seconds := GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (accepted[1] + interval '24 hours' - now_at)))::integer
      );
    END IF;

    IF retry_seconds > 0 THEN
      submission_id := NULL;
      created_at := NULL;
      duplicate := false;
      rate_limited := true;
      limiting_scope := current_scope;
      retry_after_seconds := retry_seconds;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  INSERT INTO support_submission (
    idempotency_hash,
    ip_hash,
    email_hash,
    name,
    email,
    reason,
    message
  )
  VALUES (
    request_idempotency_hash,
    request_ip_hash,
    request_email_hash,
    request_name,
    request_email,
    request_reason,
    request_message
  )
  RETURNING id, support_submission.created_at
  INTO submission_id, created_at;

  UPDATE support_submission_rate_limit
  SET accepted_at = array_append(accepted_at, now_at),
    updated_at = now_at
  WHERE (scope = 'global' AND identifier_hash = global_hash)
    OR (scope = 'ip' AND identifier_hash = request_ip_hash)
    OR (scope = 'email' AND identifier_hash = request_email_hash);

  duplicate := false;
  rate_limited := false;
  limiting_scope := NULL;
  retry_after_seconds := 0;
  RETURN NEXT;
END;
$$;
