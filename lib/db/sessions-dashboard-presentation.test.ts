import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { feedback, interviewSession } from "./schema";
import {
  buildDashboardFeedbackEvidenceTurnsQuery,
  dashboardSessionSelection,
  toDashboardSession,
} from "./sessions";

const evidenceTurn = {
  eventId: "writer:answer:1",
  speaker: "user",
  text: "I connected customer evidence to the decision and compared the tradeoffs.",
  contractVersion: 2,
};

const finding = {
  dimension: "insight",
  observation: "The answer connects customer evidence to the decision.",
  transcriptRefs: [evidenceTurn.eventId],
  evidence: [
    {
      turnRef: evidenceTurn.eventId,
      quote: "connected customer evidence to the decision",
    },
  ],
  nextStep: "Carry the evidence through the recommendation.",
  rubricVersion: "pm-feedback-rubric.v2",
  confidence: 0.9,
};

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
    "feedback_mode",
    "feedback_round_type",
    "dimension_coverage",
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

  const evidenceQuery = buildDashboardFeedbackEvidenceTurnsQuery(database, [
    "session-x",
  ]).toSQL();
  assert.match(evidenceQuery.sql, /"transcript_turn"/);
  assert.match(evidenceQuery.sql, /"speaker" =/);
  assert.match(evidenceQuery.sql, /left\("event_id"/);
  assert.match(evidenceQuery.sql, /left\("text"/);
  assert.match(evidenceQuery.sql, /limit/i);

  await client.end();
});

test("dashboard session mapping strips private evidence and emits one closed kind", () => {
  const mapped = toDashboardSession(
    {
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
        id: "feedback-1",
        sessionId: "fixture-session",
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
        feedbackMode: null,
        feedbackRoundType: null,
        dimensionCoverageJson: null,
        verifiedPrefixScopeJson: null,
        strengthsJson: JSON.stringify([finding]),
        improvementsJson: JSON.stringify([
          {
            ...finding,
            dimension: "structure",
            observation: "The answer can make its sequence more explicit.",
            evidence: [
              {
                turnRef: evidenceTurn.eventId,
                quote: "compared the tradeoffs",
              },
            ],
            nextStep: "State the sequence before explaining the tradeoffs.",
          },
        ]),
        drillsJson: JSON.stringify(["Practice a concise recommendation."]),
        summary: "The answer is grounded and can make its sequence clearer.",
        createdAt: new Date("2026-08-12T12:00:00.000Z"),
      },
    },
    [evidenceTurn]
  );

  assert.equal(mapped.feedback?.presentationKind, "scored");
  assert.equal("feedbackPresentationCandidate" in mapped, false);
  assert.equal("modelVersion" in (mapped.feedback ?? {}), false);
  assert.equal("strengthsJson" in (mapped.feedback ?? {}), false);
});

test("dashboard session mapping fails closed when persisted evidence is forged", () => {
  const mapped = toDashboardSession(
    {
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
        id: "feedback-1",
        sessionId: "fixture-session",
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
        modelVersion: "fixture-model",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "full",
        feedbackMode: null,
        feedbackRoundType: null,
        dimensionCoverageJson: null,
        verifiedPrefixScopeJson: null,
        strengthsJson: JSON.stringify([
          {
            ...finding,
            evidence: [
              { turnRef: evidenceTurn.eventId, quote: "forged evidence" },
            ],
          },
        ]),
        improvementsJson: JSON.stringify([
          {
            ...finding,
            dimension: "structure",
            observation: "The answer can make its sequence more explicit.",
            evidence: [
              {
                turnRef: evidenceTurn.eventId,
                quote: "compared the tradeoffs",
              },
            ],
            nextStep: "State the sequence before explaining the tradeoffs.",
          },
        ]),
        drillsJson: JSON.stringify(["Practice a concise recommendation."]),
        summary: "The answer is grounded and can make its sequence clearer.",
        createdAt: new Date("2026-08-12T12:00:00.000Z"),
      },
    },
    [evidenceTurn]
  );

  assert.equal(mapped.feedback?.presentationKind, "unavailable");
  assert.deepEqual(mapped.feedback, {
    status: "completed",
    overallScore: null,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    presentationKind: "unavailable",
  });
});
