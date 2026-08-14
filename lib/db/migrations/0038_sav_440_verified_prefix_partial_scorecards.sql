ALTER TABLE "feedback" DROP CONSTRAINT "feedback_version_tuple_check";--> statement-breakpoint
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_dimension_coverage_tuple_check";--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" DROP CONSTRAINT "focused_practice_attempt_snapshot_version_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "verified_prefix_scope" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_verified_prefix_scope_tuple_check" CHECK ((
        "feedback"."schema_version" IS DISTINCT FROM 'feedback.dimension-coverage.v2' AND
        "feedback"."verified_prefix_scope" IS NULL
      ) OR (
        "feedback"."schema_version" = 'feedback.dimension-coverage.v2' AND
        "feedback"."evaluation_state" = 'partial' AND
        "feedback"."feedback_mode" IN ('partial_scorecard', 'coaching_review') AND
        "feedback"."overall_score" IS NULL AND
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
            "feedback"."evaluation_state" = 'partial'
          )
        ) AND
        length(trim("feedback"."model_version")) > 0
      ));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dimension_coverage_tuple_check" CHECK ((
        "feedback"."schema_version" IS DISTINCT FROM 'feedback.dimension-coverage.v1' AND
        "feedback"."schema_version" IS DISTINCT FROM 'feedback.dimension-coverage.v2' AND
        "feedback"."feedback_mode" IS NULL AND
        "feedback"."feedback_round_type" IS NULL AND
        "feedback"."dimension_coverage" IS NULL
      ) OR (
        "feedback"."schema_version" IN ('feedback.dimension-coverage.v1', 'feedback.dimension-coverage.v2') AND
        "feedback"."feedback_mode" IN ('full_scorecard', 'partial_scorecard', 'coaching_review') AND
        "feedback"."feedback_round_type" IN ('product_sense', 'execution', 'behavioral', 'strategy') AND
        "feedback"."dimension_coverage" IS NOT NULL AND
        "feedback"."rubric_version" = 'pm-feedback-rubric.v3'
      ));--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_snapshot_version_check" CHECK (jsonb_typeof("focused_practice_attempt"."feedback_version") = 'object' AND (
        (
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v1' AND
          "focused_practice_attempt"."feedback_version"->>'schemaVersion' = 'feedback.v2' AND
          "focused_practice_attempt"."feedback_version"->>'promptVersion' = 'feedback.prompt.v2' AND
          "focused_practice_attempt"."feedback_version"->>'rubricVersion' = 'pm-feedback-rubric.v2' AND
          "focused_practice_attempt"."feedback_version"->>'evaluationState' IN ('full', 'partial')
        ) OR (
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v2' AND
          "focused_practice_attempt"."feedback_version"->>'schemaVersion' = 'feedback.evidence-limited.v2' AND
          "focused_practice_attempt"."feedback_version"->>'promptVersion' = 'feedback.prompt.evidence-limited.v2' AND
          "focused_practice_attempt"."feedback_version"->>'rubricVersion' = 'pm-feedback-rubric.v2' AND
          "focused_practice_attempt"."feedback_version"->>'evaluationState' = 'partial' AND
          "focused_practice_attempt"."feedback_version"->>'reviewOutcome' = 'coaching_review' AND
          "focused_practice_attempt"."feedback_version"->>'scoreWithheldReason' IN ('rubric_coverage', 'verified_evidence_integrity') AND
          "focused_practice_attempt"."feedback_version"->>'sourceFingerprint' ~ '^[0-9a-f]{64}$'
        ) OR (
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v2' AND
          "focused_practice_attempt"."feedback_version"->>'schemaVersion' IN ('feedback.dimension-coverage.v1', 'feedback.dimension-coverage.v2') AND
          "focused_practice_attempt"."feedback_version"->>'promptVersion' = 'feedback.prompt.dimension-coverage.v1' AND
          "focused_practice_attempt"."feedback_version"->>'rubricVersion' = 'pm-feedback-rubric.v3' AND
          "focused_practice_attempt"."feedback_version"->>'evaluationState' = 'partial' AND
          "focused_practice_attempt"."feedback_version"->>'reviewOutcome' IN ('partial_scorecard', 'coaching_review') AND
          "focused_practice_attempt"."feedback_version"->>'scoreWithheldReason' IN ('rubric_coverage', 'verified_evidence_integrity') AND
          ("focused_practice_attempt"."feedback_version"->>'reviewOutcome' <> 'partial_scorecard' OR "focused_practice_attempt"."feedback_version"->>'scoreWithheldReason' = 'rubric_coverage') AND
          "focused_practice_attempt"."feedback_version"->>'sourceFingerprint' ~ '^[0-9a-f]{64}$'
        )
      ) AND
        jsonb_typeof("focused_practice_attempt"."plan") = 'object' AND
        "focused_practice_attempt"."plan"->>'state' = 'available' AND
        "focused_practice_attempt"."plan"->>'contractVersion' = "focused_practice_attempt"."plan_contract_version" AND
        "focused_practice_attempt"."plan"->>'templateVersion' = "focused_practice_attempt"."plan_template_version" AND
        "focused_practice_attempt"."plan"->>'templateId' = "focused_practice_attempt"."plan_template_id" AND
        jsonb_typeof("focused_practice_attempt"."source_finding") = 'object' AND
        (
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v1' OR (
            "focused_practice_attempt"."source_finding"->>'kind' IN ('evidence_limited_improvement', 'dimension_coverage_focus') AND
            "focused_practice_attempt"."plan"#>>'{source,focusIdentity,kind}' = "focused_practice_attempt"."source_finding"->>'kind' AND
            (
              ("focused_practice_attempt"."feedback_version"->>'schemaVersion' = 'feedback.evidence-limited.v2' AND "focused_practice_attempt"."source_finding"->>'kind' = 'evidence_limited_improvement') OR
              ("focused_practice_attempt"."feedback_version"->>'schemaVersion' IN ('feedback.dimension-coverage.v1', 'feedback.dimension-coverage.v2') AND "focused_practice_attempt"."source_finding"->>'kind' = 'dimension_coverage_focus')
            )
          )
        ) AND
        octet_length("focused_practice_attempt"."feedback_version"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."plan"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."source_finding"::text) <= 65536 AND
        ("focused_practice_attempt"."completion" IS NULL OR (jsonb_typeof("focused_practice_attempt"."completion") = 'object' AND octet_length("focused_practice_attempt"."completion"::text) <= 65536)));