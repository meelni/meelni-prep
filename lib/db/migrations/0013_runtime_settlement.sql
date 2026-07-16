CREATE TABLE "transcript_runtime_settlement" (
	"session_id" uuid NOT NULL,
	"writer_generation" integer NOT NULL,
	"contract_version" integer NOT NULL,
	"room_name" text NOT NULL,
	"writer_id" text NOT NULL,
	"state" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_runtime_settlement_pkey" PRIMARY KEY("session_id","writer_generation"),
	CONSTRAINT "transcript_runtime_settlement_contract_check" CHECK ("transcript_runtime_settlement"."contract_version" = 1),
	CONSTRAINT "transcript_runtime_settlement_state_check" CHECK ("transcript_runtime_settlement"."state" IN ('settled', 'degraded')),
	CONSTRAINT "transcript_runtime_settlement_writer_generation_check" CHECK ("transcript_runtime_settlement"."writer_generation" > 0)
);
--> statement-breakpoint
CREATE TABLE "transcript_runtime_writer" (
	"session_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"contract_version" integer NOT NULL,
	"room_name" text NOT NULL,
	"writer_id" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_runtime_writer_pkey" PRIMARY KEY("session_id","generation"),
	CONSTRAINT "transcript_runtime_writer_contract_check" CHECK ("transcript_runtime_writer"."contract_version" = 1),
	CONSTRAINT "transcript_runtime_writer_generation_check" CHECK ("transcript_runtime_writer"."generation" > 0)
);
--> statement-breakpoint
ALTER TABLE "transcript_turn" DROP CONSTRAINT "transcript_turn_canonical_identity_check";--> statement-breakpoint
DROP INDEX "transcript_turn_chronological_idx";--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ADD COLUMN "writer_generation" integer;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "writer_generation" integer;--> statement-breakpoint
WITH writer_evidence AS (
  SELECT
    session_id,
    writer_id,
    MIN(room_name) AS room_name,
    MIN(observed_at) AS registered_at
  FROM (
    SELECT session_id, writer_id, room_name, started_at AS observed_at
    FROM transcript_turn
    WHERE contract_version = 2 AND writer_id IS NOT NULL AND room_name IS NOT NULL
    UNION ALL
    SELECT session_id, writer_id, room_name, occurred_at AS observed_at
    FROM transcript_interruption_marker
  ) evidence
  GROUP BY session_id, writer_id
), numbered_writers AS (
  SELECT
    session_id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id ORDER BY registered_at, writer_id COLLATE "C"
    )::integer AS generation,
    room_name,
    writer_id,
    registered_at
  FROM writer_evidence
)
INSERT INTO transcript_runtime_writer (
  session_id,
  generation,
  contract_version,
  room_name,
  writer_id,
  registered_at
)
SELECT session_id, generation, 1, room_name, writer_id, registered_at
FROM numbered_writers;--> statement-breakpoint
UPDATE transcript_turn turn_row
SET writer_generation = writer_row.generation
FROM transcript_runtime_writer writer_row
WHERE turn_row.session_id = writer_row.session_id
  AND turn_row.writer_id = writer_row.writer_id
  AND turn_row.contract_version = 2;--> statement-breakpoint
UPDATE transcript_interruption_marker marker
SET writer_generation = writer_row.generation
FROM transcript_runtime_writer writer_row
WHERE marker.session_id = writer_row.session_id
  AND marker.writer_id = writer_row.writer_id;--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ALTER COLUMN "writer_generation" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_runtime_writer_session_writer_idx" ON "transcript_runtime_writer" USING btree ("session_id","writer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_runtime_writer_identity_idx" ON "transcript_runtime_writer" USING btree ("session_id","generation","writer_id");--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement" ADD CONSTRAINT "transcript_runtime_settlement_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement" ADD CONSTRAINT "transcript_runtime_settlement_writer_fk" FOREIGN KEY ("session_id","writer_generation","writer_id") REFERENCES "public"."transcript_runtime_writer"("session_id","generation","writer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD CONSTRAINT "transcript_runtime_writer_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_runtime_settlement_room_settled_at_idx" ON "transcript_runtime_settlement" USING btree ("room_name","settled_at");--> statement-breakpoint
CREATE INDEX "transcript_runtime_writer_room_generation_idx" ON "transcript_runtime_writer" USING btree ("room_name","generation");--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ADD CONSTRAINT "transcript_interruption_marker_runtime_writer_fk" FOREIGN KEY ("session_id","writer_generation","writer_id") REFERENCES "public"."transcript_runtime_writer"("session_id","generation","writer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_runtime_writer_fk" FOREIGN KEY ("session_id","writer_generation","writer_id") REFERENCES "public"."transcript_runtime_writer"("session_id","generation","writer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_turn_chronological_idx" ON "transcript_turn" USING btree ("session_id","started_at","writer_generation","writer_id","sequence","event_id","id");--> statement-breakpoint
ALTER TABLE "transcript_interruption_marker" ADD CONSTRAINT "transcript_interruption_marker_writer_generation_check" CHECK ("transcript_interruption_marker"."writer_generation" > 0);--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_canonical_identity_check" CHECK ((
        "transcript_turn"."contract_version" IS NULL AND
        "transcript_turn"."event_id" IS NULL AND
        "transcript_turn"."writer_id" IS NULL AND
        "transcript_turn"."writer_generation" IS NULL AND
        "transcript_turn"."sequence" IS NULL AND
        "transcript_turn"."room_name" IS NULL AND
        "transcript_turn"."delivery_state" IS NULL
      ) OR (
        "transcript_turn"."contract_version" = 2 AND
        "transcript_turn"."event_id" IS NOT NULL AND
        "transcript_turn"."writer_id" IS NOT NULL AND
        "transcript_turn"."writer_generation" IS NOT NULL AND
        "transcript_turn"."sequence" IS NOT NULL AND
        "transcript_turn"."room_name" IS NOT NULL AND
        "transcript_turn"."started_at" IS NOT NULL AND
        "transcript_turn"."ended_at" IS NOT NULL AND
        "transcript_turn"."text" IS NOT NULL AND
        "transcript_turn"."audio_ms" IS NOT NULL AND
        "transcript_turn"."section" IS NOT NULL AND
        "transcript_turn"."delivery_state" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transcript_runtime_settlement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "transcript_runtime_writer" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "transcript_runtime_writer" TO service_role;
REVOKE ALL ON TABLE "transcript_runtime_settlement" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "transcript_runtime_settlement" TO service_role;--> statement-breakpoint
CREATE POLICY "Service role has full access to transcript_runtime_writer"
  ON "transcript_runtime_writer"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Service role has full access to transcript_runtime_settlement"
  ON "transcript_runtime_settlement"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
