import assert from "node:assert/strict";
import test from "node:test";
import transcriptGoldenCases from "../../test-fixtures/transcript-events.json";
import runtimeConfigEnvGoldenCases from "../../test-fixtures/runtime-config-env.json";

import {
  createLiveKitStartFixture,
  createProductSenseInterviewFixture,
} from "@meelni/test-fixtures";

import {
  acceptTranscriptEventOnce,
  buildInterviewRoomMetadata,
  createInterviewRuntimeEvent,
  createTranscriptEvent,
  getTranscriptEventTiming,
  isInterviewRuntimeEvent,
  isTranscriptEvent,
  isTranscriptInterruptionMarker,
  isTranscriptRuntimeSettlement,
  normalizeInterviewRuntimeConfig,
  normalizeInterviewClientPreferences,
  interviewRuntimeSettingsFromEnv,
  normalizeAgentState,
  parseInterviewRuntimeEvent,
  parseInterviewRoomMetadata,
  parseTranscriptEvent,
} from "./index";

const TRANSCRIPT_INGEST_URL = "http://localhost:3000/api/internal/transcript";

test("buildInterviewRoomMetadata serializes the production room metadata shape", () => {
  const fixture = createProductSenseInterviewFixture();
  const metadata = buildInterviewRoomMetadata(fixture.roomMetadata);

  assert.equal(metadata.round_type, "product_sense");
  assert.equal(metadata.candidate_identity, "fixture-user-1");
  assert.equal(metadata.deadline_at, fixture.roomMetadata.deadline_at);
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

test("room metadata rejects an explicitly malformed candidate identity", () => {
  assert.throws(
    () =>
      parseInterviewRoomMetadata(
        JSON.stringify({
          contract_version: 1,
          session_id: "session-1",
          candidate_identity: " ",
          transcript_ingest_url: TRANSCRIPT_INGEST_URL,
          round_type: "strategy",
          config: {},
        })
      ),
    /missing_candidate_identity/
  );
});

test("parseInterviewRoomMetadata keeps question and config defaults", () => {
  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-1",
      transcript_ingest_url: TRANSCRIPT_INGEST_URL,
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
  assert.equal(metadata.deadline_at, null);
});

test("room metadata normalizes the absolute deadline to canonical UTC", () => {
  const fromDate = buildInterviewRoomMetadata({
    session_id: "session-deadline-date",
    transcript_ingest_url: TRANSCRIPT_INGEST_URL,
    deadline_at: new Date("2026-07-09T12:30:00.123Z"),
    round_type: "product_sense",
    config: normalizeInterviewRuntimeConfig({ duration: 30 }),
    question: null,
  });
  const fromJson = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-deadline-json",
      transcript_ingest_url: TRANSCRIPT_INGEST_URL,
      deadline_at: "2026-07-09T12:30:00.123Z",
      round_type: "product_sense",
      config: { duration: 30 },
    })
  );

  assert.equal(fromDate.deadline_at, "2026-07-09T12:30:00.123Z");
  assert.equal(fromJson.deadline_at, "2026-07-09T12:30:00.123Z");
});

test("room metadata fails closed for an explicitly malformed deadline", () => {
  for (const deadline_at of [
    "",
    "2026-07-09T12:30:00Z",
    "2026-07-09T12:30:00.000+00:00",
    "not-a-date",
    1783600200000,
  ]) {
    assert.throws(
      () =>
        parseInterviewRoomMetadata(
          JSON.stringify({
            contract_version: 1,
            session_id: "session-invalid-deadline",
            transcript_ingest_url: TRANSCRIPT_INGEST_URL,
            deadline_at,
            round_type: "product_sense",
            config: {},
          })
        ),
      /invalid_deadline/,
      String(deadline_at)
    );
  }
});

test("room metadata requires an exact secure runtime transcript URL", () => {
  for (const transcript_ingest_url of [
    "",
    "http://meelni.com/api/internal/transcript",
    "https://meelni.com/api/internal/transcript?session=1",
    "https://meelni.com/other",
    "https://user:secret@meelni.com/api/internal/transcript",
  ]) {
    assert.throws(
      () =>
        parseInterviewRoomMetadata(
          JSON.stringify({
            contract_version: 1,
            session_id: "session-invalid-ingest-url",
            transcript_ingest_url,
            round_type: "product_sense",
            config: {},
          })
        ),
      /invalid_transcript_ingest_url/
    );
  }
});

