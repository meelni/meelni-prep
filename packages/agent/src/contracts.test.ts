import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "@meelni/test-fixtures";

import {
  buildInterviewRoomMetadata,
  createInterviewRuntimeEvent,
  createTranscriptEvent,
  isTranscriptEvent,
  normalizeInterviewRuntimeConfig,
  normalizeAgentState,
  parseInterviewRuntimeEvent,
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

test("buildInterviewRoomMetadata keeps normalized runtime config objects intact", () => {
  const fixture = createProductSenseInterviewFixture();
  const metadata = buildInterviewRoomMetadata(fixture.roomMetadata);

  assert.equal(metadata.config, fixture.roomMetadata.config);
});

test("parseInterviewRoomMetadata fails closed for malformed metadata", () => {
  assert.throws(
    () => parseInterviewRoomMetadata("not-json"),
    /Invalid interview room metadata: invalid_json/
  );
});

test("parseInterviewRoomMetadata keeps question and config defaults", () => {
  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
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

test("runtime config rejects arbitrary provider model overrides", () => {
  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-1",
      round_type: "product_sense",
      config: {
        stt_model: "unknown/stt",
        llm_model: "openai/very-expensive-model",
        tts_model: "custom/tts:voice",
      },
    })
  );

  assert.equal(metadata.config.stt_model, "deepgram/nova-3");
  assert.equal(metadata.config.llm_model, "openai/gpt-4.1-mini");
  assert.equal(
    metadata.config.tts_model,
    "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
  );
});

test("full interview metadata requires versioned session correlation", () => {
  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({
          contract_version: 1,
          round_type: "product_sense",
          config: {},
        })
      ),
    /missing_session_id/
  );
  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({
          contract_version: 2,
          session_id: "session-1",
          round_type: "product_sense",
          config: {},
        })
      ),
    /unsupported_contract/
  );
});

test("runtime config normalizes hint mode to safe defaults", () => {
  assert.equal(
    normalizeInterviewRuntimeConfig({ hintMode: "gentle" }).hintMode,
    "gentle"
  );
  assert.equal(
    normalizeInterviewRuntimeConfig({ hintMode: "coach" }).hintMode,
    "coach"
  );
  assert.equal(
    normalizeInterviewRuntimeConfig({ hintMode: "always-on" as never })
      .hintMode,
    "off"
  );
  assert.equal(normalizeInterviewRuntimeConfig({}).hintMode, "off");
});

test("runtime config normalizes invalid cross-runtime values consistently", () => {
  const config = normalizeInterviewRuntimeConfig({
    feedback_mode: "always" as never,
    hintMode: "always" as never,
    speed: Number.NaN,
    volume: "loud" as never,
    emotion: "" as never,
    persona: 42 as never,
  });

  assert.equal(config.feedback_mode, "end_only");
  assert.equal(config.hintMode, "off");
  assert.equal(config.speed, 1);
  assert.equal(config.volume, 1);
  assert.equal(config.emotion, "professional");
  assert.equal(config.persona, null);

  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-invalid-config",
      round_type: "product_sense",
      mode: "video_only",
      question: {
        id: "question-1",
        text: "Design a product.",
        company: 42,
        type: "Product Sense",
        askedAt: 123,
      },
      config: {
        feedback_mode: "always",
        hintMode: "always",
        speed: true,
      },
    })
  );
  assert.equal(metadata.mode, undefined);
  assert.equal(metadata.question?.company, null);
  assert.equal(metadata.question?.askedAt, undefined);
  assert.equal(metadata.config.speed, 1);

  const malformedContainers = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-malformed-containers",
      round_type: "product_sense",
      config: ["not", "an", "object"],
      question: { id: 42, text: 99, type: true, company: null },
    })
  );
  assert.equal(malformedContainers.config.feedback_mode, "end_only");
  assert.equal(malformedContainers.question?.id, "");
  assert.equal(malformedContainers.question?.text, "");
  assert.equal(malformedContainers.question?.type, "");
});

test("transcript event parsing preserves the complete cross-runtime contract", () => {
  const liveKitFixture = createLiveKitStartFixture();
  const event = createTranscriptEvent(liveKitFixture.transcriptEvent);

  assert.equal(isTranscriptEvent(event), true);

  const parsed = parseTranscriptEvent(JSON.stringify(event));

  assert.equal(parsed?.speaker, "interviewer");
  assert.equal("contract_version" in parsed!, true);
  assert.equal("event_id" in parsed! && parsed.event_id, "transcript-event-1");
  assert.equal(
    "audio_duration_ms" in parsed! && parsed.audio_duration_ms,
    8000
  );
  assert.equal("section" in parsed! && parsed.section, "prompt");
});

test("transcript event parsing rejects missing, invented, or inconsistent timing", () => {
  const fixture = createLiveKitStartFixture().transcriptEvent;

  assert.equal(
    parseTranscriptEvent(JSON.stringify({ ...fixture, audio_duration_ms: 0 })),
    null
  );
  assert.equal(
    parseTranscriptEvent(JSON.stringify({ ...fixture, section: null })),
    null
  );
  assert.equal(
    parseTranscriptEvent(
      JSON.stringify({ ...fixture, ended_at: fixture.started_at })
    ),
    null
  );
  assert.equal(
    parseTranscriptEvent(
      JSON.stringify({ ...fixture, audio_duration_ms: 7998 })
    ),
    null
  );
});

test("transcript contract distinguishes partially delivered interviewer speech", () => {
  const fixture = createLiveKitStartFixture().transcriptEvent;
  const parsed = parseTranscriptEvent(
    JSON.stringify({ ...fixture, delivery_state: "partially_delivered" })
  );

  assert.equal(
    parsed && "delivery_state" in parsed ? parsed.delivery_state : null,
    "partially_delivered"
  );
});

test("legacy v1 packets remain identifiable without fabricating v2 fields", () => {
  const parsed = parseTranscriptEvent(
    JSON.stringify({
      speaker: "user",
      text: "A legacy finalized turn.",
      timestamp: 1782600000,
      is_final: true,
    })
  );

  assert.deepEqual(parsed, {
    speaker: "user",
    text: "A legacy finalized turn.",
    timestamp: 1782600000,
    is_final: true,
  });
});

test("normalizeAgentState maps unknown voice assistant states to idle", () => {
  assert.equal(normalizeAgentState("listening"), "listening");
  assert.equal(normalizeAgentState("connecting"), "idle");
});

test("runtime lifecycle events carry a versioned provider-neutral contract", () => {
  const event = createInterviewRuntimeEvent({
    event_id: "runtime-event-1",
    session_id: "session-1",
    type: "runtime_activated",
    occurred_at: "2026-07-09T21:00:00.000Z",
    runtime_ref: { provider: "voice", id: "runtime-1" },
  });

  assert.deepEqual(parseInterviewRuntimeEvent(JSON.stringify(event)), event);
  assert.equal(event.contract_version, 1);
});

test("runtime lifecycle events reject unknown versions and malformed failures", () => {
  assert.equal(
    parseInterviewRuntimeEvent(
      JSON.stringify({
        contract_version: 2,
        event_id: "runtime-event-1",
        session_id: "session-1",
        type: "runtime_activated",
        occurred_at: "2026-07-09T21:00:00.000Z",
      })
    ),
    null
  );

  assert.throws(
    () =>
      createInterviewRuntimeEvent({
        event_id: "runtime-event-2",
        session_id: "session-1",
        type: "provider_failed",
        occurred_at: "2026-07-09T21:00:00.000Z",
      }),
    /Invalid interview runtime lifecycle event/
  );
});
