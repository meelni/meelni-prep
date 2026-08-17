ALTER TABLE "feedback" DROP CONSTRAINT "feedback_version_tuple_check";--> statement-breakpoint
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_verified_prefix_scope_tuple_check";--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" DROP CONSTRAINT "feedback_quality_signal_contract_check";--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" DROP CONSTRAINT "feedback_quality_signal_outcome_check";--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" DROP CONSTRAINT "feedback_quality_signal_selection_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dimension_coverage_score_tuple_check" CHECK ("feedback"."schema_version" NOT IN ('feedback.dimension-coverage.v1', 'feedback.dimension-coverage.v2') OR (
        (
          "feedback"."feedback_mode" = 'full_scorecard' AND
          "feedback"."structure_score" IS NOT NULL AND
          "feedback"."clarity_score" IS NOT NULL AND
          "feedback"."insight_score" IS NOT NULL AND
          "feedback"."communication_score" IS NOT NULL AND
          "feedback"."leadership_score" IS NOT NULL AND
          "feedback"."overall_score" IS NOT NULL
        ) OR (
          "feedback"."feedback_mode" = 'partial_scorecard' AND
          "feedback"."overall_score" IS NULL
        ) OR (
          "feedback"."feedback_mode" = 'coaching_review' AND
          "feedback"."structure_score" IS NULL AND
          "feedback"."clarity_score" IS NULL AND
          "feedback"."insight_score" IS NULL AND
          "feedback"."communication_score" IS NULL AND
          "feedback"."leadership_score" IS NULL AND
          "feedback"."overall_score" IS NULL
        )
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
          ) OR
          (
            "feedback"."schema_version" = 'feedback.dimension-coverage.v2' AND
            "feedback"."prompt_version" = 'feedback.prompt.dimension-coverage.v1' AND
            "feedback"."rubric_version" = 'pm-feedback-rubric.v3' AND
            "feedback"."evaluation_state" IN ('full', 'partial')
          )
        ) AND
        length(trim("feedback"."model_version")) > 0
      ));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_verified_prefix_scope_tuple_check" CHECK ((
        "feedback"."schema_version" IS DISTINCT FROM 'feedback.dimension-coverage.v2' AND
        "feedback"."verified_prefix_scope" IS NULL
      ) OR (
        "feedback"."schema_version" = 'feedback.dimension-coverage.v2' AND
        (
          (
            "feedback"."feedback_mode" = 'full_scorecard' AND
            "feedback"."evaluation_state" = 'full' AND
            "feedback"."overall_score" IS NOT NULL AND
            "feedback"."verified_prefix_scope"->>'excludedTailBlockCount' = '0'
          ) OR (
            "feedback"."feedback_mode" IN ('partial_scorecard', 'coaching_review') AND
            "feedback"."evaluation_state" = 'partial' AND
            "feedback"."overall_score" IS NULL
          )
        ) AND
        "feedback"."verified_prefix_scope" IS NOT NULL AND
        CASE
          WHEN jsonb_typeof("feedback"."verified_prefix_scope") IS NOT DISTINCT FROM 'object' THEN
            "feedback"."verified_prefix_scope"->>'contractVersion' IS NOT DISTINCT FROM 'feedback.verified-prefix-scope.v1' AND
            "feedback"."verified_prefix_scope"->>'projectionVersion' IS NOT DISTINCT FROM 'trusted-answer-block-projection.v1' AND
            CASE
              WHEN jsonb_typeof("feedback"."verified_prefix_scope"->'trustedBlockIdentities') IS NOT DISTINCT FROM 'array' THEN
                jsonb_array_length("feedback"."verified_prefix_scope"->'trustedBlockIdentities') BETWEEN 1 AND 1000
              ELSE false
            END AND
            jsonb_typeof("feedback"."verified_prefix_scope"->'excludedTailBlockCount') IS NOT DISTINCT FROM 'number' AND
            CASE
              WHEN "feedback"."verified_prefix_scope"->>'excludedTailBlockCount' ~ '^(0|[1-9][0-9]{0,3})$' THEN
                ("feedback"."verified_prefix_scope"->>'excludedTailBlockCount')::integer BETWEEN 0 AND 1000
              ELSE false
            END AND
            ("feedback"."verified_prefix_scope" - 'contractVersion' - 'projectionVersion' - 'trustedBlockIdentities' - 'excludedTailBlockCount') IS NOT DISTINCT FROM '{}'::jsonb AND
            octet_length("feedback"."verified_prefix_scope"::text) <= 128000
          ELSE false
        END
      ));--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_contract_check" CHECK ("feedback_quality_signal"."contract_version" IN ('feedback-quality-signal.v1', 'feedback-quality-signal.v2'));--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_outcome_check" CHECK ((
        "feedback_quality_signal"."contract_version" = 'feedback-quality-signal.v1' AND
        "feedback_quality_signal"."review_outcome" IN ('full_scorecard', 'partial_scorecard', 'coaching_review')
      ) OR (
        "feedback_quality_signal"."contract_version" = 'feedback-quality-signal.v2' AND
        "feedback_quality_signal"."review_outcome" IN ('scorecard', 'coaching_review')
      ));--> statement-breakpoint
ALTER TABLE "feedback_quality_signal" ADD CONSTRAINT "feedback_quality_signal_selection_check" CHECK ((
        "feedback_quality_signal"."response" = 'helpful' AND "feedback_quality_signal"."reason" IS NULL
      ) OR (
        "feedback_quality_signal"."response" = 'not_helpful' AND (
          "feedback_quality_signal"."reason" IS NULL OR
          "feedback_quality_signal"."reason" IN ('not_specific_enough', 'evidence_did_not_match', 'next_step_unclear', 'too_much_to_use') OR
          ("feedback_quality_signal"."review_outcome" IN ('full_scorecard', 'partial_scorecard', 'scorecard') AND "feedback_quality_signal"."reason" = 'score_explanation_unclear') OR
          ("feedback_quality_signal"."review_outcome" = 'coaching_review' AND "feedback_quality_signal"."reason" = 'score_withholding_unclear')
        )
      ));