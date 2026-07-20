import assert from "node:assert/strict";
import test from "node:test";

import { createProductSenseInterviewFixture } from "@meelni/test-fixtures";

import {
  ALL_INTERVIEW_TYPES,
  BILLING_CATALOG,
  BILLING_CATALOG_ORDER,
  buildFullConfig,
  calculateOverallScore,
  clampScore,
  computeCreditEntitlements,
  type CreditEntitlementState,
  getBillingCatalogItem,
  getCompletedFeedbackScore,
  getDefaultDuration,
  buildInterviewRecommendation,
  isValidRoundType,
  mapQuestionTypeToRoundType,
  isCompletedScoredFeedback,
  parseRubricScore,
  validateScores,
} from "./index";

test("buildFullConfig applies system defaults and smart duration", () => {
  const config = buildFullConfig({
    difficulty: "advanced",
    roundType: "strategy",
  });

  assert.equal(config.roundType, "strategy");
  assert.equal(config.difficulty, "advanced");
  assert.equal(config.duration, 45);
  assert.equal(config.hintMode, "off");
  assert.deepEqual(config.questionPreference, {
    recency: "very_recent",
    recentDays: 365,
  });
  assert.equal("stt_model" in config, false);
});

test("billing catalog exposes accepted credit products", () => {
  assert.deepEqual(BILLING_CATALOG_ORDER, [
    "trial",
    "interview_pass",
    "starter",
    "pro",
    "admin_grant",
  ]);

  assert.equal(BILLING_CATALOG.trial.priceInCents, 0);
  assert.equal(BILLING_CATALOG.trial.includedCredits, 2);
  assert.equal(BILLING_CATALOG.trial.expiresAfterDays, 7);
  assert.equal(BILLING_CATALOG.trial.rolloverCapCredits, 0);

  assert.equal(BILLING_CATALOG.interview_pass.priceInCents, 900);
  assert.equal(BILLING_CATALOG.interview_pass.includedCredits, 1);
  assert.equal(BILLING_CATALOG.interview_pass.expiresAfterDays, 30);

  assert.equal(BILLING_CATALOG.starter.priceInCents, 1900);
  assert.equal(BILLING_CATALOG.starter.includedCredits, 4);
  assert.equal(BILLING_CATALOG.starter.rolloverCapCredits, 4);
  assert.equal(BILLING_CATALOG.starter.rolloverExpiresAfterDays, 60);

  assert.equal(BILLING_CATALOG.pro.priceInCents, 4900);
  assert.equal(BILLING_CATALOG.pro.includedCredits, 12);
  assert.equal(BILLING_CATALOG.pro.rolloverCapCredits, 12);
  assert.equal(BILLING_CATALOG.pro.rolloverExpiresAfterDays, 60);

  assert.equal(getBillingCatalogItem("pro").displayName, "Pro");
});

