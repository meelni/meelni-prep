import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_INTERVIEW_TYPES,
  buildFullConfig,
  calculateOverallScore,
  canAccessInterviewType,
  clampScore,
  getAllowedInterviewTypes,
  getDefaultDuration,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
  isValidRoundType,
  type QuestionPracticePayload,
  type TranscriptTurnInput,
  validateScores
} from "./index";

test("buildFullConfig applies system defaults and smart duration", () => {
  const config = buildFullConfig({
    difficulty: "advanced",
    roundType: "strategy"
  });

  assert.equal(config.roundType, "strategy");
  assert.equal(config.difficulty, "advanced");
  assert.equal(config.duration, 45);
  assert.equal(config.feedback_mode, "end_only");
  assert.equal(config.stt_model, "deepgram/nova-3");
  assert.equal(config.llm_model, "openai/gpt-4.1-mini");
  assert.equal(config.tts_model, "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9");
});

test("interview type helpers preserve current PM interview access model", () => {
  assert.deepEqual(ALL_INTERVIEW_TYPES, [
    "product_sense",
    "behavioral",
    "execution",
    "strategy"
  ]);
  assert.equal(isValidRoundType("product_sense"), true);
  assert.equal(isValidRoundType("sales"), false);
  assert.equal(getDefaultDuration("behavioral"), 30);
  assert.equal(canAccessInterviewType("free", "product_sense"), true);
  assert.equal(canAccessInterviewType("free", "execution"), false);
  assert.deepEqual(getAllowedInterviewTypes("free"), ["product_sense"]);
  assert.deepEqual(getLockedInterviewTypes("free"), ["behavioral", "execution", "strategy"]);
  assert.equal(getRequiredTier("strategy"), "pro");
  assert.equal(getRequiredTierBadge("behavioral"), "Pro");
});

test("evaluation score helpers stay PM-rubric compatible", () => {
  const overall = calculateOverallScore({
    clarity: 8,
    communication: 7,
    insight: 9,
    leadership: 6,
    structure: 8
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
      structure: 8
    }),
    true
  );
});

test("session and question payload contracts are available from core", () => {
  const turn: TranscriptTurnInput = {
    section: "opening",
    sessionId: "session-1",
    speaker: "user",
    text: "I would start by clarifying the goal."
  };

  const question: QuestionPracticePayload = {
    company: "Meta",
    questionId: "question-1",
    questionText: "Design a product for education at Meta.",
    questionType: "Product Sense"
  };

  assert.equal(turn.speaker, "user");
  assert.equal(question.company, "Meta");
});
