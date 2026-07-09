import assert from "node:assert/strict";
import test from "node:test";

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

  assert.equal(summary.progress.score, 62);
  assert.equal(summary.focusArea.label, "Metrics depth");
  assert.match(summary.recommendation.title, /metric depth/i);
  assert.equal(summary.recentInterviews[0]?.scoreLabel, "6.2");
  assert.deepEqual(
    summary.progressSignal.bars.map((bar) => bar.state),
    ["actual", "placeholder", "placeholder", "placeholder", "placeholder"]
  );
});

test("practice summary gives new users a first-interview path", () => {
  const summary = buildDashboardPracticeSummary([]);

  assert.equal(summary.isNewUser, true);
  assert.equal(summary.progress.score, 0);
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
  assert.equal(summary.patterns[0]?.label, "Metrics depth");
  assert.equal(summary.nextReview.countLabel, "2x");
});

test("progress bars keep a stable frame with honest placeholders", () => {
  assert.deepEqual(buildProgressBars([6.2], 5), [
    { value: 62, state: "actual" },
    { value: 70, state: "placeholder" },
    { value: 78, state: "placeholder" },
    { value: 86, state: "placeholder" },
    { value: 94, state: "placeholder" },
  ]);

  assert.deepEqual(
    buildProgressBars([7.1, 6.8, 6.4, 7.3, 8.1, 8.4], 5).map(
      (bar) => bar.state
    ),
    ["actual", "actual", "actual", "actual", "actual"]
  );
});
