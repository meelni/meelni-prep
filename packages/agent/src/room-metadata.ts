import type { InterviewMode, RoundType } from "@meelni/core";

export type InterviewFeedbackMode = "real_time" | "end_only" | "silent";

export interface InterviewRuntimeConfig {
  difficulty: string;
  voice: string;
  speed?: number;
  emotion?: string;
  volume?: number;
  duration: number;
  feedback_mode: InterviewFeedbackMode;
  persona?: string | null;
  stt_model: string;
  llm_model: string;
  tts_model: string;
  [key: string]: unknown;
}

export interface InterviewRoomQuestion {
  id: string;
  text: string;
  company: string | null;
  type: string;
  askedAt?: string | Date | null;
}

export interface InterviewRoomMetadata {
  session_id?: string;
  round_type: RoundType;
  mode?: InterviewMode;
  config: InterviewRuntimeConfig;
  question: InterviewRoomQuestion | null;
}

export const DEFAULT_INTERVIEW_RUNTIME_CONFIG: InterviewRuntimeConfig = {
  difficulty: "intermediate",
  voice: "cgSgspJ2msm6clMCkdW9",
  speed: 1.0,
  emotion: "professional",
  volume: 1.0,
  duration: 30,
  feedback_mode: "end_only",
  persona: null,
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
};

export function buildInterviewRoomMetadata(
  metadata: InterviewRoomMetadata
): InterviewRoomMetadata {
  return {
    ...metadata,
    config: normalizeRuntimeConfig(metadata.config),
    question: metadata.question ? normalizeQuestion(metadata.question) : null
  };
}

export function parseInterviewRoomMetadata(rawMetadata: string | null | undefined): InterviewRoomMetadata {
  if (!rawMetadata) {
    return getFallbackInterviewRoomMetadata();
  }

  try {
    const parsed = JSON.parse(rawMetadata) as Partial<InterviewRoomMetadata>;

    return buildInterviewRoomMetadata({
      session_id: typeof parsed.session_id === "string" ? parsed.session_id : undefined,
      round_type: isRoundType(parsed.round_type) ? parsed.round_type : "product_sense",
      mode: parsed.mode === "text" || parsed.mode === "voice_video" ? parsed.mode : undefined,
      config: normalizeRuntimeConfig(parsed.config),
      question: parsed.question ? normalizeQuestion(parsed.question) : null
    });
  } catch {
    return getFallbackInterviewRoomMetadata();
  }
}

export function getFallbackInterviewRoomMetadata(): InterviewRoomMetadata {
  return {
    round_type: "product_sense",
    question: null,
    config: { ...DEFAULT_INTERVIEW_RUNTIME_CONFIG }
  };
}

function normalizeRuntimeConfig(
  config: Partial<InterviewRuntimeConfig> | undefined
): InterviewRuntimeConfig {
  return {
    ...DEFAULT_INTERVIEW_RUNTIME_CONFIG,
    ...compactObject(config ?? {}),
    difficulty: stringOrDefault(config?.difficulty, DEFAULT_INTERVIEW_RUNTIME_CONFIG.difficulty),
    voice: stringOrDefault(config?.voice, DEFAULT_INTERVIEW_RUNTIME_CONFIG.voice),
    duration: numberOrDefault(config?.duration, DEFAULT_INTERVIEW_RUNTIME_CONFIG.duration),
    feedback_mode: isFeedbackMode(config?.feedback_mode)
      ? config.feedback_mode
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
    stt_model: stringOrDefault(config?.stt_model, DEFAULT_INTERVIEW_RUNTIME_CONFIG.stt_model),
    llm_model: stringOrDefault(config?.llm_model, DEFAULT_INTERVIEW_RUNTIME_CONFIG.llm_model),
    tts_model: stringOrDefault(config?.tts_model, DEFAULT_INTERVIEW_RUNTIME_CONFIG.tts_model)
  };
}

function normalizeQuestion(question: Partial<InterviewRoomQuestion>): InterviewRoomQuestion {
  return {
    id: stringOrDefault(question.id, ""),
    text: stringOrDefault(question.text, ""),
    company: typeof question.company === "string" ? question.company : null,
    type: stringOrDefault(question.type, ""),
    ...(question.askedAt === undefined ? {} : { askedAt: question.askedAt })
  };
}

function isRoundType(value: unknown): value is RoundType {
  return (
    value === "behavioral" ||
    value === "product_sense" ||
    value === "execution" ||
    value === "strategy"
  );
}

function isFeedbackMode(value: unknown): value is InterviewFeedbackMode {
  return value === "real_time" || value === "end_only" || value === "silent";
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}
