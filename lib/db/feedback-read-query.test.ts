import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { presentCompletedFeedback } from "@meelni/core";

import {
  buildFeedbackReadQuery,
  decodeBoundedFeedbackReadRow,
  FEEDBACK_DB_READ_LIMITS,
  hasValidFeedbackLifecycleFields,
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
    "feedback_mode",
    "feedback_round_type",
    "dimension_coverage",
    "verified_prefix_scope",
    "status",
    "status_reason",
    "outcome_reason",
    "completion_tier",
    "completion_stats",
    "completion_recommendations",
    "dispatch_status",
    "dispatch_event_id",
  ]) {
    assert.match(query.sql, new RegExp(`left\\(\\"${column}\\"`));
  }
  assert.doesNotMatch(query.sql, /select \*/i);
  assert.deepEqual(query.params, [
    FEEDBACK_DB_READ_LIMITS.numericString + 1,
    FEEDBACK_DB_READ_LIMITS.findingsJson + 1,
    FEEDBACK_DB_READ_LIMITS.findingsJson + 1,
    FEEDBACK_DB_READ_LIMITS.drillsJson + 1,
    FEEDBACK_DB_READ_LIMITS.summary + 1,
    FEEDBACK_DB_READ_LIMITS.version + 1,
    FEEDBACK_DB_READ_LIMITS.version + 1,
    FEEDBACK_DB_READ_LIMITS.version + 1,
    FEEDBACK_DB_READ_LIMITS.version + 1,
    FEEDBACK_DB_READ_LIMITS.version + 1,
    FEEDBACK_DB_READ_LIMITS.lifecycleStatus + 1,
    FEEDBACK_DB_READ_LIMITS.lifecycleStatus + 1,
    FEEDBACK_DB_READ_LIMITS.dimensionCoverageJson + 1,
    FEEDBACK_DB_READ_LIMITS.verifiedPrefixScopeJson + 1,
    FEEDBACK_DB_READ_LIMITS.lifecycleStatus + 1,
    FEEDBACK_DB_READ_LIMITS.statusReason + 1,
    FEEDBACK_DB_READ_LIMITS.outcomeReason + 1,
    FEEDBACK_DB_READ_LIMITS.completionTier + 1,
    FEEDBACK_DB_READ_LIMITS.completionStatsJson + 1,
    FEEDBACK_DB_READ_LIMITS.completionRecommendationsJson + 1,
    FEEDBACK_DB_READ_LIMITS.dispatchStatus + 1,
    FEEDBACK_DB_READ_LIMITS.dispatchEventId + 1,
    "session-x",
    1,
  ]);

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
    feedbackMode: null,
    feedbackRoundType: null,
    dimensionCoverageJson: null,
    verifiedPrefixScopeJson: null,
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    status: "completed",
    statusReason: null,
    outcomeReason: "feedback_generated",
    processingStartedAt: null,
    completionTier: "full",
    completionStatsJson: null,
    completionRecommendationsJson: JSON.stringify(["Review one answer."]),
    dispatchStatus: "sent",
    dispatchEventId: "event-id",
    dispatchClaimedAt: null,
  } as BoundedFeedbackReadRow;

  const decoded = decodeBoundedFeedbackReadRow(row);
  assert.deepEqual(decoded.strengths, ["clear"]);
  assert.equal(decoded.improvements, oversized);
  assert.deepEqual(decoded.drills, ["practice"]);
  assert.equal(decoded.completionStats, null);
  assert.deepEqual(decoded.completionRecommendations, ["Review one answer."]);
  assert.equal(decoded.dimensionCoverage, null);
  assert.equal(decoded.verifiedPrefixScope, null);
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

test("oversized lifecycle field sentinels fail closed", () => {
  const valid = {
    status: "completed",
    completionTier: "full",
    dispatchStatus: "sent",
  };
  assert.equal(hasValidFeedbackLifecycleFields(valid), true);

  for (const [field, limit] of [
    ["status", FEEDBACK_DB_READ_LIMITS.lifecycleStatus],
    ["outcomeReason", FEEDBACK_DB_READ_LIMITS.outcomeReason],
    ["completionTier", FEEDBACK_DB_READ_LIMITS.completionTier],
    ["dispatchStatus", FEEDBACK_DB_READ_LIMITS.dispatchStatus],
  ] as const) {
    assert.equal(
      hasValidFeedbackLifecycleFields({
        ...valid,
        [field]: "x".repeat(limit + 1),
      }),
      false
    );
  }
});
