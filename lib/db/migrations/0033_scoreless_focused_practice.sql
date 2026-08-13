ALTER TABLE "focused_practice_attempt" DROP CONSTRAINT "focused_practice_attempt_contract_version_check";--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" DROP CONSTRAINT "focused_practice_attempt_plan_version_check";--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" DROP CONSTRAINT "focused_practice_attempt_snapshot_version_check";--> statement-breakpoint
DROP INDEX "focused_practice_attempt_owner_source_contract_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "focused_practice_attempt_owner_source_idx" ON "focused_practice_attempt" USING btree ("user_id","source_session_id");--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_contract_version_check" CHECK ("focused_practice_attempt"."contract_version" IN ('focused-practice-attempt.v1', 'focused-practice-attempt.v2'));--> statement-breakpoint
ALTER TABLE "focused_practice_attempt" ADD CONSTRAINT "focused_practice_attempt_plan_version_check" CHECK (((
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v1' AND
          "focused_practice_attempt"."plan_contract_version" = 'focused-practice-plan.v1' AND
          "focused_practice_attempt"."plan_template_version" = 'focused-practice-templates.v1'
        ) OR (
          "focused_practice_attempt"."contract_version" = 'focused-practice-attempt.v2' AND
          "focused_practice_attempt"."plan_contract_version" = 'focused-practice-plan.v2' AND
          "focused_practice_attempt"."plan_template_version" = 'focused-practice-templates.v2'
        )) AND length(trim("focused_practice_attempt"."plan_template_id")) > 0);--> statement-breakpoint
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
          "focused_practice_attempt"."feedback_version"->>'schemaVersion' = 'feedback.dimension-coverage.v1' AND
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
            "focused_practice_attempt"."plan"#>>'{source,focusIdentity,kind}' = "focused_practice_attempt"."source_finding"->>'kind'
          )
        ) AND
        octet_length("focused_practice_attempt"."feedback_version"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."plan"::text) <= 65536 AND
        octet_length("focused_practice_attempt"."source_finding"::text) <= 65536 AND
        ("focused_practice_attempt"."completion" IS NULL OR (jsonb_typeof("focused_practice_attempt"."completion") = 'object' AND octet_length("focused_practice_attempt"."completion"::text) <= 65536)));