test("room parsing preserves the web server's resolved runtime snapshot", () => {
  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-1",
      transcript_ingest_url: TRANSCRIPT_INGEST_URL,
      round_type: "product_sense",
      config: {
        stt_model: "unknown/stt",
        llm_model: "openai/very-expensive-model",
        tts_model: "custom/tts:voice",
      },
    })
  );

  assert.equal(metadata.config.stt_model, "unknown/stt");
  assert.equal(metadata.config.llm_model, "openai/very-expensive-model");
  assert.equal(metadata.config.tts_model, "custom/tts:voice");
});

test("public preferences strip every legacy runtime control alias", () => {
  const preferences = normalizeInterviewClientPreferences({
    difficulty: "advanced",
    duration: 45,
    hintMode: "coach",
    questionPreference: { recency: "recent", recentDays: 730 },
    stt_model: "attacker/stt",
    llm_model: "attacker/llm",
    tts_model: "attacker/tts",
    sttModel: "legacy/stt",
    llmModel: "legacy/llm",
    ttsModel: "legacy/tts",
    provider: "attacker",
    stt_provider: "attacker",
    llm_provider: "attacker",
    tts_provider: "attacker",
    voice: "attacker",
    speed: 99,
    emotion: "attacker",
    volume: 99,
    feedback_mode: "real_time",
    arbitrary: true,
  });

  assert.deepEqual(preferences, {
    difficulty: "advanced",
    duration: 45,
    hintMode: "coach",
    questionPreference: { recency: "recent", recentDays: 730 },
  });
});

test("server environment resolves trusted runtime settings", () => {
  const settings = interviewRuntimeSettingsFromEnv({
    MEELNI_INTERVIEW_STT_MODEL: "operator/stt",
    MEELNI_INTERVIEW_LLM_MODEL: "operator/llm",
    MEELNI_INTERVIEW_TTS_MODEL: "operator/tts",
    MEELNI_INTERVIEW_VOICE: "operator-voice",
    MEELNI_INTERVIEW_TTS_SPEED: "1.2",
  });

  assert.equal(settings.stt_model, "operator/stt");
  assert.equal(settings.llm_model, "operator/llm");
  assert.equal(settings.tts_model, "operator/tts");
  assert.equal(settings.voice, "operator-voice");
  assert.equal(settings.speed, 1.2);
});

