ALTER TABLE "interview_question" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "interview_question" ADD COLUMN "source_kind" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_question" ADD COLUMN "source_category" text;--> statement-breakpoint
ALTER TABLE "interview_question" ADD COLUMN "source_fingerprint" text;--> statement-breakpoint
ALTER TABLE "interview_question" ADD COLUMN "quality_status" text DEFAULT 'quarantined_unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_question" ADD COLUMN "duplicate_of_question_id" uuid;--> statement-breakpoint
REVOKE SELECT ON TABLE "interview_question" FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT (
	"id", "company", "question_text", "question_type", "difficulty",
	"asked_at", "is_active", "created_at"
) ON TABLE "interview_question" TO anon, authenticated;--> statement-breakpoint
UPDATE "interview_question"
SET
	"quality_status" = CASE
		WHEN "is_active" THEN 'quarantined_unverified'
		ELSE 'retired_source_missing'
	END,
	"is_active" = false;--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_duplicate_of_question_id_fk" FOREIGN KEY ("duplicate_of_question_id") REFERENCES "public"."interview_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_question_quality_status_idx" ON "interview_question" USING btree ("quality_status");--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_source_kind_check" CHECK ("interview_question"."source_kind" IN ('legacy', 'google_sheets'));--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_source_fingerprint_check" CHECK ("interview_question"."source_fingerprint" IS NULL OR "interview_question"."source_fingerprint" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_quality_status_check" CHECK ("interview_question"."quality_status" IN ('published', 'quarantined_unverified', 'quarantined_near_duplicate', 'retired_exact_duplicate', 'retired_source_missing'));--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_publication_projection_check" CHECK ("interview_question"."is_active" = ("interview_question"."quality_status" = 'published'));--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_duplicate_disposition_check" CHECK (("interview_question"."quality_status" IN ('quarantined_near_duplicate', 'retired_exact_duplicate')) = ("interview_question"."duplicate_of_question_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_duplicate_not_self_check" CHECK ("interview_question"."duplicate_of_question_id" IS NULL OR "interview_question"."duplicate_of_question_id" <> "interview_question"."id");
