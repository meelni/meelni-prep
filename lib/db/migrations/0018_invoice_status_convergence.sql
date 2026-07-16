ALTER TABLE "stripe_event_log" ADD COLUMN "subject_fingerprints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_event_priority" integer;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_event_id" text;--> statement-breakpoint
UPDATE "stripe_event_log"
SET "subject_fingerprints" = jsonb_build_array("subject_fingerprint")
WHERE "subject_fingerprint" IS NOT NULL
  AND "subject_fingerprints" = '[]'::jsonb;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.lock_account_deletion_stripe_subjects()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  fingerprint text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('meelni:stripe-deletion-redaction', 0)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stripe_deletion_redaction_retry';
  END IF;
  FOR fingerprint IN
    SELECT DISTINCT subject->>'fingerprint'
    FROM jsonb_array_elements(COALESCE(NEW.stripe_subjects, '[]'::jsonb)) subject
    WHERE subject->>'fingerprint' IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(fingerprint, 0));
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS account_deletion_stripe_subject_lock
  ON "account_deletion_request";
--> statement-breakpoint
CREATE TRIGGER account_deletion_stripe_subject_lock
BEFORE INSERT OR UPDATE OF stripe_subjects ON "account_deletion_request"
FOR EACH ROW EXECUTE FUNCTION public.lock_account_deletion_stripe_subjects();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.redact_deleted_stripe_event_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  fingerprint text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('meelni:stripe-deletion-redaction', 0)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stripe_deletion_redaction_retry';
  END IF;
  FOR fingerprint IN
    SELECT DISTINCT value
    FROM (
      SELECT jsonb_array_elements_text(
        COALESCE(NEW.subject_fingerprints, '[]'::jsonb)
      ) AS value
      UNION ALL
      SELECT NEW.subject_fingerprint
    ) fingerprints
    WHERE value IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(fingerprint, 0));
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.account_deletion_request request
    CROSS JOIN LATERAL jsonb_array_elements(request.stripe_subjects) subject
    WHERE subject->>'fingerprint' = NEW.subject_fingerprint
       OR COALESCE(NEW.subject_fingerprints, '[]'::jsonb)
            ? (subject->>'fingerprint')
  ) THEN
    NEW.payload := '{}';
    NEW.last_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS stripe_event_deleted_subject_redaction
  ON "stripe_event_log";
--> statement-breakpoint
CREATE TRIGGER stripe_event_deleted_subject_redaction
BEFORE INSERT OR UPDATE OF payload, subject_fingerprint, subject_fingerprints
ON "stripe_event_log"
FOR EACH ROW EXECUTE FUNCTION public.redact_deleted_stripe_event_payload();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_history candidate
    JOIN payment_history canonical
      ON canonical.stripe_invoice_id = candidate.stripe_invoice_id
     AND canonical.status = candidate.status
     AND (canonical.created_at, canonical.id) <
         (candidate.created_at, candidate.id)
    WHERE candidate.stripe_invoice_id IS NOT NULL
      AND (
        candidate.user_id IS DISTINCT FROM canonical.user_id OR
        candidate.amount_in_cents IS DISTINCT FROM canonical.amount_in_cents OR
        candidate.currency IS DISTINCT FROM canonical.currency OR
        candidate.stripe_payment_intent_id IS DISTINCT FROM canonical.stripe_payment_intent_id OR
        candidate.stripe_charge_id IS DISTINCT FROM canonical.stripe_charge_id OR
        candidate.credit_grant_id IS DISTINCT FROM canonical.credit_grant_id OR
        candidate.catalog_id IS DISTINCT FROM canonical.catalog_id OR
        candidate.period_start IS DISTINCT FROM canonical.period_start OR
        candidate.period_end IS DISTINCT FROM canonical.period_end OR
        candidate.stripe_checkout_session_id IS DISTINCT FROM canonical.stripe_checkout_session_id OR
        candidate.tier IS DISTINCT FROM canonical.tier OR
        candidate.billing_cycle IS DISTINCT FROM canonical.billing_cycle
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'payment_history_invoice_status_financial_conflict';
  END IF;
END;
$$;
--> statement-breakpoint
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY stripe_invoice_id, status
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM payment_history
  WHERE stripe_invoice_id IS NOT NULL
)
UPDATE payment_history payment
SET stripe_invoice_id = NULL,
    status = 'canceled',
    failure_reason = 'legacy_duplicate_quarantined'
FROM ranked
WHERE payment.id = ranked.id
  AND ranked.duplicate_rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_history_stripe_invoice_status_unique"
ON "payment_history" USING btree ("stripe_invoice_id", "status")
WHERE "payment_history"."stripe_invoice_id" IS NOT NULL;