test("TypeScript matches shared runtime environment golden cases", () => {
  for (const goldenCase of runtimeConfigEnvGoldenCases) {
    assert.deepEqual(
      interviewRuntimeSettingsFromEnv(
        goldenCase.env as Record<string, string | undefined>
      ),
      goldenCase.expected,
      goldenCase.name
    );
  }
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
    duration: 60,
  });

  assert.equal(config.feedback_mode, "end_only");
  assert.equal(config.hintMode, "off");
  assert.equal(config.speed, 1);
  assert.equal(config.volume, 1);
  assert.equal(config.emotion, "professional");
  assert.equal(config.duration, 30);

  const metadata = parseInterviewRoomMetadata(
    JSON.stringify({
      contract_version: 1,
      session_id: "session-invalid-config",
      transcript_ingest_url: TRANSCRIPT_INGEST_URL,
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
      transcript_ingest_url: TRANSCRIPT_INGEST_URL,
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
  assert.equal(
    parseTranscriptEvent(
      JSON.stringify({ ...fixture, audio_duration_ms: 8000.5 })
    ),
    null
  );
  assert.equal(
    parseTranscriptEvent(JSON.stringify({ ...fixture, sequence: 1.5 })),
    null
  );
  assert.equal(
    parseTranscriptEvent(
      JSON.stringify({
        ...fixture,
        started_at: "2026-06-27 17:30:00Z",
      })
    ),
    null
  );
  assert.equal(
    parseTranscriptEvent(JSON.stringify({ ...fixture, writer_id: "" })),
    null
  );
});

test("transcript replay guard accepts one packet identity exactly once", () => {
  const accepted = new Set<string>();
  const event = createLiveKitStartFixture().transcriptEvent;

  assert.equal(acceptTranscriptEventOnce(accepted, event), true);
  assert.equal(acceptTranscriptEventOnce(accepted, event), false);
  assert.equal(accepted.size, 1);
});

test("TypeScript accepts and rejects the shared transcript golden cases", () => {
  for (const { name, event } of transcriptGoldenCases.valid) {
    assert.equal(isTranscriptEvent(event), true, name);
  }
  for (const { name, event } of transcriptGoldenCases.invalid) {
    assert.equal(isTranscriptEvent(event), false, name);
  }
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

test("integrity markers contain no transcript text and stay outside transcript parsing", () => {
  const marker = {
    contract_version: 1,
    event_type: "integrity_unavailable",
    event_id: "writer-1:speech-1:unavailable",
    writer_id: "writer-1",
    sequence: 1,
    session_id: "session-1",
    room_name: "interview-room",
    speaker: "interviewer",
    occurred_at: "2026-07-10T08:30:00.000Z",
    reason: "no_provider_confirmed_prefix",
  };

  assert.equal(isTranscriptInterruptionMarker(marker), true);
  assert.equal("text" in marker, false);
  assert.equal(parseTranscriptEvent(JSON.stringify(marker)), null);

  assert.equal(
    isTranscriptInterruptionMarker({
      ...marker,
      event_id: "writer-1:user-message-2:unavailable",
      speaker: "user",
      reason: "canonicalization_failed",
    }),
    true
  );
});

test("runtime settlement is strict metadata-only evidence", () => {
  const settlement = {
    contract_version: 1,
    event_type: "runtime_settlement",
    session_id: "session-1",
    room_name: "interview-room",
    writer_id: "writer-1",
    state: "settled",
    settled_at: "2026-07-10T08:30:00.000Z",
  };

  assert.equal(isTranscriptRuntimeSettlement(settlement), true);
  assert.equal(
    isTranscriptRuntimeSettlement({ ...settlement, text: "must be rejected" }),
    false
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
  assert.deepEqual(getTranscriptEventTiming(parsed!), {
    timestampMs: 1782600000000,
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

  assert.throws(
    () =>
      createInterviewRuntimeEvent({
        event_id: "runtime-event-3",
        session_id: "session-1",
        type: "provider_failed",
        occurred_at: "2026-07-09T21:00:00.000Z",
        failure: {
          reason: "provider_failure",
          code: "Provider stack: secret",
          retryable: false,
        },
      }),
    /Invalid interview runtime lifecycle event/
  );
});

test("runtime lifecycle events reject provider payload leakage", () => {
  const valid = {
    contract_version: 1,
    event_id: "provider-failure:session-1:llm_provider_failed",
    session_id: "session-1",
    type: "provider_failed",
    occurred_at: "2026-07-10T12:00:00.000Z",
    runtime_ref: { provider: "livekit", id: "interview-session-1" },
    failure: {
      reason: "provider_failure",
      code: "llm_provider_failed",
      retryable: false,
    },
  } as const;

  for (const leaked of [
    { ...valid, provider_payload: "raw-provider-payload" },
    {
      ...valid,
      runtime_ref: { ...valid.runtime_ref, provider_token: "secret-token" },
    },
    {
      ...valid,
      failure: { ...valid.failure, raw_error: "provider stack and secret" },
    },
  ]) {
    assert.equal(parseInterviewRuntimeEvent(JSON.stringify(leaked)), null);
  }
});

test("provider failures accept only deployed runtimes and normalized codes", () => {
  const valid = {
    contract_version: 1,
    event_id: "provider-failure:session-1:llm_provider_failed",
    session_id: "session-1",
    type: "provider_failed",
    occurred_at: "2026-07-10T12:00:00.000Z",
    runtime_ref: { provider: "livekit", id: "interview-session-1" },
    failure: {
      reason: "provider_failure",
      code: "llm_provider_failed",
      retryable: false,
    },
  } as const;

  assert.equal(isInterviewRuntimeEvent(valid), true);
  assert.equal(
    isInterviewRuntimeEvent({
      ...valid,
      runtime_ref: { ...valid.runtime_ref, provider: "invented-runtime" },
    }),
    false
  );
  assert.equal(
    isInterviewRuntimeEvent({
      ...valid,
      failure: { ...valid.failure, code: "plausible_but_unknown" },
    }),
    false
  );
});
