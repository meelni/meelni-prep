DROP INDEX "session_question_session_idx";--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD COLUMN "start_contract_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD COLUMN "start_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "start_contract_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "start_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "start_request_fingerprint" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "provisioning_state" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "provisioning_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "provisioning_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "provisioned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "usable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "usable_transcript_event_id" text;--> statement-breakpoint
ALTER TABLE "session_question" ADD COLUMN "start_contract_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_question" ADD COLUMN "start_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_id_user_start_attempt_uniq" UNIQUE("id","user_id","start_attempt_id");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_id_start_attempt_uniq" UNIQUE("id","start_attempt_id");--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_session_user_start_attempt_fk" FOREIGN KEY ("session_id","user_id","start_attempt_id") REFERENCES "public"."interview_session"("id","user_id","start_attempt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_session_start_attempt_fk" FOREIGN KEY ("session_id","start_attempt_id") REFERENCES "public"."interview_session"("id","start_attempt_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_reservation_session_v1_idx" ON "credit_reservation" USING btree ("session_id") WHERE "credit_reservation"."start_contract_version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_reservation_start_attempt_idx" ON "credit_reservation" USING btree ("user_id","start_attempt_id") WHERE "credit_reservation"."start_contract_version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_session_user_start_attempt_idx" ON "interview_session" USING btree ("user_id","start_attempt_id") WHERE "interview_session"."start_contract_version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_session_livekit_room_v1_idx" ON "interview_session" USING btree ("livekit_room_name") WHERE "interview_session"."start_contract_version" = 1;--> statement-breakpoint
CREATE INDEX "interview_session_stable_provisioning_recovery_idx" ON "interview_session" USING btree ("provisioning_state","provisioning_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_question_start_attempt_idx" ON "session_question" USING btree ("start_attempt_id") WHERE "session_question"."start_contract_version" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX "session_question_session_idx" ON "session_question" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_start_contract_version_check" CHECK ("credit_reservation"."start_contract_version" IN (0, 1));--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_start_contract_shape_check" CHECK ((
        "credit_reservation"."start_contract_version" = 0 AND
        "credit_reservation"."start_attempt_id" IS NULL
      ) OR (
        "credit_reservation"."start_contract_version" = 1 AND
        "credit_reservation"."session_id" IS NOT NULL AND
        "credit_reservation"."start_attempt_id" IS NOT NULL AND
        "credit_reservation"."session_id" = "credit_reservation"."start_attempt_id" AND
        "credit_reservation"."reservation_key" =
          'interview-start:' || "credit_reservation"."user_id"::text || ':' ||
          "credit_reservation"."start_attempt_id"::text
      ));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_start_contract_version_check" CHECK ("interview_session"."start_contract_version" IN (0, 1));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_start_contract_shape_check" CHECK ((
        "interview_session"."start_contract_version" = 0 AND
        "interview_session"."start_attempt_id" IS NULL AND
        "interview_session"."start_request_fingerprint" IS NULL AND
        "interview_session"."provisioning_state" = 'legacy' AND
        "interview_session"."provisioning_lease_id" IS NULL AND
        "interview_session"."provisioning_lease_expires_at" IS NULL AND
        "interview_session"."provisioned_at" IS NULL AND
        "interview_session"."usable_at" IS NULL AND
        "interview_session"."usable_transcript_event_id" IS NULL
      ) OR (
        "interview_session"."start_contract_version" = 1 AND
        "interview_session"."start_attempt_id" IS NOT NULL AND
        "interview_session"."id" = "interview_session"."start_attempt_id" AND
        "interview_session"."start_request_fingerprint" ~ '^[0-9a-f]{64}$' AND
        "interview_session"."livekit_room_name" = 'interview-' || "interview_session"."start_attempt_id"::text AND
        "interview_session"."provisioning_state" IN ('pending', 'provisioning', 'ready', 'failed')
      ));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_provisioning_evidence_check" CHECK (CASE "interview_session"."provisioning_state"
        WHEN 'legacy' THEN
          "interview_session"."provisioning_lease_id" IS NULL AND
          "interview_session"."provisioning_lease_expires_at" IS NULL AND
          "interview_session"."provisioned_at" IS NULL
        WHEN 'pending' THEN
          "interview_session"."provisioning_lease_id" IS NULL AND
          "interview_session"."provisioning_lease_expires_at" IS NULL AND
          "interview_session"."provisioned_at" IS NULL
        WHEN 'provisioning' THEN
          "interview_session"."provisioning_lease_id" IS NOT NULL AND
          "interview_session"."provisioning_lease_expires_at" IS NOT NULL AND
          "interview_session"."provisioned_at" IS NULL
        WHEN 'ready' THEN
          "interview_session"."provisioning_lease_id" IS NULL AND
          "interview_session"."provisioning_lease_expires_at" IS NULL AND
          "interview_session"."provisioned_at" IS NOT NULL
        WHEN 'failed' THEN
          "interview_session"."provisioning_lease_id" IS NULL AND
          "interview_session"."provisioning_lease_expires_at" IS NULL AND
          "interview_session"."provisioned_at" IS NULL
        ELSE false
      END);--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_usable_evidence_check" CHECK ((
        "interview_session"."usable_at" IS NULL AND
        "interview_session"."usable_transcript_event_id" IS NULL
      ) OR (
        "interview_session"."start_contract_version" = 1 AND
        "interview_session"."activated_at" IS NOT NULL AND
        "interview_session"."usable_at" IS NOT NULL AND
        "interview_session"."usable_transcript_event_id" IS NOT NULL AND
        length("interview_session"."usable_transcript_event_id") > 0
      ));--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_start_contract_version_check" CHECK ("session_question"."start_contract_version" IN (0, 1));--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_start_contract_shape_check" CHECK ((
        "session_question"."start_contract_version" = 0 AND
        "session_question"."start_attempt_id" IS NULL
      ) OR (
        "session_question"."start_contract_version" = 1 AND
        "session_question"."start_attempt_id" IS NOT NULL AND
        "session_question"."session_id" = "session_question"."start_attempt_id"
      ));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_interview_session_stable_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.usable_at IS NOT NULL AND (
    NEW.usable_at IS DISTINCT FROM OLD.usable_at OR
    NEW.usable_transcript_event_id IS DISTINCT FROM
      OLD.usable_transcript_event_id
  ) THEN
    RAISE EXCEPTION 'interview usable evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.provisioned_at IS NOT NULL AND
    NEW.provisioned_at IS DISTINCT FROM OLD.provisioned_at THEN
    RAISE EXCEPTION 'interview provisioning acknowledgement is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_interview_session_stable_evidence()
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.protect_interview_session_stable_evidence()
  TO service_role;--> statement-breakpoint
CREATE TRIGGER protect_interview_session_stable_evidence
BEFORE UPDATE OF provisioned_at, usable_at, usable_transcript_event_id
ON public.interview_session
FOR EACH ROW
EXECUTE FUNCTION public.protect_interview_session_stable_evidence();
