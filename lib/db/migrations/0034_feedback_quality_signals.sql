SET LOCAL search_path = public, pg_catalog;
--> statement-breakpoint
CREATE TABLE "feedback_quality_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"feedback_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"review_outcome" text NOT NULL,
	"response" text NOT NULL,
	"reason" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_quality_signal_contract_check" CHECK ("feedback_quality_signal"."contract_version" = 'feedback-quality-signal.v1'),
	CONSTRAINT "feedback_quality_signal_outcome_check" CHECK ("feedback_quality_signal"."review_outcome" IN ('full_scorecard', 'partial_scorecard', 'coaching_review')),
	CONSTRAINT "feedback_quality_signal_response_check" CHECK ("feedback_quality_signal"."response" IN ('helpful', 'not_helpful')),
	CONSTRAINT "feedback_quality_signal_selection_check" CHECK ((
        "feedback_quality_signal"."response" = 'helpful' AND "feedback_quality_signal"."reason" IS NULL
      ) OR (
        "feedback_quality_signal"."response" = 'not_helpful' AND (
          "feedback_quality_signal"."reason" IS NULL OR
          "feedback_quality_signal"."reason" IN ('not_specific_enough', 'evidence_did_not_match', 'next_step_unclear', 'too_much_to_use') OR
          ("feedback_quality_signal"."review_outcome" IN ('full_scorecard', 'partial_scorecard') AND "feedback_quality_signal"."reason" = 'score_explanation_unclear') OR
          ("feedback_quality_signal"."review_outcome" = 'coaching_review' AND "feedback_quality_signal"."reason" = 'score_withholding_unclear')
        )
      )),
	CONSTRAINT "feedback_quality_signal_revision_check" CHECK ("feedback_quality_signal"."revision" >= 1),
	CONSTRAINT "feedback_quality_signal_timestamp_check" CHECK ("feedback_quality_signal"."updated_at" >= "feedback_quality_signal"."created_at")
);
--> statement-breakpoint
CREATE TABLE "feedback_quality_signal_rate_limit" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_quality_signal_rate_limit_capacity_check" CHECK (cardinality("feedback_quality_signal_rate_limit"."accepted_at") <= 20)
);
--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_session_owner_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."interview_session"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_feedback_session_fk" FOREIGN KEY ("feedback_id","session_id") REFERENCES "public"."feedback"("id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_quality_signal_owner_feedback_idx" ON "feedback_quality_signal" USING btree ("user_id","feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_quality_signal_owner_updated_idx" ON "feedback_quality_signal" USING btree ("user_id","updated_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."can_read_owned_feedback_quality_signal"("candidate_user_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT "candidate_user_id" = auth.uid()
		AND NOT EXISTS (
			SELECT 1
			FROM public.account_deletion_request
			WHERE account_deletion_request.user_id = "candidate_user_id"
		);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."consume_feedback_quality_signal_rate_limit"(
	"candidate_user_id" uuid,
	"candidate_limit" integer DEFAULT 20
)
RETURNS TABLE ("allowed" boolean, "retry_after_seconds" integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	now_at timestamp with time zone := clock_timestamp();
	window_start timestamp with time zone := now_at - interval '1 hour';
	current_attempts timestamp with time zone[];
	earliest_attempt timestamp with time zone;
BEGIN
	IF candidate_user_id IS NULL OR candidate_limit < 1 OR candidate_limit > 20 THEN
		RAISE EXCEPTION 'invalid_feedback_quality_rate_limit_input';
	END IF;

	-- Account deletion uses this same transaction-scoped namespace. Lock before
	-- the tombstone check so deletion-first cleanup cannot be followed by a
	-- late insert into this intentionally FK-less operational table.
	PERFORM pg_advisory_xact_lock(
		hashtextextended(candidate_user_id::text, 181::bigint)
	);

	-- Deletion intent is durable before application cleanup. A late request may
	-- still authenticate, but it must not recreate operational state after the
	-- cleanup transaction has removed the owner's limiter row.
	IF EXISTS (
		SELECT 1
		FROM public.account_deletion_request
		WHERE account_deletion_request.user_id = candidate_user_id
	) THEN
		allowed := true;
		retry_after_seconds := 0;
		RETURN NEXT;
		RETURN;
	END IF;

	INSERT INTO public.feedback_quality_signal_rate_limit(user_id)
	VALUES (candidate_user_id)
	ON CONFLICT (user_id) DO NOTHING;

	SELECT ARRAY(
		SELECT accepted
		FROM unnest(rate_limit.accepted_at) accepted
		WHERE accepted > window_start
		ORDER BY accepted
	)
	INTO current_attempts
	FROM public.feedback_quality_signal_rate_limit rate_limit
	WHERE rate_limit.user_id = candidate_user_id
	FOR UPDATE;

	IF cardinality(current_attempts) >= candidate_limit THEN
		earliest_attempt := current_attempts[1];
		allowed := false;
		retry_after_seconds := GREATEST(
			1,
			CEIL(EXTRACT(EPOCH FROM (earliest_attempt + interval '1 hour' - now_at)))::integer
		);
		UPDATE public.feedback_quality_signal_rate_limit
		SET accepted_at = current_attempts, updated_at = now_at
		WHERE user_id = candidate_user_id;
		RETURN NEXT;
		RETURN;
	END IF;

	UPDATE public.feedback_quality_signal_rate_limit
	SET accepted_at = array_append(current_attempts, now_at), updated_at = now_at
	WHERE user_id = candidate_user_id;
	allowed := true;
	retry_after_seconds := 0;
	RETURN NEXT;
END;
$$;
--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_quality_signal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "feedback_quality_signal_rate_limit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_quality_signal_rate_limit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "feedback_quality_signal", "feedback_quality_signal_rate_limit"
	FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE "feedback_quality_signal", "feedback_quality_signal_rate_limit" TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."can_read_owned_feedback_quality_signal"(uuid)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."can_read_owned_feedback_quality_signal"(uuid)
	TO authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."consume_feedback_quality_signal_rate_limit"(uuid, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "public"."consume_feedback_quality_signal_rate_limit"(uuid, integer)
	TO service_role;
--> statement-breakpoint
CREATE POLICY "Users can view own feedback quality signals"
	ON "feedback_quality_signal"
	FOR SELECT TO authenticated
	USING (public.can_read_owned_feedback_quality_signal("user_id"));
CREATE POLICY "Service role has full access to feedback quality signals"
	ON "feedback_quality_signal"
	FOR ALL TO service_role
	USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access to feedback quality signal rate limits"
	ON "feedback_quality_signal_rate_limit"
	FOR ALL TO service_role
	USING (true) WITH CHECK (true);
