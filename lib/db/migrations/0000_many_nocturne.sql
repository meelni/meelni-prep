CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"structure_score" integer,
	"clarity_score" integer,
	"insight_score" integer,
	"communication_score" integer,
	"leadership_score" integer,
	"overall_score" numeric,
	"strengths" jsonb,
	"improvements" jsonb,
	"drills" jsonb,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"rubric_version" text DEFAULT '1.0.0' NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processing_duration_ms" integer,
	CONSTRAINT "feedback_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" IN ('pending', 'processing', 'completed', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "interview_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text,
	"question_text" text NOT NULL,
	"question_type" text NOT NULL,
	"difficulty" text,
	"asked_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "question_type_check" CHECK ("interview_question"."question_type" IN ('A/B Testing', 'Product design/strategy', 'Behavioral', 'Execution', 'Product Sense', 'Pricing', 'Estimation', 'Product Strategy')),
	CONSTRAINT "difficulty_check" CHECK ("interview_question"."difficulty" IS NULL OR "interview_question"."difficulty" IN ('Easy', 'Medium', 'Hard'))
);
--> statement-breakpoint
CREATE TABLE "interview_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'pm',
	"round_type" text NOT NULL,
	"mode" text NOT NULL,
	"persona" text,
	"livekit_room_name" text,
	"config" jsonb,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_turns" integer DEFAULT 0,
	"total_words" integer DEFAULT 0,
	"duration_seconds" integer,
	CONSTRAINT "round_type_check" CHECK ("interview_session"."round_type" IN ('behavioral', 'product_sense', 'execution', 'strategy')),
	CONSTRAINT "mode_check" CHECK ("interview_session"."mode" IN ('voice_video', 'text')),
	CONSTRAINT "status_check" CHECK ("interview_session"."status" IN ('in_progress', 'completed', 'abandoned', 'too_short', 'error'))
);
--> statement-breakpoint
CREATE TABLE "session_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transcript_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"speaker" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"text" text,
	"audio_ms" integer,
	"latency_ms" integer,
	"section" text,
	CONSTRAINT "speaker_check" CHECK ("transcript_turn"."speaker" IN ('user', 'interviewer'))
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"default_interview_type" text DEFAULT 'product_sense',
	"default_difficulty" text DEFAULT 'medium',
	"question_recency" text DEFAULT 'current',
	"auto_save_transcripts" boolean DEFAULT true NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"session_completion_email" boolean DEFAULT true NOT NULL,
	"feedback_ready_email" boolean DEFAULT true NOT NULL,
	"weekly_progress_report" boolean DEFAULT false NOT NULL,
	"share_anonymous_data" boolean DEFAULT true NOT NULL,
	"save_transcripts" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'system',
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "default_interview_type_check" CHECK ("user_settings"."default_interview_type" IS NULL OR "user_settings"."default_interview_type" IN ('product_sense', 'analytical', 'behavioral', 'strategy')),
	CONSTRAINT "default_difficulty_check" CHECK ("user_settings"."default_difficulty" IS NULL OR "user_settings"."default_difficulty" IN ('easy', 'medium', 'hard')),
	CONSTRAINT "question_recency_check" CHECK ("user_settings"."question_recency" IS NULL OR "user_settings"."question_recency" IN ('current', 'recent', 'all')),
	CONSTRAINT "theme_check" CHECK ("user_settings"."theme" IS NULL OR "user_settings"."theme" IN ('light', 'dark', 'system'))
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_question_id_interview_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."interview_question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_session_status_idx" ON "feedback" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "interview_question_question_type_idx" ON "interview_question" USING btree ("question_type");--> statement-breakpoint
CREATE INDEX "interview_question_is_active_idx" ON "interview_question" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "interview_question_active_type_idx" ON "interview_question" USING btree ("is_active","question_type");--> statement-breakpoint
CREATE INDEX "interview_question_asked_at_idx" ON "interview_question" USING btree ("asked_at");--> statement-breakpoint
CREATE INDEX "interview_session_user_status_idx" ON "interview_session" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "interview_session_ended_at_idx" ON "interview_session" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "session_question_session_idx" ON "session_question" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_question_question_idx" ON "session_question" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "session_question_session_question_idx" ON "session_question" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "user_settings_user_id_idx" ON "user_settings" USING btree ("user_id");