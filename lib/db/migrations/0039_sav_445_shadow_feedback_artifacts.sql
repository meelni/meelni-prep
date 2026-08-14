CREATE TABLE "shadow_feedback_artifact" (
	"artifact_key_fingerprint" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"key_contract_version" text NOT NULL,
	"artifact_contract_version" text NOT NULL,
	"trusted_block_fingerprint" text NOT NULL,
	"rubric_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"selection_schema_version" text NOT NULL,
	"model_version" text NOT NULL,
	"artifact" jsonb NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shadow_feedback_artifact_pkey" PRIMARY KEY("artifact_key_fingerprint"),
	CONSTRAINT "shadow_feedback_artifact_exact_key_uniq" UNIQUE("session_id","trusted_block_fingerprint","rubric_version","prompt_version","selection_schema_version","model_version"),
	CONSTRAINT "shadow_feedback_artifact_key_fingerprint_check" CHECK ("shadow_feedback_artifact"."artifact_key_fingerprint" ~ '^shadow-feedback-artifact-key\.v1:[a-f0-9]{64}$'),
	CONSTRAINT "shadow_feedback_artifact_trusted_block_fingerprint_check" CHECK ("shadow_feedback_artifact"."trusted_block_fingerprint" ~ '^trusted-answer-block\.v1:[a-f0-9]{64}$'),
	CONSTRAINT "shadow_feedback_artifact_version_tuple_check" CHECK ("shadow_feedback_artifact"."key_contract_version" = 'feedback.shadow-artifact-key.v1' AND "shadow_feedback_artifact"."artifact_contract_version" = 'feedback.shadow-artifact.v1' AND "shadow_feedback_artifact"."rubric_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$' AND "shadow_feedback_artifact"."prompt_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$' AND "shadow_feedback_artifact"."selection_schema_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$' AND "shadow_feedback_artifact"."model_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$'),
	CONSTRAINT "shadow_feedback_artifact_shape_check" CHECK (jsonb_typeof("shadow_feedback_artifact"."artifact") = 'object' AND "shadow_feedback_artifact"."artifact"->>'contractVersion' = "shadow_feedback_artifact"."artifact_contract_version" AND jsonb_typeof("shadow_feedback_artifact"."artifact"->'key') = 'object' AND "shadow_feedback_artifact"."artifact"#>>'{key,contractVersion}' = "shadow_feedback_artifact"."key_contract_version" AND "shadow_feedback_artifact"."artifact"#>>'{key,keyFingerprint}' = "shadow_feedback_artifact"."artifact_key_fingerprint" AND "shadow_feedback_artifact"."artifact"#>>'{key,sessionId}' = "shadow_feedback_artifact"."session_id"::text AND "shadow_feedback_artifact"."artifact"#>>'{key,trustedBlockFingerprint}' = "shadow_feedback_artifact"."trusted_block_fingerprint" AND "shadow_feedback_artifact"."artifact"#>>'{key,rubricVersion}' = "shadow_feedback_artifact"."rubric_version" AND "shadow_feedback_artifact"."artifact"#>>'{key,promptVersion}' = "shadow_feedback_artifact"."prompt_version" AND "shadow_feedback_artifact"."artifact"#>>'{key,selectionSchemaVersion}' = "shadow_feedback_artifact"."selection_schema_version" AND "shadow_feedback_artifact"."artifact"#>>'{key,modelVersion}' = "shadow_feedback_artifact"."model_version" AND jsonb_typeof("shadow_feedback_artifact"."artifact"->'outcome') = 'object' AND jsonb_typeof("shadow_feedback_artifact"."artifact"->'metrics') = 'object' AND octet_length("shadow_feedback_artifact"."artifact"::text) <= 64000)
);
--> statement-breakpoint
ALTER TABLE "shadow_feedback_artifact" ADD CONSTRAINT "shadow_feedback_artifact_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_feedback_artifact" ADD CONSTRAINT "shadow_feedback_artifact_session_owner_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."interview_session"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shadow_feedback_artifact_user_timeline_idx" ON "shadow_feedback_artifact" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "shadow_feedback_artifact_session_idx" ON "shadow_feedback_artifact" USING btree ("session_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_shadow_feedback_artifact_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'shadow_feedback_artifact_immutable';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION reject_shadow_feedback_artifact_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reject_shadow_feedback_artifact_update()
  TO service_role;
--> statement-breakpoint
CREATE TRIGGER shadow_feedback_artifact_immutable
BEFORE UPDATE ON "shadow_feedback_artifact"
FOR EACH ROW
EXECUTE FUNCTION reject_shadow_feedback_artifact_update();
--> statement-breakpoint
COMMENT ON TABLE "shadow_feedback_artifact" IS
  'Immutable service-only shadow evaluation artifacts. Rows are non-authoritative and contain no transcript text, provider payload, provider request ID, or raw error.';
COMMENT ON COLUMN "shadow_feedback_artifact"."artifact_key_fingerprint" IS
  'SHA-256 binding of session, trusted block fingerprint, rubric, prompt, selection schema, and model versions.';
--> statement-breakpoint
ALTER TABLE "shadow_feedback_artifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shadow_feedback_artifact" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "shadow_feedback_artifact"
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE "shadow_feedback_artifact"
  TO service_role;
