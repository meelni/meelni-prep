import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "@meelni/test-fixtures";

import {
  buildInterviewRoomMetadata,
  createTranscriptEvent,
  getFallbackInterviewRoomMetadata,
  isTranscriptEvent,
  normalizeAgentState,
  parseInterviewRoomMetadata,
  parseTranscriptEvent,
} from "./index";

test("buildInterviewRoomMetadata serializes the production room metadata shape", () => {
  const fixture = createProductSenseInterviewFixture();
  const metadata = buildInterviewRoomMetadata(fixture.roomMetadata);

  assert.equal(metadata.round_type, "product_sense");
  assert.equal(metadata.question?.id, fixture.question.questionId);
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
        type: "Product Strategy",
      },
      config: {
        difficulty: "advanced",
      },
    })
  );

  assert.equal(metadata.session_id, "session-1");
  assert.equal(metadata.round_type, "strategy");
  assert.equal(metadata.question?.text, "Should Notion build native mobile?");
  assert.equal(metadata.config.difficulty, "advanced");
  assert.equal(metadata.config.stt_model, "deepgram/nova-3");
});

test("transcript event parsing normalizes timestamps and speakers", () => {
  const liveKitFixture = createLiveKitStartFixture();
  const event = createTranscriptEvent(liveKitFixture.transcriptEvent);

  assert.equal(isTranscriptEvent(event), true);

  const parsed = parseTranscriptEvent(JSON.stringify(event));

  assert.equal(parsed?.speaker, "interviewer");
  assert.equal(parsed?.timestamp, 1782600000);
});

test("normalizeAgentState maps unknown voice assistant states to idle", () => {
  assert.equal(normalizeAgentState("listening"), "listening");
  assert.equal(normalizeAgentState("connecting"), "idle");
});
