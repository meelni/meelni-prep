CREATE TABLE "feedback_generation_stage_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"generation_event_fence" text NOT NULL,
	"workflow_attempt" integer NOT NULL,
	"operation" text NOT NULL,
	"stage" text NOT NULL,
	"provider_attempt" integer,
	"outcome" text NOT NULL,
	"failure_class" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"duration_bucket" text NOT NULL,
	"remaining_budget_ms" integer NOT NULL,
	"retry_after_ms" integer,
	"environment_class" text NOT NULL,
	"release" text,
	"provider_diagnostic_kind" text,
	"provider_http_status" integer,
	"observed_model" text,
	"observed_service_tier" text,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_generation_stage_attempt_exact_idx" UNIQUE NULLS NOT DISTINCT("feedback_id","generation_event_fence","workflow_attempt","operation","provider_attempt"),
	CONSTRAINT "feedback_generation_stage_attempt_event_fence_check" CHECK ("feedback_generation_stage_attempt"."generation_event_fence" ~ '^v1:[a-f0-9]{64}$'),
	CONSTRAINT "feedback_generation_stage_attempt_workflow_attempt_check" CHECK ("feedback_generation_stage_attempt"."workflow_attempt" BETWEEN 1 AND 3),
	CONSTRAINT "feedback_generation_stage_attempt_operation_check" CHECK ("feedback_generation_stage_attempt"."operation" IN ('queue_wait', 'authorization', 'claim', 'legacy_evidence', 'answer_blocks', 'provider_request', 'provider_response', 'complete', 'skip')),
	CONSTRAINT "feedback_generation_stage_attempt_stage_check" CHECK ("feedback_generation_stage_attempt"."stage" IN ('claim', 'evidence_preparation', 'provider', 'validation', 'persistence')),
	CONSTRAINT "feedback_generation_stage_attempt_operation_stage_check" CHECK ((
        "feedback_generation_stage_attempt"."operation" IN ('queue_wait', 'authorization', 'claim') AND "feedback_generation_stage_attempt"."stage" = 'claim'
      ) OR (
        "feedback_generation_stage_attempt"."operation" IN ('legacy_evidence', 'answer_blocks') AND "feedback_generation_stage_attempt"."stage" = 'evidence_preparation'
      ) OR (
        "feedback_generation_stage_attempt"."operation" = 'provider_request' AND "feedback_generation_stage_attempt"."stage" = 'provider'
      ) OR (
        "feedback_generation_stage_attempt"."operation" = 'provider_response' AND "feedback_generation_stage_attempt"."stage" = 'validation'
      ) OR (
        "feedback_generation_stage_attempt"."operation" IN ('complete', 'skip') AND "feedback_generation_stage_attempt"."stage" = 'persistence'
      )),
	CONSTRAINT "feedback_generation_stage_attempt_provider_attempt_check" CHECK ((
        "feedback_generation_stage_attempt"."operation" IN ('provider_request', 'provider_response') AND "feedback_generation_stage_attempt"."provider_attempt" BETWEEN 1 AND 3
      ) OR (
        "feedback_generation_stage_attempt"."operation" NOT IN ('provider_request', 'provider_response') AND "feedback_generation_stage_attempt"."provider_attempt" IS NULL
      )),
	CONSTRAINT "feedback_generation_stage_attempt_outcome_check" CHECK ("feedback_generation_stage_attempt"."outcome" IN ('succeeded', 'retrying', 'skipped', 'failed', 'fenced')),
	CONSTRAINT "feedback_generation_stage_attempt_failure_class_check" CHECK ("feedback_generation_stage_attempt"."failure_class" IS NULL OR "feedback_generation_stage_attempt"."failure_class" IN ('deadline_exceeded', 'transport_timeout', 'transport_network', 'provider_rate_limited', 'provider_capacity', 'provider_authentication', 'provider_configuration', 'provider_refusal', 'provider_schema', 'provider_contract', 'evidence_integrity', 'fenced', 'persistence', 'internal')),
	CONSTRAINT "feedback_generation_stage_attempt_outcome_failure_check" CHECK ((
        "feedback_generation_stage_attempt"."outcome" IN ('succeeded', 'skipped') AND "feedback_generation_stage_attempt"."failure_class" IS NULL AND "feedback_generation_stage_attempt"."retryable" = false
      ) OR (
        "feedback_generation_stage_attempt"."outcome" = 'retrying' AND "feedback_generation_stage_attempt"."failure_class" IS NOT NULL AND "feedback_generation_stage_attempt"."retryable" = true
      ) OR (
        "feedback_generation_stage_attempt"."outcome" = 'failed' AND "feedback_generation_stage_attempt"."failure_class" IS NOT NULL AND "feedback_generation_stage_attempt"."retryable" = false
      ) OR (
        "feedback_generation_stage_attempt"."outcome" = 'fenced' AND "feedback_generation_stage_attempt"."failure_class" = 'fenced' AND "feedback_generation_stage_attempt"."retryable" = false
      )),
	CONSTRAINT "feedback_generation_stage_attempt_timing_check" CHECK ("feedback_generation_stage_attempt"."completed_at" = "feedback_generation_stage_attempt"."started_at" + ("feedback_generation_stage_attempt"."duration_ms" * INTERVAL '1 millisecond') AND "feedback_generation_stage_attempt"."duration_ms" BETWEEN 0 AND 90000 AND "feedback_generation_stage_attempt"."remaining_budget_ms" BETWEEN 0 AND 90000 AND ("feedback_generation_stage_attempt"."retry_after_ms" IS NULL OR "feedback_generation_stage_attempt"."retry_after_ms" BETWEEN 0 AND 90000)),
	CONSTRAINT "feedback_generation_stage_attempt_duration_bucket_check" CHECK ((
        "feedback_generation_stage_attempt"."duration_bucket" = 'lt_1s' AND "feedback_generation_stage_attempt"."duration_ms" >= 0 AND "feedback_generation_stage_attempt"."duration_ms" < 1000
      ) OR (
        "feedback_generation_stage_attempt"."duration_bucket" = '1s_to_5s' AND "feedback_generation_stage_attempt"."duration_ms" >= 1000 AND "feedback_generation_stage_attempt"."duration_ms" < 5000
      ) OR (
        "feedback_generation_stage_attempt"."duration_bucket" = '5s_to_15s' AND "feedback_generation_stage_attempt"."duration_ms" >= 5000 AND "feedback_generation_stage_attempt"."duration_ms" < 15000
      ) OR (
        "feedback_generation_stage_attempt"."duration_bucket" = '15s_to_45s' AND "feedback_generation_stage_attempt"."duration_ms" >= 15000 AND "feedback_generation_stage_attempt"."duration_ms" < 45000
      ) OR (
        "feedback_generation_stage_attempt"."duration_bucket" = '45s_to_90s' AND "feedback_generation_stage_attempt"."duration_ms" >= 45000 AND "feedback_generation_stage_attempt"."duration_ms" <= 90000
      )),
	CONSTRAINT "feedback_generation_stage_attempt_environment_check" CHECK ("feedback_generation_stage_attempt"."environment_class" IN ('local', 'test', 'preview', 'staging', 'production', 'unknown')),
	CONSTRAINT "feedback_generation_stage_attempt_release_check" CHECK ("feedback_generation_stage_attempt"."release" IS NULL OR "feedback_generation_stage_attempt"."release" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
	CONSTRAINT "feedback_generation_stage_attempt_provider_diagnostic_check" CHECK ("feedback_generation_stage_attempt"."provider_diagnostic_kind" IS NULL OR "feedback_generation_stage_attempt"."provider_diagnostic_kind" IN ('provider_bad_request', 'provider_authentication', 'provider_permission', 'provider_not_found', 'provider_conflict', 'provider_unprocessable', 'provider_rate_limited', 'provider_timeout', 'provider_network', 'provider_aborted', 'provider_server_error', 'provider_unknown')),
	CONSTRAINT "feedback_generation_stage_attempt_provider_status_check" CHECK ("feedback_generation_stage_attempt"."provider_http_status" IS NULL OR "feedback_generation_stage_attempt"."provider_http_status" BETWEEN 100 AND 599),
	CONSTRAINT "feedback_generation_stage_attempt_provider_context_check" CHECK ((
        "feedback_generation_stage_attempt"."operation" NOT IN ('provider_request', 'provider_response') AND
        "feedback_generation_stage_attempt"."retry_after_ms" IS NULL AND
        "feedback_generation_stage_attempt"."provider_diagnostic_kind" IS NULL AND
        "feedback_generation_stage_attempt"."provider_http_status" IS NULL AND
        "feedback_generation_stage_attempt"."observed_model" IS NULL AND
        "feedback_generation_stage_attempt"."observed_service_tier" IS NULL AND
        "feedback_generation_stage_attempt"."input_tokens" IS NULL AND
        "feedback_generation_stage_attempt"."cached_input_tokens" IS NULL AND
        "feedback_generation_stage_attempt"."output_tokens" IS NULL AND
        "feedback_generation_stage_attempt"."total_tokens" IS NULL
      ) OR (
        "feedback_generation_stage_attempt"."operation" = 'provider_request' AND
        ("feedback_generation_stage_attempt"."provider_http_status" IS NULL OR "feedback_generation_stage_attempt"."provider_diagnostic_kind" IS NOT NULL) AND
        ("feedback_generation_stage_attempt"."retry_after_ms" IS NULL OR "feedback_generation_stage_attempt"."outcome" = 'retrying')
      ) OR (
        "feedback_generation_stage_attempt"."operation" = 'provider_response' AND
        "feedback_generation_stage_attempt"."retry_after_ms" IS NULL AND
        ("feedback_generation_stage_attempt"."provider_http_status" IS NULL OR "feedback_generation_stage_attempt"."provider_diagnostic_kind" IS NOT NULL)
      )),
	CONSTRAINT "feedback_generation_stage_attempt_provider_label_check" CHECK (("feedback_generation_stage_attempt"."observed_model" IS NULL OR "feedback_generation_stage_attempt"."observed_model" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$') AND ("feedback_generation_stage_attempt"."observed_service_tier" IS NULL OR "feedback_generation_stage_attempt"."observed_service_tier" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$')),
	CONSTRAINT "feedback_generation_stage_attempt_usage_tuple_check" CHECK ((
        "feedback_generation_stage_attempt"."input_tokens" IS NULL AND "feedback_generation_stage_attempt"."cached_input_tokens" IS NULL AND "feedback_generation_stage_attempt"."output_tokens" IS NULL AND "feedback_generation_stage_attempt"."total_tokens" IS NULL
      ) OR (
        "feedback_generation_stage_attempt"."input_tokens" BETWEEN 0 AND 10000000 AND
        "feedback_generation_stage_attempt"."cached_input_tokens" BETWEEN 0 AND 10000000 AND
        "feedback_generation_stage_attempt"."output_tokens" BETWEEN 0 AND 10000000 AND
        "feedback_generation_stage_attempt"."total_tokens" BETWEEN 0 AND 10000000
      ))
);
--> statement-breakpoint
ALTER TABLE "feedback_generation_stage_attempt" ADD CONSTRAINT "feedback_generation_stage_attempt_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_generation_stage_attempt_timeline_idx" ON "feedback_generation_stage_attempt" USING btree ("feedback_id","started_at");
--> statement-breakpoint
COMMENT ON TABLE "feedback_generation_stage_attempt" IS
  'Content-free service-only stage history. generation_event_fence is a v1 SHA-256 of the internal feedback workflow event; raw event and provider request IDs are forbidden.';
COMMENT ON COLUMN "feedback_generation_stage_attempt"."generation_event_fence" IS
  'Versioned one-way exact-generation-event fence; never a raw event or provider request ID.';
--> statement-breakpoint
ALTER TABLE "feedback_generation_stage_attempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_generation_stage_attempt" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "feedback_generation_stage_attempt"
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE "feedback_generation_stage_attempt"
  TO service_role;
