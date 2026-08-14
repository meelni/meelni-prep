CREATE TABLE "transcript_runtime_settlement_command" (
	"session_id" uuid NOT NULL,
	"lifecycle_version" integer NOT NULL,
	"contract_version" integer NOT NULL,
	"command_id" text NOT NULL,
	"room_name" text NOT NULL,
	"writer_id" text NOT NULL,
	"writer_generation" integer NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"terminal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	CONSTRAINT "transcript_runtime_settlement_command_pkey" PRIMARY KEY("session_id","lifecycle_version"),
	CONSTRAINT "transcript_runtime_settlement_command_command_id_key" UNIQUE("command_id"),
	CONSTRAINT "transcript_runtime_settlement_command_contract_check" CHECK ("transcript_runtime_settlement_command"."contract_version" = 1),
	CONSTRAINT "transcript_runtime_settlement_command_lifecycle_version_check" CHECK ("transcript_runtime_settlement_command"."lifecycle_version" > 0),
	CONSTRAINT "transcript_runtime_settlement_command_writer_generation_check" CHECK ("transcript_runtime_settlement_command"."writer_generation" > 0),
	CONSTRAINT "transcript_runtime_settlement_command_expiry_check" CHECK ("transcript_runtime_settlement_command"."expires_at" > "transcript_runtime_settlement_command"."cutoff_at"),
	CONSTRAINT "transcript_runtime_settlement_command_state_check" CHECK ("transcript_runtime_settlement_command"."state" IN ('pending', 'acknowledged', 'terminal')),
	CONSTRAINT "transcript_runtime_settlement_command_terminal_reason_check" CHECK ("transcript_runtime_settlement_command"."terminal_reason" IS NULL OR "transcript_runtime_settlement_command"."terminal_reason" IN ('settled', 'degraded', 'expired', 'fenced', 'unavailable')),
	CONSTRAINT "transcript_runtime_settlement_command_terminal_shape_check" CHECK ((
        "transcript_runtime_settlement_command"."state" = 'pending' AND
        "transcript_runtime_settlement_command"."terminal_reason" IS NULL AND
        "transcript_runtime_settlement_command"."acknowledged_at" IS NULL AND
        "transcript_runtime_settlement_command"."terminal_at" IS NULL
      ) OR (
        "transcript_runtime_settlement_command"."state" = 'acknowledged' AND
        "transcript_runtime_settlement_command"."terminal_reason" IN ('settled', 'degraded') AND
        "transcript_runtime_settlement_command"."acknowledged_at" IS NOT NULL AND
        "transcript_runtime_settlement_command"."terminal_at" IS NOT NULL
      ) OR (
        "transcript_runtime_settlement_command"."state" = 'terminal' AND
        "transcript_runtime_settlement_command"."terminal_reason" IN ('expired', 'fenced', 'unavailable') AND
        "transcript_runtime_settlement_command"."acknowledged_at" IS NULL AND
        "transcript_runtime_settlement_command"."terminal_at" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement_command" ADD CONSTRAINT "transcript_runtime_settlement_command_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement_command" ADD CONSTRAINT "transcript_runtime_settlement_command_writer_fk" FOREIGN KEY ("session_id","writer_generation","writer_id") REFERENCES "public"."transcript_runtime_writer"("session_id","generation","writer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_runtime_settlement_command_pending_expiry_idx" ON "transcript_runtime_settlement_command" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "transcript_runtime_settlement_command_writer_idx" ON "transcript_runtime_settlement_command" USING btree ("session_id","writer_generation","writer_id");
--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement_command" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "transcript_runtime_settlement_command"
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE "transcript_runtime_settlement_command"
  TO service_role;
