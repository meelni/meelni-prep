ALTER TABLE "feedback" ADD COLUMN "schema_version" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "model_version" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "evaluation_state" text;--> statement-breakpoint
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
        "feedback"."schema_version" = 'feedback.v2' AND
        "feedback"."prompt_version" = 'feedback.prompt.v2' AND
        length(trim("feedback"."model_version")) > 0 AND
        "feedback"."rubric_version" = 'pm-feedback-rubric.v2' AND
        "feedback"."evaluation_state" IN ('full', 'partial')
      ));