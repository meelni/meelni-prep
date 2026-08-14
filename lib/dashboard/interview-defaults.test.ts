import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeInterviewLauncherDefaults,
  resolveInterviewLauncherDefaults,
} from "./interview-defaults";

test("saved dashboard settings normalize to launcher domain values", () => {
  assert.deepEqual(
    normalizeInterviewLauncherDefaults({
      defaultInterviewType: "analytical",
      defaultDifficulty: "hard",
      questionRecency: "recent",
    }),
    {
      roundType: "execution",
      difficulty: "advanced",
      questionPreference: { recency: "recent", recentDays: 730 },
    }
  );
});

test("invalid saved values fall back to launcher-safe defaults", () => {
  assert.deepEqual(
    normalizeInterviewLauncherDefaults({
      defaultInterviewType: "sales",
      defaultDifficulty: "impossible",
      questionRecency: "never",
    }),
    {
      roundType: "product_sense",
      difficulty: "intermediate",
      questionPreference: { recency: "very_recent", recentDays: 365 },
    }
  );
});

test("explicit URL context wins over saved launcher defaults", () => {
  const saved = normalizeInterviewLauncherDefaults({
    defaultInterviewType: "analytical",
    defaultDifficulty: "hard",
    questionRecency: "all",
  });

  assert.deepEqual(
    resolveInterviewLauncherDefaults({
      saved,
      explicitRoundType: "strategy",
      explicitDifficulty: "beginner",
    }),
    {
      roundType: "strategy",
      difficulty: "beginner",
      questionPreference: { recency: "all" },
    }
  );
});
