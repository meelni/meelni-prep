import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardProgressFixtures } from "@meelni/test-fixtures";

import {
  buildDashboardPracticeSummary,
  buildProgressBars,
  buildHistorySummary,
  buildQuestionBankSummary,
  formatRoundType,
} from "./contracts";

const baseSession = {
  id: "session-1",
  roundType: "product_sense",
  startedAt: "2026-07-05T12:00:00.000Z",
  endedAt: "2026-07-05T12:28:00.000Z",
};

test("formatRoundType turns stored round keys into product labels", () => {
  assert.equal(formatRoundType("product_sense"), "Product Sense");
  assert.equal(formatRoundType("execution"), "Execution");
  assert.equal(formatRoundType("behavioral"), "Behavioral");
});

test("practice summary recommends the weakest feedback dimension", () => {
  const summary = buildDashboardPracticeSummary([
    {
      ...baseSession,
      feedback: {
        status: "completed",
        overallScore: "6.2",
        structureScore: 8.1,
        clarityScore: 7.4,
        insightScore: 5.9,
        communicationScore: 7.1,
        leadershipScore: 6.8,
      },
    },
  ]);

  assert.equal(summary.progress.score, 6.2);
  assert.equal(summary.progress.state, "single");
  assert.equal(summary.focusArea?.label, "Metrics depth");
  assert.match(summary.recommendation.title, /metric depth/i);
  assert.equal(summary.prepPlan[1]?.title, "Metrics depth focused practice");
  assert.doesNotMatch(summary.prepPlan[1]?.title ?? "", /drill|workout/i);
  assert.equal(summary.recentInterviews[0]?.scoreLabel, "6.2");
  assert.deepEqual(summary.progressSignal.bars, [
    {
      score: 6.2,
      value: 62,
      dateLabel: "Jul 5",
      roundLabel: "Product Sense",
    },
  ]);
});

test("practice summary gives new users a first-interview path", () => {
  const summary = buildDashboardPracticeSummary([]);

  assert.equal(summary.isNewUser, true);
  assert.equal(summary.progress.score, null);
  assert.equal(summary.progress.state, "empty");
  assert.equal(summary.focusArea, null);
  assert.deepEqual(summary.progressSignal.bars, []);
  assert.equal(summary.recommendation.href, "/dashboard/new-interview");
  assert.match(summary.recommendation.title, /first pm mock interview/i);
});

test("question summary counts round and company filters while selecting a recommendation", () => {
  const summary = buildQuestionBankSummary([
    {
      id: "q1",
      company: "Airbnb",
      questionText: "Improve onboarding for first-time Airbnb hosts",
      questionType: "product_sense",
      askedAt: "2026-07-01T00:00:00.000Z",
      isActive: true,
    },
    {
      id: "q2",
      company: "Stripe",
      questionText: "Prioritize work after a payment failure spike",
      questionType: "execution",
      askedAt: "2026-06-20T00:00:00.000Z",
      isActive: true,
    },
  ]);

  assert.equal(summary.totalActive, 2);
  assert.deepEqual(summary.roundCounts, {
    "Product Sense": 1,
    Execution: 1,
  });
  assert.deepEqual(summary.companyCounts, {
    Airbnb: 1,
    Stripe: 1,
  });
  assert.equal(summary.recommendedQuestion?.id, "q1");
});

test("history summary turns sessions into review rows and repeated patterns", () => {
  const summary = buildHistorySummary([
    {
      ...baseSession,
      id: "session-1",
      feedback: {
        status: "completed",
        overallScore: "7.1",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 5,
      },
    },
    {
      ...baseSession,
      id: "session-2",
      roundType: "execution",
      startedAt: "2026-07-03T12:00:00.000Z",
      feedback: {
        status: "completed",
        overallScore: "6.8",
        structureScore: 7,
        clarityScore: 6,
        insightScore: 5,
      },
    },
  ]);

  assert.equal(summary.rows.length, 2);
  assert.equal(summary.rows[0]?.scoreLabel, "7.1");
  assert.equal(summary.rows[0]?.questionLabel, "—");
  assert.equal(summary.patterns[0]?.label, "Metrics depth");
  assert.equal(summary.nextReview.countLabel, "2x");
  assert.deepEqual(summary.filters, [
    "All interviews",
    "Product Sense",
    "Execution",
  ]);
});

test("history filters are derived from every round present in the log", () => {
  const summary = buildHistorySummary([
    {
      ...baseSession,
      id: "strategy-session",
      roundType: "strategy",
      feedback: null,
    },
  ]);

  assert.deepEqual(summary.filters, ["All interviews", "Strategy"]);
});

