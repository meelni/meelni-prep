import type {
  DifficultyLevel,
  HintMode,
  InterviewMode,
  QuestionPreference,
  RoundType,
} from "@meelni/core";

export type InterviewFeedbackMode = "real_time" | "end_only" | "silent";

export const INTERVIEW_ROOM_METADATA_CONTRACT_VERSION = 1 as const;

export interface InterviewClientPreferences {
  difficulty: DifficultyLevel;
  duration: number;
  hintMode: HintMode;
  questionPreference: QuestionPreference;
}

export interface InterviewRuntimeSettings {
  voice: string;
  speed: number;
  emotion: string;
  volume: number;
  feedback_mode: InterviewFeedbackMode;
  persona?: string | null;
  stt_model: string;
  llm_model: string;
  tts_model: string;
}

export interface InterviewRuntimeConfig
  extends InterviewClientPreferences,
    InterviewRuntimeSettings {}

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
  round_type: RoundType;
  mode?: InterviewMode;
  config: InterviewRuntimeConfig;
  question: InterviewRoomQuestion | null;
}

export type InterviewRoomMetadataInput = Omit<
  InterviewRoomMetadata,
  "contract_version"
> & {
  contract_version?: typeof INTERVIEW_ROOM_METADATA_CONTRACT_VERSION;
};

export class InterviewRoomMetadataError extends Error {
  constructor(
    public readonly code:
      | "missing_metadata"
      | "invalid_json"
      | "unsupported_contract"
      | "missing_session_id"
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
  questionPreference: { recency: "very_recent", recentDays: 365 },
  persona: null,
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
};

export const DEFAULT_INTERVIEW_RUNTIME_SETTINGS: InterviewRuntimeSettings = {
  voice: DEFAULT_INTERVIEW_RUNTIME_CONFIG.voice,
  speed: DEFAULT_INTERVIEW_RUNTIME_CONFIG.speed,
  emotion: DEFAULT_INTERVIEW_RUNTIME_CONFIG.emotion,
  volume: DEFAULT_INTERVIEW_RUNTIME_CONFIG.volume,
  feedback_mode: DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
  persona: DEFAULT_INTERVIEW_RUNTIME_CONFIG.persona,
  stt_model: DEFAULT_INTERVIEW_RUNTIME_CONFIG.stt_model,
  llm_model: DEFAULT_INTERVIEW_RUNTIME_CONFIG.llm_model,
  tts_model: DEFAULT_INTERVIEW_RUNTIME_CONFIG.tts_model,
};

export function normalizeInterviewClientPreferences(
  config: unknown
): InterviewClientPreferences {
  const source = isRecord(config) ? config : {};
  return {
    difficulty: isDifficulty(source.difficulty)
      ? source.difficulty
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.difficulty,
    duration: isDuration(source.duration)
      ? source.duration
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.duration,
    hintMode: isHintMode(source.hintMode)
      ? source.hintMode
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.hintMode,
    questionPreference: normalizeQuestionPreference(source.questionPreference),
  };
}

export function resolveInterviewRuntimeConfig(
  preferences: InterviewClientPreferences,
  settings: InterviewRuntimeSettings = DEFAULT_INTERVIEW_RUNTIME_SETTINGS
): InterviewRuntimeConfig {
  return { ...preferences, ...settings };
}

export function interviewRuntimeSettingsFromEnv(
  env: Record<string, string | undefined>
): InterviewRuntimeSettings {
  return {
    ...DEFAULT_INTERVIEW_RUNTIME_SETTINGS,
    voice:
      env.MEELNI_INTERVIEW_VOICE || DEFAULT_INTERVIEW_RUNTIME_SETTINGS.voice,
    speed: envNumber(
      env.MEELNI_INTERVIEW_TTS_SPEED,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.speed
    ),
    emotion:
      env.MEELNI_INTERVIEW_TTS_EMOTION ||
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.emotion,
    volume: envNumber(
      env.MEELNI_INTERVIEW_TTS_VOLUME,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.volume
    ),
    stt_model:
      env.MEELNI_INTERVIEW_STT_MODEL ||
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.stt_model,
    llm_model:
      env.MEELNI_INTERVIEW_LLM_MODEL ||
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.llm_model,
    tts_model:
      env.MEELNI_INTERVIEW_TTS_MODEL ||
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.tts_model,
  };
}

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
  const preferences = normalizeInterviewClientPreferences(config);
  return resolveInterviewRuntimeConfig(preferences, {
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
    feedback_mode: isFeedbackMode(config?.feedback_mode)
      ? config.feedback_mode
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
    persona:
      typeof config?.persona === "string" || config?.persona === null
        ? config.persona
        : DEFAULT_INTERVIEW_RUNTIME_CONFIG.persona,
    stt_model: stringOrDefault(
      config?.stt_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.stt_model
    ),
    llm_model: stringOrDefault(
      config?.llm_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.llm_model
    ),
    tts_model: stringOrDefault(
      config?.tts_model,
      DEFAULT_INTERVIEW_RUNTIME_CONFIG.tts_model
    ),
  });
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

function isDifficulty(value: unknown): value is DifficultyLevel {
  return (
    value === "beginner" || value === "intermediate" || value === "advanced"
  );
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && [15, 30, 45].includes(value);
}

function normalizeQuestionPreference(value: unknown): QuestionPreference {
  if (!isRecord(value)) {
    return { ...DEFAULT_INTERVIEW_RUNTIME_CONFIG.questionPreference };
  }
  const recency =
    value.recency === "all" ||
    value.recency === "recent" ||
    value.recency === "very_recent"
      ? value.recency
      : DEFAULT_INTERVIEW_RUNTIME_CONFIG.questionPreference.recency;
  const recentDays =
    typeof value.recentDays === "number" &&
    Number.isInteger(value.recentDays) &&
    value.recentDays > 0 &&
    value.recentDays <= 3650
      ? value.recentDays
      : undefined;
  return { recency, ...(recentDays ? { recentDays } : {}) };
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
