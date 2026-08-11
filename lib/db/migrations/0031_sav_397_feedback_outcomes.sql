ALTER TABLE "feedback" DROP CONSTRAINT "feedback_version_tuple_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "outcome_reason" text;--> statement-breakpoint
UPDATE "feedback" AS "f"
SET "outcome_reason" = CASE
  WHEN "f"."status" = 'completed' THEN 'feedback_generated'
  WHEN "f"."status" = 'failed' THEN 'generation_failed'
  WHEN "f"."status" = 'skipped' AND "s"."transcript_evidence_state" = 'degraded' THEN 'transcript_integrity_degraded'
  WHEN "f"."status" = 'skipped' THEN 'no_reviewable_answer'
  WHEN "f"."dispatch_status" = 'failed' THEN 'dispatch_failed'
  ELSE NULL
END
FROM "interview_session" AS "s"
WHERE "s"."id" = "f"."session_id";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_outcome_reason_check" CHECK ("feedback"."outcome_reason" IS NULL OR "feedback"."outcome_reason" IN ('feedback_generated', 'no_reviewable_answer', 'transcript_integrity_degraded', 'dispatch_failed', 'generation_failed'));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_version_tuple_check" CHECK ((
        "feedback"."schema_version" IS NULL AND
        "feedback"."prompt_version" IS NULL AND
        "feedback"."model_version" IS NULL AND
        "feedback"."evaluation_state" IS NULL
      ) OR (
        "feedback"."schema_version" IS NOT NULL AND
        "feedback"."prompt_version" IS NOT NULL AND
        "feedback"."model_version" IS NOT NULL AND
        "feedback"."evaluation_state" IS NOT NULL AND
        (
          (
            "feedback"."schema_version" = 'feedback.v2' AND
            "feedback"."prompt_version" = 'feedback.prompt.v2' AND
            "feedback"."evaluation_state" IN ('full', 'partial')
          ) OR
          (
            "feedback"."schema_version" = 'feedback.evidence-limited.v2' AND
            "feedback"."prompt_version" = 'feedback.prompt.evidence-limited.v2' AND
            "feedback"."evaluation_state" = 'partial'
          )
        ) AND
        length(trim("feedback"."model_version")) > 0 AND
        "feedback"."rubric_version" = 'pm-feedback-rubric.v2'
      ));
