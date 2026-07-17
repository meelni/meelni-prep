import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { buildFeedbackEvidenceTurnsQuery } from "./transcripts";

test("feedback evidence query bounds rows and oversized persisted fields", async () => {
  const client = postgres("postgres://unused:unused@127.0.0.1:5432/unused", {
    prepare: false,
  });
  const database = drizzle(client);
  const query = buildFeedbackEvidenceTurnsQuery(database, "session-x").toSQL();

  assert.match(query.sql, /left\("event_id", \$1\)/);
  assert.match(query.sql, /left\("text", \$2\)/);
  assert.match(query.sql, /limit \$5$/);
  assert.deepEqual(query.params, [257, 20_001, "session-x", "user", 1_001]);

  await client.end();
});