test("progress bars contain observed scored interviews only", () => {
  assert.deepEqual(buildProgressBars([6.2], 5), [{ score: 6.2, value: 62 }]);

  assert.deepEqual(
    buildProgressBars([7.1, 6.8, 6.4, 7.3, 8.1, 8.4], 5).map(
      (bar) => bar.score
    ),
    [8.1, 7.3, 6.4, 6.8, 7.1]
  );
  assert.deepEqual(buildProgressBars([Number.NaN, 11, -1]), []);
});

test("practice summary exposes honest zero, one, and many scored states", () => {
  const fixtures = createDashboardProgressFixtures();
  const zero = buildDashboardPracticeSummary(fixtures.zero);
  const one = buildDashboardPracticeSummary(fixtures.one);
  const many = buildDashboardPracticeSummary(fixtures.many);

  assert.deepEqual(
    [zero.progress.state, one.progress.state, many.progress.state],
    ["empty", "single", "trend"]
  );
  assert.deepEqual(
    [zero.progress.score, one.progress.score, many.progress.score],
    [null, 6.2, 6.8]
  );
  assert.deepEqual(
    many.progressSignal.bars.map((bar) => bar.score),
    [6.2, 6.8, 7.4]
  );
  assert.match(many.progress.deltaLabel, /\+1\.2 points across 3 interviews/);
});

test("recent scored average is rounded to one decimal in the dashboard contract", () => {
  const { many } = createDashboardProgressFixtures();
  const scores = ["6.2", "6.2", "6.1"];
  const sessions = many.map((session, index) => ({
    ...session,
    feedback: {
      ...session.feedback!,
      overallScore: scores[index]!,
    },
  }));

  const summary = buildDashboardPracticeSummary(sessions);

  assert.equal(summary.progress.score, 6.2);
});

test("only completed, valid scores contribute to progress and weaknesses", () => {
  const { everyFeedbackStatus } = createDashboardProgressFixtures();
  const summary = buildDashboardPracticeSummary(everyFeedbackStatus);
  const history = buildHistorySummary(everyFeedbackStatus);

  assert.equal(summary.progress.scoredInterviewCount, 1);
  assert.equal(summary.progress.score, 6.2);
  assert.equal(summary.progressSignal.bars.length, 1);
  assert.equal(summary.focusArea?.label, "Metrics depth");
  assert.deepEqual(history.patterns, [
    {
      label: "Metrics depth",
      count: 1,
      description:
        "Metrics depth was the lowest scored dimension in your latest scored feedback. Complete more interviews before treating it as a pattern.",
    },
  ]);

  const rowsById = new Map(history.rows.map((row) => [row.id, row]));
  assert.equal(
    rowsById.get("dashboard-pending")?.focusLabel,
    "Feedback is being prepared"
  );
  assert.equal(
    rowsById.get("dashboard-processing")?.scoreLabel,
    "Not scored yet"
  );
  assert.equal(rowsById.get("dashboard-failed")?.scoreLabel, "Not scored");
  assert.equal(
    rowsById.get("dashboard-failed")?.statusLabel,
    "Feedback failed"
  );
  assert.equal(rowsById.get("dashboard-skipped")?.scoreLabel, "Not scored");
  assert.equal(
    rowsById.get("dashboard-evidence-limited")?.scoreLabel,
    "No score"
  );
  assert.equal(
    rowsById.get("dashboard-evidence-limited")?.statusLabel,
    "Feedback ready — no score"
  );
  assert.equal(
    rowsById.get("dashboard-evidence-limited")?.feedbackHref,
    "/feedback/dashboard-evidence-limited"
  );
  assert.equal(
    rowsById.get("dashboard-corrupt-completed")?.statusLabel,
    "Feedback unavailable"
  );
  assert.equal(rowsById.get("dashboard-corrupt-completed")?.feedbackHref, null);
  assert.equal(
    rowsById.get("dashboard-skipped")?.feedbackState,
    "not-generated"
  );
  assert.equal(rowsById.get("dashboard-failed")?.feedbackHref, null);
});

test("an unavailable completed score cannot enter dashboard progress", () => {
  const unsupported = {
    ...baseSession,
    id: "unsupported-scored-completed",
    feedback: {
      status: "completed",
      presentationKind: "unavailable" as const,
      overallScore: "9.9",
      structureScore: 9.9,
      clarityScore: 9.9,
      insightScore: 9.9,
      communicationScore: 9.9,
      leadershipScore: 9.9,
    },
  };

  const practice = buildDashboardPracticeSummary([unsupported]);
  const history = buildHistorySummary([unsupported]);

  assert.equal(practice.progress.scoredInterviewCount, 0);
  assert.equal(practice.progress.score, null);
  assert.equal(practice.focusArea, null);
  assert.deepEqual(practice.progressSignal.bars, []);
  assert.deepEqual(history.patterns, []);
  assert.equal(history.rows[0]?.feedbackHref, null);
});

