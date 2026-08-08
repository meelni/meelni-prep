CREATE TABLE "transcript_evidence_writer_cutoff" (
	"session_id" uuid NOT NULL,
	"writer_generation" integer NOT NULL,
	"contract_version" integer NOT NULL,
	"writer_id" text NOT NULL,
	"committed_sequence" bigint NOT NULL,
	"last_observed_sequence" bigint NOT NULL,
	"committed_event_id" text,
	"committed_through_at" timestamp with time zone,
	"integrity_state" text NOT NULL,
	"settlement_state" text NOT NULL,
	"frozen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcript_evidence_writer_cutoff_pkey" PRIMARY KEY("session_id","writer_generation"),
	CONSTRAINT "transcript_evidence_writer_cutoff_contract_check" CHECK ("transcript_evidence_writer_cutoff"."contract_version" = 1),
	CONSTRAINT "transcript_evidence_writer_cutoff_generation_check" CHECK ("transcript_evidence_writer_cutoff"."writer_generation" > 0),
	CONSTRAINT "transcript_evidence_writer_cutoff_progress_sequence_check" CHECK ("transcript_evidence_writer_cutoff"."last_observed_sequence" >= "transcript_evidence_writer_cutoff"."committed_sequence" AND "transcript_evidence_writer_cutoff"."committed_sequence" >= 0),
	CONSTRAINT "transcript_evidence_writer_cutoff_progress_boundary_check" CHECK ((
        "transcript_evidence_writer_cutoff"."committed_sequence" = 0 AND
        "transcript_evidence_writer_cutoff"."committed_event_id" IS NULL AND
        "transcript_evidence_writer_cutoff"."committed_through_at" IS NULL
      ) OR (
        "transcript_evidence_writer_cutoff"."committed_sequence" > 0 AND
        "transcript_evidence_writer_cutoff"."committed_event_id" IS NOT NULL AND
        "transcript_evidence_writer_cutoff"."committed_through_at" IS NOT NULL
      )),
	CONSTRAINT "transcript_evidence_writer_cutoff_integrity_state_check" CHECK ("transcript_evidence_writer_cutoff"."integrity_state" IN ('healthy', 'degraded')),
	CONSTRAINT "transcript_evidence_writer_cutoff_settlement_state_check" CHECK ("transcript_evidence_writer_cutoff"."settlement_state" IN ('settled', 'missing', 'degraded'))
);
--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "transcript_evidence_version" integer;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "transcript_evidence_state" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "transcript_cutoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "transcript_evidence_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "last_observed_sequence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "committed_sequence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "committed_event_id" text;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "committed_through_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "integrity_state" text DEFAULT 'healthy' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD COLUMN "progress_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
WITH evidence AS (
  SELECT
    session_id,
    writer_generation,
    writer_id,
    sequence,
    event_id,
    ended_at AS evidence_at,
    false AS is_marker
  FROM transcript_turn
  WHERE writer_generation IS NOT NULL
    AND writer_id IS NOT NULL
    AND sequence IS NOT NULL
  UNION ALL
  SELECT
    session_id,
    writer_generation,
    writer_id,
    sequence,
    event_id,
    occurred_at AS evidence_at,
    true AS is_marker
  FROM transcript_interruption_marker
),
deduplicated AS (
  SELECT DISTINCT ON (
    session_id,
    writer_generation,
    writer_id,
    sequence
  )
    session_id,
    writer_generation,
    writer_id,
    sequence,
    event_id,
    evidence_at,
    is_marker
  FROM evidence
  ORDER BY
    session_id,
    writer_generation,
    writer_id,
    sequence,
    is_marker DESC,
    event_id
),
ranked AS (
  SELECT
    deduplicated.*,
    row_number() OVER (
      PARTITION BY session_id, writer_generation, writer_id
      ORDER BY sequence
    ) AS ordinal
  FROM deduplicated
),
progress AS (
  SELECT
    ranked.session_id,
    ranked.writer_generation,
    ranked.writer_id,
    max(ranked.sequence) AS last_observed_sequence,
    coalesce(
      max(ranked.sequence) FILTER (WHERE ranked.sequence = ranked.ordinal),
      0
    ) AS committed_sequence,
    bool_or(ranked.is_marker) OR count(*) <> (
      SELECT count(*)
      FROM evidence source
      WHERE source.session_id = ranked.session_id
        AND source.writer_generation = ranked.writer_generation
        AND source.writer_id = ranked.writer_id
    ) AS degraded
  FROM ranked
  GROUP BY ranked.session_id, ranked.writer_generation, ranked.writer_id
),
boundary AS (
  SELECT
    progress.*,
    deduplicated.event_id AS committed_event_id,
    deduplicated.evidence_at AS committed_through_at
  FROM progress
  LEFT JOIN deduplicated
    ON deduplicated.session_id = progress.session_id
   AND deduplicated.writer_generation = progress.writer_generation
   AND deduplicated.writer_id = progress.writer_id
   AND deduplicated.sequence = progress.committed_sequence
)
UPDATE transcript_runtime_writer writer
SET
  last_observed_sequence = boundary.last_observed_sequence,
  committed_sequence = boundary.committed_sequence,
  committed_event_id = boundary.committed_event_id,
  committed_through_at = boundary.committed_through_at,
  integrity_state = CASE WHEN boundary.degraded THEN 'degraded' ELSE 'healthy' END,
  progress_updated_at = clock_timestamp()
