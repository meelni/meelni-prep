ALTER TABLE "feedback" ADD CONSTRAINT "feedback_id_session_uniq" UNIQUE("id","session_id");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_id_user_uniq" UNIQUE("id","user_id");--> statement-breakpoint
CREATE TABLE "focused_practice_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_session_id" uuid NOT NULL,
	"source_feedback_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"lifecycle_version" integer DEFAULT 0 NOT NULL,
	"state" text NOT NULL,
	"feedback_version" jsonb NOT NULL,
	"plan_contract_version" text NOT NULL,
	"plan_template_version" text NOT NULL,
	"plan_template_id" text NOT NULL,
	"plan" jsonb NOT NULL,
	"source_finding" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"completion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "focused_practice_attempt_id_user_uniq" UNIQUE("id","user_id"),
	CONSTRAINT "focused_practice_attempt_contract_version_check" CHECK ("focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v1'),
	CONSTRAINT "focused_practice_attempt_plan_version_check" CHECK ("focused_practice_attempt"."plan_contract_version" = 'focused-practice-plan.v1' AND "focused_practice_attempt"."plan_template_version" = 'focused-practice-templates.v1' AND length(trim("focused_practice_attempt"."plan_template_id")) > 0),
	CONSTRAINT "focused_practice_attempt_snapshot_version_check" CHECK (jsonb_typeof("focused_practice_attempt"."feedback_version") = 'object' AND
        "focused_practice_attempt"."feedback_version"->>'schemaVersion' = 'feedback.v2' AND
        "focused_practice_attempt"."feedback_version"->>'promptVersion' = 'feedback.prompt.v2' AND
        "focused_practice_attempt"."feedback_version"->>'rubricVersion' = 'pm-feedback-rubric.v2' AND
        "focused_practice_attempt"."feedback_version"->>'evaluationState' IN ('full', 'partial') AND
        jsonb_typeof("focused_practice_attempt"."plan") = 'object' AND
        "focused_practice_attempt"."plan"->>'state' = 'available' AND
        "focused_practice_attempt"."plan"->>'contractVersion' = "focused_practice_attempt"."plan_contract_version" AND
        "focused_practice_attempt"."plan"->>'templateVersion' = "focused_practice_attempt"."plan_template_version" AND
        "focused_practice_attempt"."plan"->>'templateId' = "focused_practice_attempt"."plan_template_id" AND
        jsonb_typeof("focused_practice_attempt"."source_finding") = 'object' AND
        octet_length("focused_practice_attempt"."feedback_version"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."plan"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."source_finding"::text) <= 65536 AND
        ("focused_practice_attempt"."completion" IS NULL OR (jsonb_typeof("focused_practice_attempt"."completion") = 'object' AND octet_length("focused_practice_attempt"."completion"::text) <= 65536))),
	CONSTRAINT "focused_practice_attempt_lifecycle_check" CHECK ((
        "focused_practice_attempt"."state" = 'in_progress' AND
        "focused_practice_attempt"."lifecycle_version" = 0 AND
        "focused_practice_attempt"."completed_at" IS NULL AND
        "focused_practice_attempt"."completion" IS NULL
      ) OR (
        "focused_practice_attempt"."state" = 'completed' AND
        "focused_practice_attempt"."lifecycle_version" = 1 AND
        "focused_practice_attempt"."completed_at" IS NOT NULL AND
        "focused_practice_attempt"."completed_at" >= "focused_practice_attempt"."started_at" AND
        "focused_practice_attempt"."completion" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_source_session_id_interview_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."interview_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_source_feedback_id_feedback_id_fk" FOREIGN KEY ("source_feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_source_session_owner_fk" FOREIGN KEY ("source_session_id","user_id") REFERENCES "public"."interview_session"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_source_feedback_session_fk" FOREIGN KEY ("source_feedback_id","source_session_id") REFERENCES "public"."feedback"("id","session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "focused_practice_attempt_owner_source_contract_idx" ON "focused_practice_attempt" USING btree ("user_id","source_session_id","contract_version");--> statement-breakpoint
CREATE INDEX "focused_practice_attempt_owner_state_updated_idx" ON "focused_practice_attempt" USING btree ("user_id","state","updated_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."enforce_focused_practice_attempt_transition"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id"
		OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
		OR NEW."source_session_id" IS DISTINCT FROM OLD."source_session_id"
		OR NEW."source_feedback_id" IS DISTINCT FROM OLD."source_feedback_id"
		OR NEW."contract_version" IS DISTINCT FROM OLD."contract_version"
		OR NEW."feedback_version" IS DISTINCT FROM OLD."feedback_version"
		OR NEW."plan_contract_version" IS DISTINCT FROM OLD."plan_contract_version"
		OR NEW."plan_template_version" IS DISTINCT FROM OLD."plan_template_version"
		OR NEW."plan_template_id" IS DISTINCT FROM OLD."plan_template_id"
		OR NEW."plan" IS DISTINCT FROM OLD."plan"
		OR NEW."source_finding" IS DISTINCT FROM OLD."source_finding"
		OR NEW."started_at" IS DISTINCT FROM OLD."started_at"
		OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
		RAISE EXCEPTION 'focused_practice_attempt_immutable_snapshot';
	END IF;

	IF NOT (
		OLD."state" = 'in_progress'
		AND OLD."lifecycle_version" = 0
		AND NEW."state" = 'completed'
		AND NEW."lifecycle_version" = 1
		AND NEW."completed_at" IS NOT NULL
		AND NEW."completion" IS NOT NULL
		AND NEW."updated_at" >= OLD."updated_at"
	) THEN
		RAISE EXCEPTION 'focused_practice_attempt_invalid_transition';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "focused_practice_attempt_transition_guard"
	BEFORE UPDATE ON "focused_practice_attempt"
	FOR EACH ROW EXECUTE FUNCTION "public"."enforce_focused_practice_attempt_transition"();--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."enforce_focused_practice_attempt_transition"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."can_read_owned_focused_practice_attempt"("candidate_user_id" uuid)
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
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."can_read_owned_focused_practice_attempt"(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."can_read_owned_focused_practice_attempt"(uuid) TO authenticated, service_role;--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "focused_practice_attempt" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE "focused_practice_attempt" TO authenticated;--> statement-breakpoint
GRANT ALL ON TABLE "focused_practice_attempt" TO service_role;--> statement-breakpoint
CREATE POLICY "Users can view own focused practice attempts"
	ON "focused_practice_attempt"
	FOR SELECT TO authenticated
	USING (public.can_read_owned_focused_practice_attempt("user_id"));--> statement-breakpoint
CREATE POLICY "Service role has full access to focused practice attempts"
	ON "focused_practice_attempt"
	FOR ALL TO service_role
	USING (true) WITH CHECK (true);
