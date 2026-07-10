import {
  normalizeInterviewDurationMinutes,
  parseInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
  type HintMode,
  type InterviewMode,
  type RoundType,
} from "@meelni/core";

export type InterviewFeedbackMode = "real_time" | "end_only" | "silent";

export const INTERVIEW_ROOM_METADATA_CONTRACT_VERSION = 1 as const;

export interface InterviewRuntimeConfig {
  difficulty: string;
  voice: string;
  speed?: number;
  emotion?: string;
  volume?: number;
  duration: number;
  feedback_mode: InterviewFeedbackMode;
  hintMode: HintMode;
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
  contract_version: typeof INTERVIEW_ROOM_METADATA_CONTRACT_VERSION;
  session_id: string;
  deadline_at: string | null;
  round_type: RoundType;
  mode?: InterviewMode;
  config: InterviewRuntimeConfig;
  question: InterviewRoomQuestion | null;
}

export type InterviewRoomMetadataInput = Omit<
  InterviewRoomMetadata,
  "contract_version" | "deadline_at"
> & {
  contract_version?: typeof INTERVIEW_ROOM_METADATA_CONTRACT_VERSION;
  deadline_at?: string | Date | null;
};

export class InterviewRoomMetadataError extends Error {
  constructor(
    public readonly code:
      | "missing_metadata"
      | "invalid_json"
      | "unsupported_contract"
      | "missing_session_id"
      | "invalid_deadline"
      | "invalid_round_type"
  ) {
    super(`Invalid interview room metadata: ${code}`);
    this.name = "InterviewRoomMetadataError";
  }
}

export const DEFAULT_INTERVIEW_RUNTIME_CONFIG: InterviewRuntimeConfig = {
  difficulty: "intermediate",
  voice: "cgSgspJ2msm6clMCkdW9",
  speed: 1.0,
  emotion: "professional",
  volume: 1.0,
  duration: 30,
  feedback_mode: "end_only",
  hintMode: "off",
  persona: null,
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
};

const ALLOWED_RUNTIME_MODELS = {
  stt_model: [DEFAULT_INTERVIEW_RUNTIME_CONFIG.stt_model],
  llm_model: [DEFAULT_INTERVIEW_RUNTIME_CONFIG.llm_model],
  tts_model: [
    DEFAULT_INTERVIEW_RUNTIME_CONFIG.tts_model,
    "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
  ],
} as const;

export function buildInterviewRoomMetadata(
  metadata: InterviewRoomMetadataInput
): InterviewRoomMetadata {
  if (!isNonEmptyString(metadata.session_id)) {
    throw new InterviewRoomMetadataError("missing_session_id");
  }

  return {
    ...metadata,
    contract_version: INTERVIEW_ROOM_METADATA_CONTRACT_VERSION,
    session_id: metadata.session_id,
    deadline_at: normalizeDeadlineAt(metadata.deadline_at),
    config: metadata.config,
    question: metadata.question ? normalizeQuestion(metadata.question) : null,
  };
}

export function parseInterviewRoomMetadata(
  rawMetadata: string | null | undefined
): InterviewRoomMetadata {
  if (!rawMetadata) {
    throw new InterviewRoomMetadataError("missing_metadata");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMetadata);
  } catch {
    throw new InterviewRoomMetadataError("invalid_json");
  }

  if (!isRecord(parsed)) {
    throw new InterviewRoomMetadataError("invalid_json");
  }
  if (parsed.contract_version !== INTERVIEW_ROOM_METADATA_CONTRACT_VERSION) {
    throw new InterviewRoomMetadataError("unsupported_contract");
  }
  if (!isNonEmptyString(parsed.session_id)) {
    throw new InterviewRoomMetadataError("missing_session_id");
  }
  if (!isRoundType(parsed.round_type)) {
    throw new InterviewRoomMetadataError("invalid_round_type");
  }

  return buildInterviewRoomMetadata({
    contract_version: INTERVIEW_ROOM_METADATA_CONTRACT_VERSION,
    session_id: parsed.session_id,
    deadline_at: normalizeDeadlineAt(parsed.deadline_at),
    round_type: parsed.round_type,
    mode:
      parsed.mode === "text" || parsed.mode === "voice_video"
        ? parsed.mode
        : undefined,
    config: normalizeInterviewRuntimeConfig(
      isRecord(parsed.config) ? parsed.config : undefined
    ),
    question: isRecord(parsed.question)
      ? normalizeQuestion(parsed.question)
      : null,
  });
}

export function normalizeInterviewRuntimeConfig(
  config: Partial<InterviewRuntimeConfig> | undefined
): InterviewRuntimeConfig {
  return {
    ...DEFAULT_INTERVIEW_RUNTIME_CONFIG,
    ...compactObject(config ?? {}),
    difficulty: stringOrDefault(
      config?.difficulty,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.difficulty
    ),
    voice: stringOrDefault(
      config?.voice,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.voice
    ),
    speed: numberOrDefault(
      config?.speed,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.speed!
    ),
    emotion: stringOrDefault(
      config?.emotion,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.emotion!
    ),
    volume: numberOrDefault(
      config?.volume,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.volume!
    ),
    duration: normalizeInterviewDurationMinutes(config?.duration),
    feedback_mode: isFeedbackMode(config?.feedback_mode)
      ? config.feedback_mode
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
    hintMode: isHintMode(config?.hintMode)
      ? config.hintMode
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.hintMode,
    persona:
      typeof config?.persona === "string" || config?.persona === null
        ? config.persona
        : DEFAULT_INTERVIEW_RUNTIME_CONFIG.persona,
    stt_model: modelOrDefault(
      config?.stt_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.stt_model,
      ALLOWED_RUNTIME_MODELS.stt_model
    ),
    llm_model: modelOrDefault(
      config?.llm_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.llm_model,
      ALLOWED_RUNTIME_MODELS.llm_model
    ),
    tts_model: modelOrDefault(
      config?.tts_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.tts_model,
      ALLOWED_RUNTIME_MODELS.tts_model
    ),
  };
}

function normalizeQuestion(
  question: Partial<InterviewRoomQuestion>
): InterviewRoomQuestion {
  return {
    id: stringOrDefault(question.id, ""),
    text: stringOrDefault(question.text, ""),
    company: typeof question.company === "string" ? question.company : null,
    type: stringOrDefault(question.type, ""),
    ...(typeof question.askedAt === "string" || question.askedAt === null
      ? { askedAt: question.askedAt }
      : question.askedAt instanceof Date &&
          Number.isFinite(question.askedAt.getTime())
        ? { askedAt: question.askedAt.toISOString() }
        : {}),
  };
}

function normalizeDeadlineAt(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  try {
    if (value instanceof Date) {
      return serializeInterviewDeadlineAt(value);
    }
    const parsed = parseInterviewDeadlineAt(value);
    if (parsed) return serializeInterviewDeadlineAt(parsed);
  } catch {
    // Map every boundary failure to the stable metadata error below.
  }

  throw new InterviewRoomMetadataError("invalid_deadline");
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

function isHintMode(value: unknown): value is HintMode {
  return value === "off" || value === "gentle" || value === "coach";
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function modelOrDefault(
  value: unknown,
  fallback: string,
  allowedValues: readonly string[]
): string {
  const candidate = stringOrDefault(value, fallback);
  return allowedValues.includes(candidate) ? candidate : fallback;
}

function compactObject<T extends Record<string, unknown>>(
  value: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as Partial<T>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