FROM boundary
WHERE writer.session_id = boundary.session_id
  AND writer.generation = boundary.writer_generation
  AND writer.writer_id = boundary.writer_id;--> statement-breakpoint
ALTER TABLE "transcript_evidence_writer_cutoff" ADD CONSTRAINT "transcript_evidence_writer_cutoff_session_id_interview_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_evidence_writer_cutoff" ADD CONSTRAINT "transcript_evidence_writer_cutoff_writer_fk" FOREIGN KEY ("session_id","writer_generation","writer_id") REFERENCES "public"."transcript_runtime_writer"("session_id","generation","writer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_evidence_writer_cutoff_session_frozen_idx" ON "transcript_evidence_writer_cutoff" USING btree ("session_id","frozen_at");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_transcript_evidence_shape_check" CHECK ((
        "interview_session"."transcript_evidence_version" IS NULL AND
        "interview_session"."transcript_evidence_state" IS NULL AND
        "interview_session"."transcript_cutoff_at" IS NULL AND
        "interview_session"."transcript_evidence_frozen_at" IS NULL
      ) OR (
        "interview_session"."transcript_evidence_version" = 1 AND
        "interview_session"."transcript_evidence_state" IN ('complete', 'partial', 'insufficient', 'degraded') AND
        "interview_session"."transcript_cutoff_at" IS NOT NULL AND
        "interview_session"."transcript_evidence_frozen_at" IS NOT NULL AND
        "interview_session"."lifecycle_state" IN ('completed', 'abandoned', 'failed')
      ));--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD CONSTRAINT "transcript_runtime_writer_progress_sequence_check" CHECK ("transcript_runtime_writer"."last_observed_sequence" >= "transcript_runtime_writer"."committed_sequence" AND "transcript_runtime_writer"."committed_sequence" >= 0);--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD CONSTRAINT "transcript_runtime_writer_progress_boundary_check" CHECK ((
        "transcript_runtime_writer"."committed_sequence" = 0 AND
        "transcript_runtime_writer"."committed_event_id" IS NULL AND
        "transcript_runtime_writer"."committed_through_at" IS NULL
      ) OR (
        "transcript_runtime_writer"."committed_sequence" > 0 AND
        "transcript_runtime_writer"."committed_event_id" IS NOT NULL AND
        "transcript_runtime_writer"."committed_through_at" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "transcript_runtime_writer" ADD CONSTRAINT "transcript_runtime_writer_integrity_state_check" CHECK ("transcript_runtime_writer"."integrity_state" IN ('healthy', 'degraded'));--> statement-breakpoint
ALTER TABLE "transcript_evidence_writer_cutoff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "transcript_evidence_writer_cutoff" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "transcript_evidence_writer_cutoff" TO service_role;--> statement-breakpoint
CREATE POLICY "Service role has full access to transcript_evidence_writer_cutoff"
  ON "transcript_evidence_writer_cutoff"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
