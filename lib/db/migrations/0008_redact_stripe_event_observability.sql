UPDATE "stripe_event_log"
SET
  "payload" = '{}',
  "last_error" = CASE
    WHEN "last_error" IS NULL THEN NULL
    ELSE 'stripe_webhook_processing_failed'
  END
WHERE "payload" <> '{}'
   OR "last_error" IS NOT NULL;
