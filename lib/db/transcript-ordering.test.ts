import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { transcriptChronologicalOrder } from "./transcript-ordering";

test("transcript ordering uses writer generation before writer identity", () => {
  const query = new PgDialect().sqlToQuery(
    sql.join(transcriptChronologicalOrder(), sql`, `)
  );

  assert.equal(
    query.sql,
    '"transcript_turn"."started_at" asc, "transcript_turn"."writer_generation" asc, "transcript_turn"."writer_id" asc, "transcript_turn"."sequence" asc, "transcript_turn"."event_id" asc, "transcript_turn"."id" asc'
  );
});
