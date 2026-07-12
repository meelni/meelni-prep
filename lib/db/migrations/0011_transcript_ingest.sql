ALTER TABLE "transcript_turn" ADD COLUMN "contract_version" integer;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "writer_id" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "sequence" bigint;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "room_name" text;--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD COLUMN "delivery_state" text;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_event_id_idx" ON "transcript_turn" USING btree ("event_id") WHERE "transcript_turn"."event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turn_session_writer_sequence_idx" ON "transcript_turn" USING btree ("session_id","writer_id","sequence") WHERE "transcript_turn"."writer_id" IS NOT NULL AND "transcript_turn"."sequence" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transcript_turn_chronological_idx" ON "transcript_turn" USING btree ("session_id","started_at","writer_id","sequence");--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_contract_version_check" CHECK ("transcript_turn"."contract_version" IS NULL OR "transcript_turn"."contract_version" = 2);--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_sequence_check" CHECK ("transcript_turn"."sequence" IS NULL OR "transcript_turn"."sequence" > 0);--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_delivery_state_check" CHECK ("transcript_turn"."delivery_state" IS NULL OR "transcript_turn"."delivery_state" IN ('delivered', 'partially_delivered'));--> statement-breakpoint
ALTER TABLE "transcript_turn" ADD CONSTRAINT "transcript_turn_canonical_identity_check" CHECK ((
        "transcript_turn"."contract_version" IS NULL AND
        "transcript_turn"."event_id" IS NULL AND
        "transcript_turn"."writer_id" IS NULL AND
        "transcript_turn"."sequence" IS NULL AND
        "transcript_turn"."room_name" IS NULL AND
        "transcript_turn"."delivery_state" IS NULL
      ) OR (
        "transcript_turn"."contract_version" = 2 AND
        "transcript_turn"."event_id" IS NOT NULL AND
        "transcript_turn"."writer_id" IS NOT NULL AND
        "transcript_turn"."sequence" IS NOT NULL AND
        "transcript_turn"."room_name" IS NOT NULL AND
        "transcript_turn"."started_at" IS NOT NULL AND
        "transcript_turn"."ended_at" IS NOT NULL AND
        "transcript_turn"."text" IS NOT NULL AND
        "transcript_turn"."audio_ms" IS NOT NULL AND
        "transcript_turn"."section" IS NOT NULL AND
        "transcript_turn"."delivery_state" IS NOT NULL
      ));