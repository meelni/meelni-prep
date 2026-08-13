ALTER TABLE "feedback" DROP CONSTRAINT "feedback_version_tuple_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "feedback_mode" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "feedback_round_type" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dimension_coverage" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dimension_coverage_tuple_check" CHECK ((
        "feedback"."schema_version" IS DISTINCT FROM 'feedback.dimension-coverage.v1' AND
        "feedback"."feedback_mode" IS NULL AND
        "feedback"."feedback_round_type" IS NULL AND
        "feedback"."dimension_coverage" IS NULL
      ) OR (
        "feedback"."schema_version" = 'feedback.dimension-coverage.v1' AND
        "feedback"."feedback_mode" IN ('full_scorecard', 'partial_scorecard', 'coaching_review') AND
        "feedback"."feedback_round_type" IN ('product_sense', 'execution', 'behavioral', 'strategy') AND
        "feedback"."dimension_coverage" IS NOT NULL AND
        "feedback"."rubric_version" = 'pm-feedback-rubric.v3'
      ));--> statement-breakpoint
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
            "feedback"."rubric_version" = 'pm-feedback-rubric.v2' AND
            "feedback"."evaluation_state" IN ('full', 'partial')
          ) OR
          (
            "feedback"."schema_version" = 'feedback.evidence-limited.v2' AND
            "feedback"."prompt_version" = 'feedback.prompt.evidence-limited.v2' AND
            "feedback"."rubric_version" = 'pm-feedback-rubric.v2' AND
            "feedback"."evaluation_state" = 'partial'
          ) OR
          (
            "feedback"."schema_version" = 'feedback.dimension-coverage.v1' AND
            "feedback"."prompt_version" = 'feedback.prompt.dimension-coverage.v1' AND
            "feedback"."rubric_version" = 'pm-feedback-rubric.v3' AND
            "feedback"."evaluation_state" IN ('full', 'partial')
          )
        ) AND
        length(trim("feedback"."model_version")) > 0
      ));