CREATE TABLE "transcript_interruption_marker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"contract_version" integer NOT NULL,
	"event_id" text NOT NULL,
	"writer_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"room_name" text NOT NULL,
	"speaker" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_interruption_marker_contract_check" CHECK ("transcript_interruption_marker"."contract_version" = 1),
	CONSTRAINT "transcript_interruption_marker_speaker_check" CHECK ("transcript_interruption_marker"."speaker" IN ('user', 'interviewer')),
	CONSTRAINT "transcript_interruption_marker_sequence_check" CHECK ("transcript_interruption_marker"."sequence" > 0),
	CONSTRAINT "transcript_interruption_marker_reason_check" CHECK ("transcript_interruption_marker"."reason" IN ('no_provider_confirmed_prefix', 'canonicalization_failed'))
);
--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ADD CONSTRAINT "transcript_interruption_marker_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_interruption_marker_event_id_idx" ON "transcript_interruption_marker" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_interruption_marker_session_writer_sequence_idx" ON "transcript_interruption_marker" USING btree ("session_id","writer_id","sequence");--> statement-breakpoint
CREATE INDEX "transcript_interruption_marker_session_occurred_at_idx" ON "transcript_interruption_marker" USING btree ("session_id","occurred_at");
--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "transcript_interruption_marker" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "transcript_interruption_marker" TO service_role;
--> statement-breakpoint
CREATE POLICY "Service role has full access to transcript_interruption_marker"
  ON "transcript_interruption_marker"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
