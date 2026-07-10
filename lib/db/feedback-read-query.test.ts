import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { presentCompletedFeedback } from "@meelni/core";

import {
  buildFeedbackReadQuery,
  decodeBoundedFeedbackReadRow,
  FEEDBACK_DB_READ_LIMITS,
  type BoundedFeedbackReadRow,
} from "./feedback";

test("feedback read query projects and bounds persisted presenter fields", async () => {
  const client = postgres("postgres://unused:unused@127.0.0.1:5432/unused", {
    prepare: false,
  });
  const database = drizzle(client);
  const query = buildFeedbackReadQuery(database, "session-x").toSQL();

  for (const column of [
    "overall_score",
    "strengths",
    "improvements",
    "drills",
    "summary",
    "rubric_version",
    "schema_version",
    "prompt_version",
    "model_version",
    "evaluation_state",
    "dispatch_event_id",
  ]) {
    assert.match(query.sql, new RegExp(`left\\(\\"${column}\\"`));
  }
  assert.doesNotMatch(query.sql, /select \*/i);
  assert.equal(query.params.at(-1), 1);
  assert.ok(query.params.includes(FEEDBACK_DB_READ_LIMITS.findingsJson + 1));
  assert.ok(query.params.includes(FEEDBACK_DB_READ_LIMITS.drillsJson + 1));
  assert.ok(query.params.includes(FEEDBACK_DB_READ_LIMITS.summary + 1));

  await client.end();
});

test("bounded feedback rows decode valid JSON but preserve oversize sentinels", () => {
  const oversized = "x".repeat(FEEDBACK_DB_READ_LIMITS.findingsJson + 1);
  const row = {
    id: "feedback-id",
    sessionId: "session-id",
    structureScore: 8,
    clarityScore: 8,
    insightScore: 8,
    communicationScore: 8,
    leadershipScore: 8,
    overallScore: "8.0",
    strengthsJson: JSON.stringify(["clear"]),
    improvementsJson: oversized,
    drillsJson: JSON.stringify(["practice"]),
    summary: "summary",
    rubricVersion: "1.0.0",
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    evaluationState: null,
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    status: "completed",
    processingStartedAt: null,
    completionTier: "full",
    dispatchStatus: "sent",
    dispatchEventId: "event-id",
    dispatchClaimedAt: null,
  } as BoundedFeedbackReadRow;

  const decoded = decodeBoundedFeedbackReadRow(row);
  assert.deepEqual(decoded.strengths, ["clear"]);
  assert.equal(decoded.improvements, oversized);
  assert.deepEqual(decoded.drills, ["practice"]);
  assert.equal(
    presentCompletedFeedback(
      {
        ...decoded,
        summary: decoded.summary,
        strengths: decoded.strengths,
        improvements: decoded.improvements,
        drills: decoded.drills,
      },
      { evidenceTurns: [] }
    ).kind,
    "invalid"
  );
});
