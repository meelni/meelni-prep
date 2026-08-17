import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSessionComparisonFromValidatedSessions,
  type ValidatedComparisonSession,
} from "./session-comparison";
import type { DashboardFeedbackPresentationKind } from "@/lib/dashboard/feedback-presentation";

test("comparison admits only canonical scorecard projections", () => {
  const full = session("full", "scorecard", 8);
  const scored = session("scored", "scorecard", 7);
  const partial = session("partial", "coaching_review", 9);
  const coaching = session("coaching", "coaching_review", 9);
  const unavailable = session("unavailable", "unavailable", 10);

  const comparison = buildSessionComparisonFromValidatedSessions(
    [full, scored, partial, coaching, unavailable],
    "scored",
    "full"
  );
  assert.ok(comparison);
  assert.equal(comparison.scoreDelta.overall, 1);
  assert.equal(comparison.scoreDelta.structure, 1);
  assert.deepEqual(comparison.session1.keyQuotes, []);
  assert.deepEqual(comparison.session2.keyQuotes, []);

  for (const rejected of [partial, coaching, unavailable]) {
    assert.equal(
      buildSessionComparisonFromValidatedSessions(
        [full, rejected],
        rejected.id,
        full.id
      ),
      null
    );
  }
});

test("comparison refuses cross-round and same-session progress claims", () => {
  const first = session("first", "scorecard", 6);
  const otherRound = {
    ...session("second", "scorecard", 8),
    roundType: "strategy",
  };

  assert.equal(
    buildSessionComparisonFromValidatedSessions(
      [first, otherRound],
      first.id,
      otherRound.id
    ),
    null
  );
  assert.equal(
    buildSessionComparisonFromValidatedSessions([first], first.id, first.id),
    null
  );
});

function session(
  id: string,
  presentationKind: DashboardFeedbackPresentationKind,
  score: number
): ValidatedComparisonSession {
  return {
    id,
    userId: "synthetic-user",
    roundType: "product_sense",
    mode: "voice_video",
    startedAt: new Date("2026-08-12T12:00:00.000Z"),
    endedAt: new Date("2026-08-12T12:30:00.000Z"),
    config: {},
    feedback: {
      status: "completed",
      presentationKind,
      overallScore: String(score),
      structureScore: score,
      clarityScore: score,
      insightScore: score,
      communicationScore: score,
      leadershipScore: score,
    },
  };
}
