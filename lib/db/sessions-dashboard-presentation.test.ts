import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { feedback, interviewSession } from "./schema";
import { dashboardSessionSelection, toDashboardSession } from "./sessions";

test("dashboard session query bounds private presentation evidence", async () => {
  const client = postgres("postgres://unused:unused@127.0.0.1:5432/unused", {
    prepare: false,
  });
  const database = drizzle(client);
  const query = database
    .select(dashboardSessionSelection)
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .toSQL();

  for (const column of [
    "schema_version",
    "prompt_version",
    "model_version",
    "rubric_version",
    "evaluation_state",
    "strengths",
    "improvements",
    "drills",
    "summary",
  ]) {
    assert.match(
      query.sql,
      new RegExp(`left\\(\\"feedback\\"\\.\\"${column}\\"`)
    );
  }
  assert.doesNotMatch(query.sql, /select \*/i);

  await client.end();
});

test("dashboard session mapping strips private evidence and emits one closed kind", () => {
  const mapped = toDashboardSession({
    id: "fixture-session",
    feedback: {
      status: "completed",
      overallScore: "7.4",
      structureScore: 7,
      clarityScore: 7,
      insightScore: 8,
      communicationScore: 7,
      leadershipScore: 8,
    },
    feedbackPresentationCandidate: {
      status: "completed",
      outcomeReason: "feedback_generated",
      completionTier: "full",
      overallScore: "7.4",
      structureScore: 7,
      clarityScore: 7,
      insightScore: 8,
      communicationScore: 7,
      leadershipScore: 8,
      schemaVersion: "feedback.v2",
      promptVersion: "feedback.prompt.v2",
      modelVersion: "private-model-identity",
      rubricVersion: "pm-feedback-rubric.v2",
      evaluationState: "full",
      strengthsJson: '[{"private":"content"}]',
      improvementsJson: "[]",
      drillsJson: "[]",
      summary: "private summary",
    },
  });

  assert.equal(mapped.feedback?.presentationKind, "scored");
  assert.equal("feedbackPresentationCandidate" in mapped, false);
  assert.equal("modelVersion" in (mapped.feedback ?? {}), false);
  assert.equal("strengthsJson" in (mapped.feedback ?? {}), false);
});
