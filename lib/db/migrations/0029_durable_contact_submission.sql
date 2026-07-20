DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'meelni_contact_triage'
  ) THEN
    CREATE ROLE meelni_contact_triage
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE meelni_contact_triage
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  shared_role name;
BEGIN
  FOR shared_role IN
    SELECT member_role.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles group_role
      ON group_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles member_role
      ON member_role.oid = membership.member
    WHERE group_role.rolname = 'meelni_contact_triage'
      AND member_role.rolname IN (
        'anon', 'authenticated', 'service_role', 'authenticator'
      )
  LOOP
    EXECUTE format(
      'REVOKE meelni_contact_triage FROM %I',
      shared_role
    );
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE TABLE "contact_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"persistence_state" text DEFAULT 'stored' NOT NULL,
	"triage_state" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_submission_reason_check" CHECK ("contact_submission"."reason" IN ('billing', 'support', 'bug', 'feedback', 'other')),
	CONSTRAINT "contact_submission_name_bounds_check" CHECK ("contact_submission"."name" = btrim("contact_submission"."name") AND char_length("contact_submission"."name") BETWEEN 1 AND 100 AND octet_length("contact_submission"."name") <= 400 AND "contact_submission"."name" !~ '[[:cntrl:]]'),
	CONSTRAINT "contact_submission_email_bounds_check" CHECK ("contact_submission"."email" = btrim("contact_submission"."email") AND "contact_submission"."email" = lower("contact_submission"."email") AND char_length("contact_submission"."email") BETWEEN 3 AND 320 AND octet_length("contact_submission"."email") <= 320 AND position('@' IN "contact_submission"."email") > 1 AND "contact_submission"."email" !~ '[[:cntrl:][:space:]]'),
	CONSTRAINT "contact_submission_subject_bounds_check" CHECK ("contact_submission"."subject" = btrim("contact_submission"."subject") AND char_length("contact_submission"."subject") BETWEEN 1 AND 200 AND octet_length("contact_submission"."subject") <= 800 AND "contact_submission"."subject" !~ '[[:cntrl:]]'),
	CONSTRAINT "contact_submission_message_bounds_check" CHECK ("contact_submission"."message" = btrim("contact_submission"."message") AND char_length("contact_submission"."message") BETWEEN 10 AND 5000 AND octet_length("contact_submission"."message") <= 20000 AND regexp_replace("contact_submission"."message", E'[\t\n\r]', '', 'g') !~ '[[:cntrl:]]'),
	CONSTRAINT "contact_submission_persistence_state_check" CHECK ("contact_submission"."persistence_state" = 'stored'),
	CONSTRAINT "contact_submission_triage_state_check" CHECK ("contact_submission"."triage_state" IN ('new', 'claimed', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "contact_submission_access_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"access_type" text NOT NULL,
	"actor_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_submission_access_audit_type_check" CHECK ("contact_submission_access_audit"."access_type" IN ('read', 'claim', 'resolve')),
	CONSTRAINT "contact_submission_access_audit_actor_reference_check" CHECK ("contact_submission_access_audit"."actor_reference" ~ '^[A-Za-z0-9_.:-]{3,80}$')
);
--> statement-breakpoint
CREATE TABLE "contact_submission_rate_limit" (
	"identity_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_submission_rate_limit_identity_hash_check" CHECK ("contact_submission_rate_limit"."identity_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contact_submission_rate_limit_request_count_check" CHECK ("contact_submission_rate_limit"."request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contact_submission" ADD CONSTRAINT "contact_submission_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_submission_access_audit" ADD CONSTRAINT "contact_submission_access_audit_submission_id_contact_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."contact_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_submission_idempotency_key_idx" ON "contact_submission" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "contact_submission_created_at_idx" ON "contact_submission" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_submission_user_id_idx" ON "contact_submission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contact_submission_access_audit_submission_created_idx" ON "contact_submission_access_audit" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_submission_rate_limit_window_started_idx" ON "contact_submission_rate_limit" USING btree ("window_started_at");
--> statement-breakpoint
ALTER TABLE "contact_submission" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_submission" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_submission_access_audit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_submission_access_audit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_submission_rate_limit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contact_submission_rate_limit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "contact_submission", "contact_submission_access_audit", "contact_submission_rate_limit" FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.consume_contact_submission_rate_limit(p_identity_hash text, p_limit integer)
RETURNS TABLE(allowed boolean, retry_after_seconds integer, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window timestamptz := date_trunc('hour', v_now);
  v_count integer;
BEGIN
  IF p_identity_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_contact_rate_limit_identity';
  END IF;
  IF p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'invalid_contact_rate_limit_capacity';
  END IF;

  INSERT INTO public.contact_submission_rate_limit(identity_hash, window_started_at, request_count, updated_at)
  VALUES (p_identity_hash, v_window, 1, v_now)
  ON CONFLICT (identity_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN contact_submission_rate_limit.window_started_at < v_window THEN v_window
      ELSE contact_submission_rate_limit.window_started_at
    END,
    request_count = CASE
      WHEN contact_submission_rate_limit.window_started_at < v_window THEN 1
      ELSE contact_submission_rate_limit.request_count + 1
    END,
    updated_at = v_now
  WHERE contact_submission_rate_limit.window_started_at < v_window
     OR contact_submission_rate_limit.request_count < p_limit
  RETURNING request_count INTO v_count;

  IF v_count IS NOT NULL THEN
    RETURN QUERY
      SELECT true, 0, p_limit - v_count, v_window + interval '1 hour';
    RETURN;
  END IF;

  RETURN QUERY
    SELECT false,
      greatest(1, ceil(extract(epoch FROM (v_window + interval '1 hour' - v_now)))::integer),
      0,
      v_window + interval '1 hour';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.cleanup_contact_submission_rate_limits(p_batch_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_batch_limit < 1 OR p_batch_limit > 5000 THEN
    RAISE EXCEPTION 'invalid_contact_rate_limit_cleanup_batch';
  END IF;

  DELETE FROM public.contact_submission_rate_limit
  WHERE ctid IN (
    SELECT ctid
    FROM public.contact_submission_rate_limit
    WHERE window_started_at < date_trunc('hour', clock_timestamp()) - interval '24 hours'
    ORDER BY window_started_at ASC
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_contact_submissions(p_limit integer DEFAULT 50)
RETURNS TABLE(receipt_id uuid, reason text, triage_state text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_contact_triage_limit';
  END IF;

  RETURN QUERY
    SELECT submission.id, submission.reason, submission.triage_state, submission.created_at
    FROM public.contact_submission submission
    ORDER BY
      CASE submission.triage_state
        WHEN 'new' THEN 0
        WHEN 'claimed' THEN 1
        ELSE 2
      END,
      submission.created_at ASC
    LIMIT p_limit;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.read_contact_submission(p_receipt_id uuid)
RETURNS TABLE(
  receipt_id uuid,
  name text,
  email text,
  reason text,
  subject text,
  message text,
  persistence_state text,
  triage_state text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submission public.contact_submission%ROWTYPE;
  v_actor text := md5(session_user::text);
BEGIN
  SELECT *
  INTO v_submission
  FROM public.contact_submission
  WHERE id = p_receipt_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.contact_submission_access_audit(submission_id, access_type, actor_reference)
  VALUES (v_submission.id, 'read', v_actor);

  RETURN QUERY
    SELECT
      v_submission.id,
      v_submission.name,
      v_submission.email,
      v_submission.reason,
      v_submission.subject,
      v_submission.message,
      v_submission.persistence_state,
      v_submission.triage_state,
      v_submission.created_at;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_contact_submission_triage_state(p_receipt_id uuid, p_triage_state text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor text := md5(session_user::text);
  v_current_state text;
BEGIN
  IF p_triage_state NOT IN ('claimed', 'resolved') THEN
    RAISE EXCEPTION 'invalid_contact_triage_state';
  END IF;

  SELECT triage_state
  INTO v_current_state
  FROM public.contact_submission
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current_state = p_triage_state THEN
    RETURN true;
  END IF;

  IF v_current_state = 'resolved' THEN
    RAISE EXCEPTION 'contact_triage_state_regression';
  END IF;

  UPDATE public.contact_submission
  SET triage_state = p_triage_state
  WHERE id = p_receipt_id
    AND triage_state = v_current_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_triage_state_conflict';
  END IF;

  INSERT INTO public.contact_submission_access_audit(submission_id, access_type, actor_reference)
  VALUES (
    p_receipt_id,
    CASE WHEN p_triage_state = 'claimed' THEN 'claim' ELSE 'resolve' END,
    v_actor
  );
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_contact_submission_rate_limit(text, integer) FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.cleanup_contact_submission_rate_limits(integer) FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_contact_submissions(integer) FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_contact_submission(uuid) FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_contact_submission_triage_state(uuid, text) FROM PUBLIC, anon, authenticated, service_role, meelni_contact_triage;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_contact_submission_rate_limit(text, integer) TO service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.cleanup_contact_submission_rate_limits(integer) TO service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO meelni_contact_triage;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_contact_submissions(integer) TO meelni_contact_triage;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_contact_submission(uuid) TO meelni_contact_triage;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_contact_submission_triage_state(uuid, text) TO meelni_contact_triage;
