import assert from "node:assert/strict";
import test from "node:test";

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  hasImpossibleWriterTurnOrder,
  transcriptChronologicalOrder,
} from "./transcript-ordering";

test("transcript ordering uses writer generation before writer identity", () => {
  const query = new PgDialect().sqlToQuery(
    sql.join(transcriptChronologicalOrder(), sql`, `)
  );

  assert.equal(
    query.sql,
    '"transcript_turn"."started_at" asc, "transcript_turn"."writer_generation" asc, "transcript_turn"."writer_id" asc, "transcript_turn"."sequence" asc, "transcript_turn"."event_id" asc, "transcript_turn"."id" asc'
  );
});

test("writer ordering permits overlapping interruption turns", () => {
  assert.equal(
    hasImpossibleWriterTurnOrder({
      eventStartedAt: Date.parse("2026-08-07T04:16:01.000Z"),
      eventEndedAt: Date.parse("2026-08-07T04:16:15.000Z"),
      previousStartedAt: new Date("2026-08-07T04:16:02.000Z"),
      nextEndedAt: new Date("2026-08-07T04:16:28.000Z"),
    }),
    false
  );
});

test("writer ordering still rejects disjoint reversed turns", () => {
  assert.equal(
    hasImpossibleWriterTurnOrder({
      eventStartedAt: Date.parse("2026-08-07T04:16:01.000Z"),
      eventEndedAt: Date.parse("2026-08-07T04:16:05.000Z"),
      previousStartedAt: new Date("2026-08-07T04:16:06.000Z"),
    }),
    true
  );
  assert.equal(
    hasImpossibleWriterTurnOrder({
      eventStartedAt: Date.parse("2026-08-07T04:16:10.000Z"),
      eventEndedAt: Date.parse("2026-08-07T04:16:15.000Z"),
      nextEndedAt: new Date("2026-08-07T04:16:09.000Z"),
    }),
    true
  );
});
