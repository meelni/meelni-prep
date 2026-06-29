import assert from "node:assert/strict";
import test from "node:test";

import { createProductSenseInterviewFixture } from "@meelni/test-fixtures";

import {
  ALL_INTERVIEW_TYPES,
  BILLING_CATALOG,
  BILLING_CATALOG_ORDER,
  buildFullConfig,
  calculateOverallScore,
  canAccessInterviewType,
  clampScore,
  getAllowedInterviewTypes,
  getBillingCatalogItem,
  getDefaultDuration,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
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

test("interview type helpers preserve current PM interview access model", () => {
  assert.deepEqual(ALL_INTERVIEW_TYPES, [
    "product_sense",
    "behavioral",
    "execution",
    "strategy",
  ]);
  assert.equal(isValidRoundType("product_sense"), true);
  assert.equal(isValidRoundType("sales"), false);
  assert.equal(getDefaultDuration("behavioral"), 30);
  assert.equal(canAccessInterviewType("free", "product_sense"), true);
  assert.equal(canAccessInterviewType("free", "execution"), false);
  assert.deepEqual(getAllowedInterviewTypes("free"), ["product_sense"]);
  assert.deepEqual(getLockedInterviewTypes("free"), [
    "behavioral",
    "execution",
    "strategy",
  ]);
  assert.equal(getRequiredTier("strategy"), "pro");
  assert.equal(getRequiredTierBadge("behavioral"), "Pro");
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
