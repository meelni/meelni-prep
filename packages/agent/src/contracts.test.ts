import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewRoomMetadata,
  createTranscriptEvent,
  getFallbackInterviewRoomMetadata,
  isTranscriptEvent,
  normalizeAgentState,
  parseInterviewRoomMetadata,
  parseTranscriptEvent
} from "./index";

test("buildInterviewRoomMetadata serializes the production room metadata shape", () => {
  const metadata = buildInterviewRoomMetadata({
    config: {
      difficulty: "intermediate",
      duration: 45,
      feedback_mode: "end_only",
      llm_model: "openai/gpt-4.1-mini",
      stt_model: "deepgram/nova-3",
      tts_model: "elevenlabs/eleven_turbo_v2_5:voice",
      voice: "voice"
    },
    mode: "voice_video",
    question: {
      askedAt: "2026-01-01T00:00:00.000Z",
      company: "Meta",
      id: "question-1",
      text: "Design a product for education at Meta.",
      type: "Product Sense"
    },
    round_type: "product_sense",
    session_id: "session-1"
  });

  assert.equal(metadata.round_type, "product_sense");
  assert.equal(metadata.question?.id, "question-1");
  assert.equal(metadata.config.difficulty, "intermediate");
});

test("parseInterviewRoomMetadata applies fallback defaults for malformed metadata", () => {
  const metadata = parseInterviewRoomMetadata("not-json");

  assert.deepEqual(metadata, getFallbackInterviewRoomMetadata());
});

test("parseInterviewRoomMetadata keeps question and config defaults", () => {
  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      session_id: "session-1",
      round_type: "strategy",
      question: {
        id: "question-1",
        text: "Should Notion build native mobile?",
        company: "Notion",
        type: "Product Strategy"
      },
      config: {
        difficulty: "advanced"
      }
    })
  );

  assert.equal(metadata.session_id, "session-1");
  assert.equal(metadata.round_type, "strategy");
  assert.equal(metadata.question?.text, "Should Notion build native mobile?");
  assert.equal(metadata.config.difficulty, "advanced");
  assert.equal(metadata.config.stt_model, "deepgram/nova-3");
});

test("transcript event parsing normalizes timestamps and speakers", () => {
  const event = createTranscriptEvent({
    speaker: "interviewer",
    text: "Let's start with the product goal.",
    timestamp: 1782600000
  });

  assert.equal(isTranscriptEvent(event), true);

  const parsed = parseTranscriptEvent(JSON.stringify(event));

  assert.equal(parsed?.speaker, "interviewer");
  assert.equal(parsed?.timestamp, 1782600000);
});

test("normalizeAgentState maps unknown voice assistant states to idle", () => {
  assert.equal(normalizeAgentState("listening"), "listening");
  assert.equal(normalizeAgentState("connecting"), "idle");
});
