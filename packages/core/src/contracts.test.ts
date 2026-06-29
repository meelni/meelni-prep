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
  getDefaultDuration,
  isValidRoundType,
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
  assert.equal(config.feedback_mode, "end_only");
  assert.equal(config.stt_model, "deepgram/nova-3");
  assert.equal(config.llm_model, "openai/gpt-4.1-mini");
  assert.equal(
    config.tts_model,
    "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9"
  );
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

test("session and question payload contracts are available from core", () => {
  const fixture = createProductSenseInterviewFixture();
  const turn = fixture.transcript.find((entry) => entry.speaker === "user");
  const question = fixture.question;

  assert.equal(turn?.speaker, "user");
  assert.equal(question.company, "Meta");
});
