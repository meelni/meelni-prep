/**
 * Public entrypoint for reusable test fixtures.
 */
import type { InterviewRoomMetadata, TranscriptEvent } from "@meelni/agent";
import type {
  EvaluationResponse,
  QuestionPracticePayload,
  SessionMetadata,
  TranscriptTurnInput,
} from "@meelni/core";
import type {
  StartInterviewRoomInput,
  StartedInterviewRoom,
} from "@meelni/integrations";

export * from "./session-lifecycle";
export * from "./dashboard-progress";
export * from "./account-privacy";
export * from "./feedback-v2";
export * from "./drill-recommendation";
export * from "./focused-practice-plan";
export * from "./focused-practice-attempt";
export * from "./evaluation-validation";
export * from "./feedback-generation";
export * from "./evaluation-calibration";
export * from "./answer-blocks";
export * from "./dimension-coverage-calibration";
export * from "./feedback-review-outcomes";
export * from "./runtime-settlement-command";

export const FIXTURE_CLOCK = {
  startedAt: new Date("2026-06-27T17:30:00.000Z"),
  firstUserTurnAt: new Date("2026-06-27T17:31:00.000Z"),
  endedAt: new Date("2026-06-27T18:15:00.000Z"),
} as const;

export interface ProductSenseInterviewFixture {
  session: SessionMetadata;
  question: QuestionPracticePayload;
  transcript: TranscriptTurnInput[];
  roomMetadata: InterviewRoomMetadata;
  feedback: EvaluationResponse;
}

export interface LiveKitStartFixture {
  input: Omit<StartInterviewRoomInput, "metadata"> & {
    metadata: InterviewRoomMetadata;
  };
  transcriptEvent: TranscriptEvent;
  expectedStartedRoom: StartedInterviewRoom;
}

