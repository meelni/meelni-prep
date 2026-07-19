CREATE TABLE "transcript_runtime_settlement" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"contract_version" integer NOT NULL,
	"room_name" text NOT NULL,
	"writer_id" text NOT NULL,
	"state" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_runtime_settlement_contract_check" CHECK ("transcript_runtime_settlement"."contract_version" = 1),
	CONSTRAINT "transcript_runtime_settlement_state_check" CHECK ("transcript_runtime_settlement"."state" IN ('settled', 'degraded'))
);
--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement" ADD CONSTRAINT "transcript_runtime_settlement_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_runtime_settlement_room_settled_at_idx" ON "transcript_runtime_settlement" USING btree ("room_name","settled_at");
--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "transcript_runtime_settlement" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "transcript_runtime_settlement" TO service_role;
--> statement-breakpoint
CREATE POLICY "Service role has full access to transcript_runtime_settlement"
  ON "transcript_runtime_settlement"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