test("credit entitlements unlock all PM rounds while credits remain", () => {
  const trialState: CreditEntitlementState = {
    activeOffer: "trial",
    billingStatus: "trialing",
    remainingCredits: 2,
    nextCreditExpiresAt: "2026-07-06T00:00:00.000Z",
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(trialState);

  assert.equal(entitlements.canStartInterview, true);
  assert.equal(entitlements.remainingCredits, 2);
  assert.deepEqual(entitlements.allowedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.deepEqual(entitlements.lockedRoundTypes, []);
  assert.equal(entitlements.creditExpiresAt, "2026-07-06T00:00:00.000Z");
  assert.equal(entitlements.activeOffer, "trial");
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("credit entitlements block interview start when credits are exhausted", () => {
  const exhaustedState: CreditEntitlementState = {
    activeOffer: "starter",
    billingStatus: "active",
    remainingCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(exhaustedState);

  assert.equal(entitlements.canStartInterview, false);
  assert.equal(entitlements.remainingCredits, 0);
  assert.deepEqual(entitlements.allowedRoundTypes, []);
  assert.deepEqual(entitlements.lockedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.equal(entitlements.noCreditReason, "no_credits_remaining");
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("credit entitlements expose trial CTA for users without active billing", () => {
  const expiredState: CreditEntitlementState = {
    activeOffer: null,
    billingStatus: "none",
    remainingCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: true,
  };

  const entitlements = computeCreditEntitlements(expiredState);

  assert.equal(entitlements.canStartInterview, false);
  assert.equal(entitlements.trialAvailable, true);
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("admin credit state can start interviews when credits are present", () => {
  const adminState: CreditEntitlementState = {
    activeOffer: "admin_grant",
    billingStatus: "admin",
    remainingCredits: 5,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(adminState);

  assert.equal(entitlements.canStartInterview, true);
  assert.deepEqual(entitlements.allowedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.equal(entitlements.canBuyPass, false);
  assert.equal(entitlements.canSubscribe, false);
});

test("interview type helpers preserve PM round contracts", () => {
  assert.deepEqual(ALL_INTERVIEW_TYPES, [
    "product_sense",
    "behavioral",
    "execution",
    "strategy",
  ]);
  assert.equal(isValidRoundType("product_sense"), true);
  assert.equal(isValidRoundType("sales"), false);
  assert.equal(getDefaultDuration("behavioral"), 30);
});

test("evaluation score helpers stay PM-rubric compatible", () => {
  const overall = calculateOverallScore({
    clarity: 8,
    communication: 7,
    insight: 9,
    leadership: 6,
    structure: 8,
  });

  assert.equal(overall, 7.8);
  assert.equal(clampScore(-2), 0);
  assert.equal(clampScore(12), 10);
  assert.equal(
    validateScores({
      clarity: 8,
      communication: 7,
      insight: 9,
      leadership: 6,
      overall,
      structure: 8,
    }),
    true
  );
});

test("progress evidence requires completed feedback with a valid 0-10 score", () => {
  assert.equal(
    getCompletedFeedbackScore({ status: "completed", overallScore: "7.4" }),
    7.4
  );
  assert.equal(
    isCompletedScoredFeedback({ status: "completed", overallScore: 0 }),
    true
  );

  for (const status of ["pending", "processing", "failed", "skipped", null]) {
    assert.equal(
      getCompletedFeedbackScore({ status, overallScore: "8.1" }),
      null
    );
  }

  assert.equal(
    getCompletedFeedbackScore({ status: "completed", overallScore: null }),
    null
  );
  assert.equal(
    getCompletedFeedbackScore({ status: "completed", overallScore: "NaN" }),
    null
  );
  assert.equal(
    getCompletedFeedbackScore({ status: "completed", overallScore: "   " }),
    null
  );
  assert.equal(parseRubricScore(-0.1), null);
  assert.equal(parseRubricScore(10.1), null);
});

test("session and question payload contracts are available from core", () => {
  const fixture = createProductSenseInterviewFixture();
  const turn = fixture.transcript.find((entry) => entry.speaker === "user");
  const question = fixture.question;

  assert.equal(turn?.speaker, "user");
  assert.equal(question.company, "Meta");
});

test("recommended interview has a deterministic PM wedge fallback", () => {
  const recommendation = buildInterviewRecommendation();

  assert.equal(recommendation.roundType, "product_sense");
  assert.equal(recommendation.difficulty, "intermediate");
  assert.equal(recommendation.creditCost, 1);
  assert.equal(recommendation.durationMinutes, 45);
  assert.equal(recommendation.source, "fallback");
  assert.equal(recommendation.hintMode, "off");
  assert.equal(recommendation.question, null);
  assert.match(recommendation.rationale, /Product Sense/);
});

test("selected question recommendation preserves question handoff", () => {
  const fixture = createProductSenseInterviewFixture();
  const recommendation = buildInterviewRecommendation({
    selectedQuestion: {
      id: fixture.question.questionId,
      text: fixture.question.questionText,
      company: fixture.question.company,
      type: "A/B Testing",
    },
  });

  assert.equal(recommendation.roundType, "execution");
  assert.equal(recommendation.difficulty, "intermediate");
  assert.equal(recommendation.source, "selected_question");
  assert.deepEqual(recommendation.question, {
    id: fixture.question.questionId,
    text: fixture.question.questionText,
    company: fixture.question.company,
    type: "A/B Testing",
  });
  assert.match(recommendation.rationale, /selected question/);
});

test("launch context overrides fallback interview defaults", () => {
  const recommendation = buildInterviewRecommendation({
    company: "Stripe",
    focus: "prioritization",
    requestedDifficulty: "advanced",
    requestedRoundType: "strategy",
  });

  assert.equal(recommendation.roundType, "strategy");
  assert.equal(recommendation.difficulty, "advanced");
  assert.equal(recommendation.source, "launch_context");
});

test("a selected question round overrides conflicting launch context", () => {
  const recommendation = buildInterviewRecommendation({
    selectedQuestion: {
      id: "question-1",
      text: "How would you improve activation?",
      company: "Example",
      type: "Product Sense",
    },
    requestedRoundType: "strategy",
    requestedDifficulty: "advanced",
  });

  assert.equal(recommendation.roundType, "product_sense");
  assert.equal(recommendation.difficulty, "advanced");
  assert.equal(recommendation.source, "selected_question");
});

test("question type mapping supports stored question bank labels", () => {
  assert.equal(mapQuestionTypeToRoundType("Behavioral"), "behavioral");
  assert.equal(
    mapQuestionTypeToRoundType("Product design/strategy"),
    "product_sense"
  );
  assert.equal(mapQuestionTypeToRoundType("Pricing"), "execution");
  assert.equal(mapQuestionTypeToRoundType("Product Strategy"), "strategy");
  assert.equal(mapQuestionTypeToRoundType("Strategy"), "strategy");
  assert.equal(mapQuestionTypeToRoundType("Unknown"), null);
});