const productSenseInterviewFixture: ProductSenseInterviewFixture = {
  session: {
    id: "fixture-session-product-sense-1",
    userId: "fixture-user-1",
    role: "product_manager",
    roundType: "product_sense",
    mode: "voice_video",
    persona: "senior-meta-pm",
    livekitRoomName: "interview-1782600000000-i00000",
    runtimeRef: {
      provider: "livekit",
      id: "interview-1782600000000-i00000",
    },
    config: {
      difficulty: "medium",
      duration: 45,
      voice: "cgSgspJ2msm6clMCkdW9",
      sttModel: "deepgram/nova-3",
      llmModel: "openai/gpt-4.1-mini",
      ttsModel: "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
    },
    startedAt: FIXTURE_CLOCK.startedAt,
    activatedAt: FIXTURE_CLOCK.startedAt,
    endingAt: new Date("2026-06-27T18:14:58.000Z"),
    lifecycleState: "completed",
    lifecycleVersion: 5,
    terminalReason: "user_end",
    lastTransitionAt: FIXTURE_CLOCK.endedAt,
    endedAt: FIXTURE_CLOCK.endedAt,
  },
  question: {
    questionId: "fixture-question-product-sense-1",
    questionText: "Design a product to help Meta users learn new skills.",
    company: "Meta",
    questionType: "Product Sense",
  },
  transcript: [
    {
      sessionId: "fixture-session-product-sense-1",
      speaker: "interviewer",
      startedAt: FIXTURE_CLOCK.startedAt,
      endedAt: new Date("2026-06-27T17:30:08.000Z"),
      text: "Let's start with the product goal. Design a product to help Meta users learn new skills.",
      audioMs: 8000,
      section: "prompt",
    },
    {
      sessionId: "fixture-session-product-sense-1",
      speaker: "user",
      startedAt: FIXTURE_CLOCK.firstUserTurnAt,
      endedAt: new Date("2026-06-27T17:32:10.000Z"),
      text: "I would clarify whether we want to increase learning frequency, completion, or social sharing, then choose working adults as the first segment.",
      audioMs: 70000,
      latencyMs: 1800,
      section: "clarifying_questions",
    },
    {
      sessionId: "fixture-session-product-sense-1",
      speaker: "interviewer",
      startedAt: new Date("2026-06-27T17:32:12.000Z"),
      endedAt: new Date("2026-06-27T17:32:24.000Z"),
      text: "Good. Pick one segment and walk me through the core user problem.",
      audioMs: 12000,
      section: "follow_up",
    },
    {
      sessionId: "fixture-session-product-sense-1",
      speaker: "user",
      startedAt: new Date("2026-06-27T17:32:26.000Z"),
      endedAt: new Date("2026-06-27T17:34:06.000Z"),
      text: "For working adults, the pain is not access to content. It is knowing what to learn next, staying accountable, and converting small gaps of time into visible progress.",
      audioMs: 100000,
      latencyMs: 1300,
      section: "user_problem",
    },
  ],
  roomMetadata: {
    contract_version: 1,
    session_id: "fixture-session-product-sense-1",
    candidate_identity: "fixture-user-1",
    transcript_ingest_url:
      "https://fixture.meelni.test/api/internal/transcript",
    deadline_at: FIXTURE_CLOCK.endedAt.toISOString(),
    round_type: "product_sense",
    mode: "voice_video",
    question: {
      id: "fixture-question-product-sense-1",
      text: "Design a product to help Meta users learn new skills.",
      company: "Meta",
      type: "Product Sense",
      askedAt: FIXTURE_CLOCK.startedAt.toISOString(),
    },
    config: {
      difficulty: "intermediate",
      voice: "cgSgspJ2msm6clMCkdW9",
      speed: 1,
      emotion: "professional",
      volume: 1,
      duration: 45,
      feedback_mode: "end_only",
      hintMode: "off",
      questionPreference: { recency: "very_recent", recentDays: 365 },
      stt_model: "deepgram/nova-3",
      llm_model: "openai/gpt-4.1-mini",
      tts_model: "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
    },
  },
  feedback: {
    session_id: "fixture-session-product-sense-1",
    scores: {
      structure: 8,
      clarity: 8,
      insight: 9,
      communication: 7,
      leadership: 7,
      overall: 8,
    },
    strengths: [
      {
        dimension: "insight",
        text: "Identifies a concrete user problem beyond content access.",
        evidence_quote: "the pain is not access to content",
      },
    ],
    improvements: [
      {
        dimension: "structure",
        text: "State the north-star metric before comparing solution paths.",
      },
    ],
    drills: [
      {
        title: "Metric-first framing",
        description:
          "Practice naming the target behavior and metric before ideating.",
        tips: [
          "Define the audience",
          "Name the behavior",
          "Select one measurable outcome",
        ],
      },
    ],
    summary: "Strong product-sense opening with a clear segment and user pain.",
  },
};

const liveKitStartFixture: LiveKitStartFixture = {
  input: {
    agentName: "agent-product-sense-fixture",
    identity: "fixture-user-1",
    participantName: "savi@example.com",
    roomName: "interview-1782600000000-i00000",
    metadata: productSenseInterviewFixture.roomMetadata,
    env: {
      apiKey: "fixture-livekit-key",
      apiSecret: "fixture-livekit-secret",
      url: "wss://fixture.livekit.cloud",
    },
  },
  transcriptEvent: {
    contract_version: 2,
    event_id: "transcript-event-1",
    writer_id: "writer-fixture-1",
    writer_generation: 1,
    sequence: 1,
    session_id: "fixture-session-product-sense-1",
    room_name: "interview-1782600000000-i00000",
    speaker: "interviewer",
    text: "Let's start with the product goal.",
    is_final: true,
    started_at: "2026-06-27T17:30:00.000Z",
    ended_at: "2026-06-27T17:30:08.000Z",
    audio_duration_ms: 8000,
    section: "prompt",
    delivery_state: "delivered",
  },
  expectedStartedRoom: {
    roomName: "interview-1782600000000-i00000",
    token: "fixture-livekit-token",
    url: "wss://fixture.livekit.cloud",
  },
};

export function createProductSenseInterviewFixture(): ProductSenseInterviewFixture {
  return structuredClone(productSenseInterviewFixture);
}

export function createLiveKitStartFixture(): LiveKitStartFixture {
  return structuredClone(liveKitStartFixture);
}