test("scoreless reviewability stays separate from scored progress evidence", () => {
  const { everyFeedbackStatus } = createDashboardProgressFixtures();
  const evidenceLimited = everyFeedbackStatus.find(
    (session) => session.id === "dashboard-evidence-limited"
  )!;
  const scored = everyFeedbackStatus.at(-1)!;
  const newerEvidenceLimited = {
    ...evidenceLimited,
    startedAt: "2026-07-11T12:00:00.000Z",
  };

  const practice = buildDashboardPracticeSummary([
    newerEvidenceLimited,
    scored,
  ]);
  const history = buildHistorySummary([newerEvidenceLimited, scored]);

  assert.equal(practice.progress.scoredInterviewCount, 1);
  assert.equal(practice.progress.score, 6.2);
  assert.equal(practice.progressSignal.bars.length, 1);
  assert.equal(practice.focusArea?.label, "Metrics depth");
  assert.equal(
    practice.lastFeedback?.href,
    "/feedback/dashboard-evidence-limited"
  );
  assert.equal(
    practice.recentInterviews[0]?.statusLabel,
    "Feedback ready — no score"
  );
  assert.equal(history.patterns.length, 1);
  assert.equal(history.nextReview.feedbackHref, `/feedback/${scored.id}`);
});

test("a scoreless-only history keeps feedback reachable without inventing patterns", () => {
  const { everyFeedbackStatus } = createDashboardProgressFixtures();
  const evidenceLimited = everyFeedbackStatus.find(
    (session) => session.id === "dashboard-evidence-limited"
  )!;
  const practice = buildDashboardPracticeSummary([evidenceLimited]);
  const history = buildHistorySummary([evidenceLimited]);

  assert.equal(practice.progress.state, "empty");
  assert.equal(practice.progress.score, null);
  assert.equal(practice.focusArea, null);
  assert.equal(practice.lastFeedback?.href, `/feedback/${evidenceLimited.id}`);
  assert.deepEqual(history.patterns, []);
  assert.equal(history.nextReview.title, "Review your latest feedback");
  assert.equal(
    history.nextReview.feedbackHref,
    `/feedback/${evidenceLimited.id}`
  );
});

test("dimension-coverage reviews stay reachable while only full scorecards enter progress", () => {
  const sessions = [
    {
      ...baseSession,
      id: "coaching-review",
      startedAt: "2026-07-12T12:00:00.000Z",
      feedback: {
        status: "completed",
        presentationKind: "coaching_review" as const,
        overallScore: null,
      },
    },
    {
      ...baseSession,
      id: "partial-scorecard",
      startedAt: "2026-07-11T12:00:00.000Z",
      feedback: {
        status: "completed",
        presentationKind: "partial_scorecard" as const,
        overallScore: null,
        structureScore: 8,
      },
    },
    {
      ...baseSession,
      id: "full-scorecard",
      startedAt: "2026-07-10T12:00:00.000Z",
      feedback: {
        status: "completed",
        presentationKind: "full_scorecard" as const,
        overallScore: "8.0",
        structureScore: 8,
        clarityScore: 8,
        insightScore: 8,
        communicationScore: 8,
        leadershipScore: 8,
      },
    },
  ];

  const practice = buildDashboardPracticeSummary(sessions);
  const history = buildHistorySummary(sessions);
  const rows = new Map(history.rows.map((row) => [row.id, row]));

  assert.equal(practice.progress.scoredInterviewCount, 1);
  assert.equal(practice.progress.score, 8);
  assert.deepEqual(
    practice.progressSignal.bars.map((bar) => bar.score),
    [8]
  );
  assert.equal(history.patterns[0]?.count, 1);
  assert.equal(practice.lastFeedback?.href, "/feedback/coaching-review");
  assert.match(practice.lastFeedback?.summary ?? "", /No numerical score/);
  assert.equal(history.nextReview.feedbackHref, "/feedback/full-scorecard");
  assert.equal(
    rows.get("partial-scorecard")?.statusLabel,
    "Feedback ready — partial scorecard"
  );
  assert.equal(
    rows.get("partial-scorecard")?.feedbackHref,
    "/feedback/partial-scorecard"
  );
  assert.equal(
    rows.get("coaching-review")?.feedbackHref,
    "/feedback/coaching-review"
  );
  assert.equal(
    rows.get("full-scorecard")?.feedbackHref,
    "/feedback/full-scorecard"
  );
});

test("completed null-score rows require the server-owned presentation kind", () => {
  const history = buildHistorySummary([
    {
      ...baseSession,
      id: "unsupported-completed",
      feedback: { status: "completed", overallScore: null },
    },
    {
      ...baseSession,
      id: "explicitly-invalid-completed",
      feedback: {
        status: "completed",
        presentationKind: "unavailable",
        overallScore: null,
      },
    },
    { ...baseSession, id: "missing-feedback", feedback: null },
  ]);

  for (const row of history.rows) {
    assert.equal(row.feedbackHref, null);
    assert.notEqual(row.statusLabel, "Feedback ready — no score");
  }
});
