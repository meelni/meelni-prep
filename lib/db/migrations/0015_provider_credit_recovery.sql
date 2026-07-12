ALTER TABLE "interview_session" ADD COLUMN "billing_fault" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "billing_fault_code" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "runtime_failure_event_id" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "runtime_failure_code" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "runtime_failure_retryable" boolean;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "runtime_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_policy_version" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_settlement_action" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_settlement_reason" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_settlement_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "credit_make_good_grant_id" uuid;--> statement-breakpoint
UPDATE "interview_session"
SET
  "billing_fault" = CASE
    WHEN "terminal_reason" = 'provider_failure' THEN 'provider'
    ELSE 'user'
  END,
  "billing_fault_code" = CASE
    WHEN "terminal_reason" IN (
      'user_end', 'time_limit', 'disconnect_timeout', 'provider_failure',
      'insufficient_signal', 'legacy_unknown'
    ) THEN "terminal_reason"
    ELSE 'legacy_unknown'
  END
WHERE "start_contract_version" = 1
  AND "lifecycle_state" IN ('completed', 'abandoned', 'failed')
  AND "billing_fault" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_session_runtime_failure_event_idx" ON "interview_session" USING btree ("runtime_failure_event_id") WHERE "interview_session"."runtime_failure_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "interview_session_credit_settlement_recovery_idx" ON "interview_session" USING btree ("start_contract_version","lifecycle_state","credit_settled_at","last_transition_at");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_billing_fault_shape_check" CHECK ((
        "interview_session"."start_contract_version" = 0 AND
        "interview_session"."billing_fault" IS NULL AND
        "interview_session"."billing_fault_code" IS NULL
      ) OR (
        "interview_session"."lifecycle_state" IN ('completed', 'abandoned', 'failed') AND
        "interview_session"."billing_fault" IN ('user', 'provider', 'integrity') AND
        "interview_session"."billing_fault_code" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'
      ) OR (
        "interview_session"."lifecycle_state" = 'ending' AND (
          ("interview_session"."billing_fault" IS NULL AND "interview_session"."billing_fault_code" IS NULL) OR
          ("interview_session"."billing_fault" IN ('user', 'provider', 'integrity') AND
            "interview_session"."billing_fault_code" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$')
        )
      ) OR (
        "interview_session"."lifecycle_state" NOT IN ('ending', 'completed', 'abandoned', 'failed') AND
        "interview_session"."billing_fault" IS NULL AND
        "interview_session"."billing_fault_code" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_runtime_failure_shape_check" CHECK ((
        "interview_session"."runtime_failure_event_id" IS NULL AND
        "interview_session"."runtime_failure_code" IS NULL AND
        "interview_session"."runtime_failure_retryable" IS NULL AND
        "interview_session"."runtime_failed_at" IS NULL
      ) OR (
        "interview_session"."start_contract_version" = 1 AND
        "interview_session"."billing_fault" = 'provider' AND
        length("interview_session"."runtime_failure_event_id") > 0 AND
        "interview_session"."runtime_failure_code" = "interview_session"."billing_fault_code" AND
        "interview_session"."runtime_failure_code" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$' AND
        "interview_session"."runtime_failure_retryable" IS NOT NULL AND
        "interview_session"."runtime_failed_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_credit_settlement_shape_check" CHECK ((
        "interview_session"."credit_policy_version" IS NULL AND
        "interview_session"."credit_settlement_action" IS NULL AND
        "interview_session"."credit_settlement_reason" IS NULL AND
        "interview_session"."credit_settlement_idempotency_key" IS NULL AND
        "interview_session"."credit_settled_at" IS NULL AND
        "interview_session"."credit_make_good_grant_id" IS NULL
      ) OR (
        "interview_session"."start_contract_version" = 1 AND
        "interview_session"."lifecycle_state" IN ('completed', 'abandoned', 'failed') AND
        "interview_session"."billing_fault" IS NOT NULL AND
        "interview_session"."credit_policy_version" = 'interview-credit-recovery.v1' AND
        "interview_session"."credit_settlement_action" IN ('release', 'refund', 'retain') AND
        "interview_session"."credit_settlement_reason" IN (
          'terminal_before_usable',
          'provider_failure_after_usable',
          'integrity_failure_after_usable',
          'user_outcome_after_usable'
        ) AND
        length("interview_session"."credit_settlement_idempotency_key") > 0 AND
        "interview_session"."credit_settled_at" IS NOT NULL AND
        ("interview_session"."credit_make_good_grant_id" IS NULL OR
          "interview_session"."credit_settlement_action" = 'refund')
      ));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_credit_settlement_policy_check" CHECK ("interview_session"."credit_settlement_action" IS NULL OR
        ("interview_session"."credit_settlement_action" = 'release' AND
          "interview_session"."credit_settlement_reason" = 'terminal_before_usable') OR
        ("interview_session"."credit_settlement_action" = 'refund' AND
          "interview_session"."billing_fault" = 'provider' AND
          "interview_session"."credit_settlement_reason" = 'provider_failure_after_usable') OR
        ("interview_session"."credit_settlement_action" = 'refund' AND
          "interview_session"."billing_fault" = 'integrity' AND
          "interview_session"."credit_settlement_reason" = 'integrity_failure_after_usable') OR
        ("interview_session"."credit_settlement_action" = 'retain' AND
          "interview_session"."billing_fault" = 'user' AND
          "interview_session"."credit_settlement_reason" = 'user_outcome_after_usable'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_interview_credit_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.billing_fault IS NOT NULL AND (
    NEW.billing_fault IS DISTINCT FROM OLD.billing_fault OR
    NEW.billing_fault_code IS DISTINCT FROM OLD.billing_fault_code
  ) THEN
    RAISE EXCEPTION 'interview billing fault evidence is immutable';
  END IF;

  IF OLD.runtime_failure_event_id IS NOT NULL AND (
    NEW.runtime_failure_event_id IS DISTINCT FROM OLD.runtime_failure_event_id OR
    NEW.runtime_failure_code IS DISTINCT FROM OLD.runtime_failure_code OR
    NEW.runtime_failure_retryable IS DISTINCT FROM OLD.runtime_failure_retryable OR
    NEW.runtime_failed_at IS DISTINCT FROM OLD.runtime_failed_at
  ) THEN
    RAISE EXCEPTION 'interview runtime failure evidence is immutable';
  END IF;

  IF OLD.credit_settled_at IS NOT NULL AND (
    NEW.credit_policy_version IS DISTINCT FROM OLD.credit_policy_version OR
    NEW.credit_settlement_action IS DISTINCT FROM OLD.credit_settlement_action OR
    NEW.credit_settlement_reason IS DISTINCT FROM OLD.credit_settlement_reason OR
    NEW.credit_settlement_idempotency_key IS DISTINCT FROM OLD.credit_settlement_idempotency_key OR
    NEW.credit_settled_at IS DISTINCT FROM OLD.credit_settled_at OR
    NEW.credit_make_good_grant_id IS DISTINCT FROM OLD.credit_make_good_grant_id
  ) THEN
    RAISE EXCEPTION 'interview credit settlement evidence is immutable';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_interview_credit_evidence_immutable() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_interview_credit_evidence_immutable() FROM anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION enforce_interview_credit_evidence_immutable() FROM authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION enforce_interview_credit_evidence_immutable() TO service_role;--> statement-breakpoint
DROP TRIGGER IF EXISTS interview_credit_evidence_immutable
  ON "interview_session";--> statement-breakpoint
CREATE TRIGGER interview_credit_evidence_immutable
BEFORE UPDATE ON "interview_session"
FOR EACH ROW
EXECUTE FUNCTION enforce_interview_credit_evidence_immutable();
