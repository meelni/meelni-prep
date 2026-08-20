CREATE TABLE "adaptive_interviewer_preview_shadow_cohort_stop_event" (
	"stop_event_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"integrity_sha256" text NOT NULL,
	"run_id" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"recorded_ledger_revision" integer NOT NULL,
	CONSTRAINT "adaptive_interviewer_preview_shadow_stop_event_run_reason_uniq" UNIQUE("run_id","reason"),
	CONSTRAINT "preview_shadow_stop_event_run_revision_uniq" UNIQUE("run_id","recorded_ledger_revision"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_stop_event_digest_check" CHECK ("adaptive_interviewer_preview_shadow_cohort_stop_event"."stop_event_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_cohort_stop_event"."integrity_sha256" = "adaptive_interviewer_preview_shadow_cohort_stop_event"."stop_event_id" AND
          "adaptive_interviewer_preview_shadow_cohort_stop_event"."run_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_cohort_stop_event"."evidence_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_stop_event_shape_check" CHECK ("adaptive_interviewer_preview_shadow_cohort_stop_event"."contract_version" = 'adaptive-interviewer-preview-shadow-cohort-stop-event.v1' AND
          "adaptive_interviewer_preview_shadow_cohort_stop_event"."reason" IN (
            'evidence_digest_drift',
            'version_pin_mismatch',
            'unauthorized_stage_or_cohort',
            'deterministic_invariant_regression',
            'session_or_transcript_loss',
            'kill_switch_failure',
            'maximum_sessions_reached',
            'maximum_spend_reached',
            'maximum_cumulative_spend_reached'
          ) AND
          "adaptive_interviewer_preview_shadow_cohort_stop_event"."recorded_ledger_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "adaptive_interviewer_preview_shadow_run" (
	"run_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"authorization_contract_version" text NOT NULL,
	"authorization_id" text NOT NULL,
	"authorization_nonce" text NOT NULL,
	"owner_decision_artifact_sha256" text NOT NULL,
	"owner_decision_reference" text NOT NULL,
	"owner_decided_at" timestamp with time zone NOT NULL,
	"authorization_expires_at" timestamp with time zone NOT NULL,
	"owner_signing_key_id" text NOT NULL,
	"candidate_git_sha" text NOT NULL,
	"preview_shadow_configuration_sha256" text NOT NULL,
	"selected_candidate_configuration_sha256" text NOT NULL,
	"target_stage" text NOT NULL,
	"target_environment" text NOT NULL,
	"target_cohort" text NOT NULL,
	"exposure" text NOT NULL,
	"maximum_sessions" integer NOT NULL,
	"maximum_spend_nano_usd" bigint NOT NULL,
	"maximum_cumulative_spend_nano_usd" bigint NOT NULL,
	"allocated_session_count" integer DEFAULT 0 NOT NULL,
	"reconciled_spend_nano_usd" bigint DEFAULT 0 NOT NULL,
	"outstanding_session_reservations_nano_usd" bigint DEFAULT 0 NOT NULL,
	"stop_incomplete_excess_spend_nano_usd" bigint DEFAULT 0 NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"run_control_capability_sha256" text NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "preview_shadow_run_authorization_id_uniq" UNIQUE("authorization_id"),
	CONSTRAINT "preview_shadow_run_authorization_nonce_uniq" UNIQUE("authorization_nonce"),
	CONSTRAINT "preview_shadow_run_artifact_uniq" UNIQUE("owner_decision_artifact_sha256"),
	CONSTRAINT "preview_shadow_run_decision_ref_uniq" UNIQUE("owner_decision_reference"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_run_contract_check" CHECK ("adaptive_interviewer_preview_shadow_run"."contract_version" = 'adaptive-interviewer-preview-shadow-durable-control-plane.v1' AND
          "adaptive_interviewer_preview_shadow_run"."authorization_contract_version" = 'adaptive-interviewer-preview-shadow-authorization.v1'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_run_digest_shape_check" CHECK ("adaptive_interviewer_preview_shadow_run"."run_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."authorization_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."authorization_nonce" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."owner_decision_artifact_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."preview_shadow_configuration_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."selected_candidate_configuration_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."run_control_capability_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_run"."candidate_git_sha" ~ '^[0-9a-f]{40}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_run_target_check" CHECK ("adaptive_interviewer_preview_shadow_run"."target_stage" = 'preview_shadow' AND
          "adaptive_interviewer_preview_shadow_run"."target_environment" = 'preview_staging' AND
          "adaptive_interviewer_preview_shadow_run"."target_cohort" = 'shadow' AND
          "adaptive_interviewer_preview_shadow_run"."exposure" = 'none'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_run_owner_check" CHECK ("adaptive_interviewer_preview_shadow_run"."owner_decision_reference" ~ '^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$' AND
          "adaptive_interviewer_preview_shadow_run"."owner_signing_key_id" ~ '^[A-Za-z0-9._-]{1,80}$' AND
          "adaptive_interviewer_preview_shadow_run"."authorization_expires_at" > "adaptive_interviewer_preview_shadow_run"."owner_decided_at" AND
          "adaptive_interviewer_preview_shadow_run"."activated_at" >= "adaptive_interviewer_preview_shadow_run"."owner_decided_at" AND
          "adaptive_interviewer_preview_shadow_run"."activated_at" < "adaptive_interviewer_preview_shadow_run"."authorization_expires_at"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_run_caps_check" CHECK ("adaptive_interviewer_preview_shadow_run"."maximum_sessions" = 25 AND
          "adaptive_interviewer_preview_shadow_run"."maximum_spend_nano_usd" = 25000000000 AND
          "adaptive_interviewer_preview_shadow_run"."maximum_cumulative_spend_nano_usd" = 10000000000 AND
          "adaptive_interviewer_preview_shadow_run"."allocated_session_count" BETWEEN 0 AND 25 AND
          "adaptive_interviewer_preview_shadow_run"."reconciled_spend_nano_usd" BETWEEN 0 AND 6250000000000 AND
          "adaptive_interviewer_preview_shadow_run"."outstanding_session_reservations_nano_usd" BETWEEN 0 AND 25000000000 AND
          "adaptive_interviewer_preview_shadow_run"."stop_incomplete_excess_spend_nano_usd" BETWEEN 0 AND 6250000000000 AND
          "adaptive_interviewer_preview_shadow_run"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "adaptive_interviewer_preview_shadow_session_lease" (
	"lease_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"integrity_sha256" text NOT NULL,
	"run_id" text NOT NULL,
	"authorization_id" text NOT NULL,
	"candidate_git_sha" text NOT NULL,
	"preview_shadow_configuration_sha256" text NOT NULL,
	"adapter_id" text NOT NULL,
	"adapter_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"target_stage" text NOT NULL,
	"target_environment" text NOT NULL,
	"target_cohort" text NOT NULL,
	"exposure" text NOT NULL,
	"session_ordinal" integer NOT NULL,
	"session_binding_sha256" text NOT NULL,
	"session_budget_nano_usd" bigint NOT NULL,
	"maximum_attempts" integer NOT NULL,
	"attempt_reservation_nano_usd" bigint NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"allocation_ledger_revision" integer NOT NULL,
	"worker_evidence_capability_sha256" text NOT NULL,
	"termination_capability_sha256" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_run_ordinal_uniq" UNIQUE("run_id","session_ordinal"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_run_binding_uniq" UNIQUE("run_id","session_binding_sha256"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_run_revision_uniq" UNIQUE("run_id","allocation_ledger_revision"),
	CONSTRAINT "preview_shadow_lease_evidence_binding_uniq" UNIQUE("run_id","lease_id","session_ordinal","allocation_ledger_revision","preview_shadow_configuration_sha256"),
	CONSTRAINT "preview_shadow_lease_worker_capability_uniq" UNIQUE("worker_evidence_capability_sha256"),
	CONSTRAINT "preview_shadow_lease_termination_capability_uniq" UNIQUE("termination_capability_sha256"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_digest_check" CHECK ("adaptive_interviewer_preview_shadow_session_lease"."lease_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."integrity_sha256" = "adaptive_interviewer_preview_shadow_session_lease"."lease_id" AND
          "adaptive_interviewer_preview_shadow_session_lease"."run_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."authorization_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."candidate_git_sha" ~ '^[0-9a-f]{40}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."preview_shadow_configuration_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."session_binding_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."worker_evidence_capability_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_lease"."termination_capability_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_contract_check" CHECK ("adaptive_interviewer_preview_shadow_session_lease"."contract_version" = 'adaptive-interviewer-preview-shadow-session-lease.v1' AND
          "adaptive_interviewer_preview_shadow_session_lease"."adapter_id" = 'meelni_director_openai_responses' AND
          "adaptive_interviewer_preview_shadow_session_lease"."adapter_version" = 'interview-director-adapter.openai-responses.v1' AND
          "adaptive_interviewer_preview_shadow_session_lease"."provider" = 'openai-api' AND
          "adaptive_interviewer_preview_shadow_session_lease"."model" = 'gpt-5.4-mini-2026-03-17' AND
          "adaptive_interviewer_preview_shadow_session_lease"."target_stage" = 'preview_shadow' AND
          "adaptive_interviewer_preview_shadow_session_lease"."target_environment" = 'preview_staging' AND
          "adaptive_interviewer_preview_shadow_session_lease"."target_cohort" = 'shadow' AND
          "adaptive_interviewer_preview_shadow_session_lease"."exposure" = 'none'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_limits_check" CHECK ("adaptive_interviewer_preview_shadow_session_lease"."session_ordinal" BETWEEN 1 AND 25 AND
          "adaptive_interviewer_preview_shadow_session_lease"."session_budget_nano_usd" = 1000000000 AND
          "adaptive_interviewer_preview_shadow_session_lease"."maximum_attempts" = 10 AND
          "adaptive_interviewer_preview_shadow_session_lease"."attempt_reservation_nano_usd" = 100000000 AND
          "adaptive_interviewer_preview_shadow_session_lease"."allocation_ledger_revision" > 0 AND
          "adaptive_interviewer_preview_shadow_session_lease"."expires_at" > "adaptive_interviewer_preview_shadow_session_lease"."issued_at" AND
          "adaptive_interviewer_preview_shadow_session_lease"."expires_at" <= "adaptive_interviewer_preview_shadow_session_lease"."issued_at" + interval '1 hour'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_lease_state_check" CHECK ("adaptive_interviewer_preview_shadow_session_lease"."state" IN ('open', 'revoked', 'settled', 'stopped', 'stop_incomplete', 'termination_acknowledged'))
);
--> statement-breakpoint
CREATE TABLE "adaptive_interviewer_preview_shadow_session_receipt" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"integrity_sha256" text NOT NULL,
	"run_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"session_ordinal" integer NOT NULL,
	"allocation_ledger_revision" integer NOT NULL,
	"preview_shadow_configuration_sha256" text NOT NULL,
	"outcome" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"reconciled_spend_nano_usd" bigint NOT NULL,
	"outstanding_attempt_reservations_nano_usd" bigint NOT NULL,
	"attempt_receipts_sha256" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"recorded_ledger_revision" integer NOT NULL,
	CONSTRAINT "adaptive_interviewer_preview_shadow_receipt_run_revision_uniq" UNIQUE("run_id","recorded_ledger_revision"),
	CONSTRAINT "preview_shadow_receipt_lease_uniq" UNIQUE("lease_id"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_receipt_digest_check" CHECK ("adaptive_interviewer_preview_shadow_session_receipt"."receipt_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_receipt"."integrity_sha256" = "adaptive_interviewer_preview_shadow_session_receipt"."receipt_id" AND
          "adaptive_interviewer_preview_shadow_session_receipt"."run_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_receipt"."lease_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_receipt"."preview_shadow_configuration_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_session_receipt"."attempt_receipts_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_receipt_shape_check" CHECK ("adaptive_interviewer_preview_shadow_session_receipt"."contract_version" = 'adaptive-interviewer-preview-shadow-session-receipt.v1' AND
          "adaptive_interviewer_preview_shadow_session_receipt"."outcome" IN ('settled', 'stopped') AND
          "adaptive_interviewer_preview_shadow_session_receipt"."session_ordinal" BETWEEN 1 AND 25 AND
          "adaptive_interviewer_preview_shadow_session_receipt"."allocation_ledger_revision" > 0 AND
          "adaptive_interviewer_preview_shadow_session_receipt"."recorded_ledger_revision" > "adaptive_interviewer_preview_shadow_session_receipt"."allocation_ledger_revision" AND
          "adaptive_interviewer_preview_shadow_session_receipt"."attempt_count" BETWEEN 0 AND 10 AND
          "adaptive_interviewer_preview_shadow_session_receipt"."reconciled_spend_nano_usd" BETWEEN "adaptive_interviewer_preview_shadow_session_receipt"."attempt_count" * 100000000::bigint AND 250000000000 AND
          "adaptive_interviewer_preview_shadow_session_receipt"."outstanding_attempt_reservations_nano_usd" = 0)
);
--> statement-breakpoint
CREATE TABLE "adaptive_interviewer_preview_shadow_stop_incomplete_incident" (
	"incident_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"integrity_sha256" text NOT NULL,
	"run_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"session_ordinal" integer NOT NULL,
	"allocation_ledger_revision" integer NOT NULL,
	"preview_shadow_configuration_sha256" text NOT NULL,
	"reason" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"reconciled_spend_nano_usd" bigint NOT NULL,
	"retained_session_reservation_nano_usd" bigint NOT NULL,
	"attempt_receipts_sha256" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"requires_allocation_stop" boolean NOT NULL,
	"termination_acknowledgement_required" boolean NOT NULL,
	"recorded_ledger_revision" integer NOT NULL,
	CONSTRAINT "adaptive_interviewer_preview_shadow_incident_run_revision_uniq" UNIQUE("run_id","recorded_ledger_revision"),
	CONSTRAINT "preview_shadow_incident_lease_uniq" UNIQUE("lease_id"),
	CONSTRAINT "preview_shadow_incident_ack_binding_uniq" UNIQUE("run_id","lease_id","incident_id"),
	CONSTRAINT "adaptive_interviewer_preview_shadow_incident_digest_check" CHECK ("adaptive_interviewer_preview_shadow_stop_incomplete_incident"."incident_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."integrity_sha256" = "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."incident_id" AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."run_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."lease_id" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."preview_shadow_configuration_sha256" ~ '^[0-9a-f]{64}$' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."attempt_receipts_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_incident_shape_check" CHECK ("adaptive_interviewer_preview_shadow_stop_incomplete_incident"."contract_version" = 'adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."reason" = 'cleanup_unconfirmed' AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."session_ordinal" BETWEEN 1 AND 25 AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."allocation_ledger_revision" > 0 AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."recorded_ledger_revision" > "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."allocation_ledger_revision" AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."attempt_count" BETWEEN 0 AND 10 AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."reconciled_spend_nano_usd" BETWEEN "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."attempt_count" * 100000000::bigint AND 250000000000 AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."retained_session_reservation_nano_usd" = 1000000000 AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."requires_allocation_stop" AND
          "adaptive_interviewer_preview_shadow_stop_incomplete_incident"."termination_acknowledgement_required")
);
--> statement-breakpoint
CREATE TABLE "adaptive_interviewer_preview_shadow_termination_acknowledgement" (
	"acknowledgement_id" text PRIMARY KEY NOT NULL,
	"contract_version" text NOT NULL,
	"integrity_sha256" text NOT NULL,
	"run_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"disposition" text NOT NULL,
	"termination_evidence_sha256" text NOT NULL,
	"final_reconciled_spend_nano_usd" bigint NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	"recorded_ledger_revision" integer NOT NULL,
	CONSTRAINT "preview_shadow_termination_ack_run_revision_uniq" UNIQUE("run_id","recorded_ledger_revision"),
	CONSTRAINT "preview_shadow_ack_lease_uniq" UNIQUE("lease_id"),
	CONSTRAINT "preview_shadow_ack_incident_uniq" UNIQUE("incident_id"),
	CONSTRAINT "preview_shadow_termination_ack_digest_check" CHECK ("adaptive_interviewer_preview_shadow_termination_acknowledgement"."acknowledgement_id" ~ '^[0-9a-f]{64}$' AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."integrity_sha256" = "adaptive_interviewer_preview_shadow_termination_acknowledgement"."acknowledgement_id" AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."run_id" ~ '^[0-9a-f]{64}$' AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."lease_id" ~ '^[0-9a-f]{64}$' AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."incident_id" ~ '^[0-9a-f]{64}$' AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."termination_evidence_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "adaptive_interviewer_preview_shadow_termination_ack_shape_check" CHECK ("adaptive_interviewer_preview_shadow_termination_acknowledgement"."contract_version" = 'adaptive-interviewer-preview-shadow-termination-acknowledgement.v1' AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."disposition" IN ('worker_terminated', 'process_terminated') AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."final_reconciled_spend_nano_usd" BETWEEN 0 AND 250000000000 AND
            "adaptive_interviewer_preview_shadow_termination_acknowledgement"."recorded_ledger_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_cohort_stop_event" ADD CONSTRAINT "preview_shadow_stop_event_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."adaptive_interviewer_preview_shadow_run"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_lease" ADD CONSTRAINT "preview_shadow_lease_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."adaptive_interviewer_preview_shadow_run"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_receipt" ADD CONSTRAINT "preview_shadow_receipt_exact_lease_fk" FOREIGN KEY ("run_id","lease_id","session_ordinal","allocation_ledger_revision","preview_shadow_configuration_sha256") REFERENCES "public"."adaptive_interviewer_preview_shadow_session_lease"("run_id","lease_id","session_ordinal","allocation_ledger_revision","preview_shadow_configuration_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_stop_incomplete_incident" ADD CONSTRAINT "preview_shadow_incident_exact_lease_fk" FOREIGN KEY ("run_id","lease_id","session_ordinal","allocation_ledger_revision","preview_shadow_configuration_sha256") REFERENCES "public"."adaptive_interviewer_preview_shadow_session_lease"("run_id","lease_id","session_ordinal","allocation_ledger_revision","preview_shadow_configuration_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_termination_acknowledgement" ADD CONSTRAINT "preview_shadow_ack_exact_incident_fk" FOREIGN KEY ("run_id","lease_id","incident_id") REFERENCES "public"."adaptive_interviewer_preview_shadow_stop_incomplete_incident"("run_id","lease_id","incident_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adaptive_interviewer_preview_shadow_run_state_idx" ON "adaptive_interviewer_preview_shadow_run" USING btree ("stopped","authorization_expires_at");--> statement-breakpoint
CREATE INDEX "adaptive_interviewer_preview_shadow_lease_recovery_idx" ON "adaptive_interviewer_preview_shadow_session_lease" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "adaptive_interviewer_preview_shadow_termination_ack_run_idx" ON "adaptive_interviewer_preview_shadow_termination_acknowledgement" USING btree ("run_id","acknowledged_at");--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_run" IS 'Service-owned durable Preview-shadow activation and aggregate authority; contains no raw authorization, signature, capability, customer identity, or content';--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_session_lease" IS 'Service-owned pre-room Preview-shadow execution leases with domain-separated capability hashes only';--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_session_receipt" IS 'Content-free terminal Preview-shadow session accounting evidence';--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_stop_incomplete_incident" IS 'Content-free cleanup-unconfirmed evidence retaining conservative reservation authority';--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_cohort_stop_event" IS 'Content-free durable cohort allocation stop evidence';--> statement-breakpoint
COMMENT ON TABLE "adaptive_interviewer_preview_shadow_termination_acknowledgement" IS 'Content-free capability-authenticated process or worker termination recovery evidence';--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_run" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_lease" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_lease" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_session_receipt" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_stop_incomplete_incident" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_stop_incomplete_incident" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_cohort_stop_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_cohort_stop_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_termination_acknowledgement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "adaptive_interviewer_preview_shadow_termination_acknowledgement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE
  "adaptive_interviewer_preview_shadow_run",
  "adaptive_interviewer_preview_shadow_session_lease",
  "adaptive_interviewer_preview_shadow_session_receipt",
  "adaptive_interviewer_preview_shadow_stop_incomplete_incident",
  "adaptive_interviewer_preview_shadow_cohort_stop_event",
  "adaptive_interviewer_preview_shadow_termination_acknowledgement"
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  "adaptive_interviewer_preview_shadow_run",
  "adaptive_interviewer_preview_shadow_session_lease"
TO service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE
  "adaptive_interviewer_preview_shadow_session_receipt",
  "adaptive_interviewer_preview_shadow_stop_incomplete_incident",
  "adaptive_interviewer_preview_shadow_cohort_stop_event",
  "adaptive_interviewer_preview_shadow_termination_acknowledgement"
TO service_role;
