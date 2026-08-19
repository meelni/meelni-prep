import {
  parseInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
  type DifficultyLevel,
  type HintMode,
  type InterviewMode,
  type QuestionPreference,
  type RoundType,
} from "@meelni/core";
import {
  isInterviewBriefV2,
  hasNonIntegerJsonNumberToken,
  resolveOptionalInterviewBriefV2,
  type InterviewBriefV2,
} from "./interviewer-contracts";

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
  candidate_identity?: string;
  transcript_ingest_url: string;
  deadline_at: string | null;
  round_type: RoundType;
  mode?: InterviewMode;
  config: InterviewRuntimeConfig;
  question: InterviewRoomQuestion | null;
  interview_brief?: InterviewBriefV2;
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
      | "missing_candidate_identity"
      | "invalid_transcript_ingest_url"
      | "invalid_deadline"
      | "invalid_round_type"
      | "invalid_interview_brief"
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
    // Full mock interviews preserve interview conditions. Legacy non-off
    // values remain accepted at the transport boundary but normalize to off.
    hintMode: DEFAULT_INTERVIEW_RUNTIME_CONFIG.hintMode,
    questionPreference: normalizeQuestionPreference(source.questionPreference),
  };
}

export function resolveInterviewRuntimeConfig(
  preferences: InterviewClientPreferences,
  settings: InterviewRuntimeSettings = DEFAULT_INTERVIEW_RUNTIME_SETTINGS
): InterviewRuntimeConfig {
  return {
    ...preferences,
    ...settings,
    feedback_mode: DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
  };
}

export function interviewRuntimeSettingsFromEnv(
  env: Record<string, string | undefined>
): InterviewRuntimeSettings {
  return {
    ...DEFAULT_INTERVIEW_RUNTIME_SETTINGS,
    voice: envString(
      env.MEELNI_INTERVIEW_VOICE,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.voice
    ),
    speed: envNumber(
      env.MEELNI_INTERVIEW_TTS_SPEED,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.speed,
      0.6,
      1.5
    ),
    emotion: envString(
      env.MEELNI_INTERVIEW_TTS_EMOTION,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.emotion
    ),
    volume: envNumber(
      env.MEELNI_INTERVIEW_TTS_VOLUME,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.volume,
      0.5,
      2
    ),
    stt_model: envString(
      env.MEELNI_INTERVIEW_STT_MODEL,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.stt_model
    ),
    llm_model: envString(
      env.MEELNI_INTERVIEW_LLM_MODEL,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.llm_model
    ),
    tts_model: envString(
      env.MEELNI_INTERVIEW_TTS_MODEL,
      DEFAULT_INTERVIEW_RUNTIME_SETTINGS.tts_model
    ),
  };
}

export function buildInterviewRoomMetadata(
  metadata: InterviewRoomMetadataInput
): InterviewRoomMetadata {
  if (!isNonEmptyString(metadata.session_id)) {
    throw new InterviewRoomMetadataError("missing_session_id");
  }
  if (
    metadata.candidate_identity !== undefined &&
    !isNonEmptyString(metadata.candidate_identity)
  ) {
    throw new InterviewRoomMetadataError("missing_candidate_identity");
  }

  const transcriptIngestUrl = normalizeTranscriptIngestUrl(
    metadata.transcript_ingest_url
  );

  const normalizedQuestion = metadata.question
    ? normalizeQuestion(metadata.question)
    : null;
  const normalizedDeadline = normalizeDeadlineAt(metadata.deadline_at);
  const normalizedConfig = {
    ...metadata.config,
    feedback_mode: DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
  };
  const interviewBrief = metadata.interview_brief;
  if (
    interviewBrief !== undefined &&
    (!isInterviewBriefV2(interviewBrief) ||
      !isInterviewBriefCompatibleWithRoom(interviewBrief, {
        session_id: metadata.session_id,
        deadline_at: normalizedDeadline,
        round_type: metadata.round_type,
        config: normalizedConfig,
        question: normalizedQuestion,
      }))
  ) {
    throw new InterviewRoomMetadataError("invalid_interview_brief");
  }

  return {
    ...metadata,
    contract_version: INTERVIEW_ROOM_METADATA_CONTRACT_VERSION,
    session_id: metadata.session_id,
    candidate_identity: metadata.candidate_identity?.trim(),
    transcript_ingest_url: transcriptIngestUrl,
    deadline_at: normalizedDeadline,
    config: normalizedConfig,
    question: normalizedQuestion,
    ...(interviewBrief ? { interview_brief: interviewBrief } : {}),
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
  if (
    "candidate_identity" in parsed &&
    !isNonEmptyString(parsed.candidate_identity)
  ) {
    throw new InterviewRoomMetadataError("missing_candidate_identity");
  }
  if (!isRoundType(parsed.round_type)) {
    throw new InterviewRoomMetadataError("invalid_round_type");
  }

  const normalizedDeadline = normalizeDeadlineAt(parsed.deadline_at);
  const normalizedConfig = normalizeInterviewRuntimeConfig(
    isRecord(parsed.config) ? parsed.config : undefined
  );
  const normalizedQuestion = isRecord(parsed.question)
    ? normalizeQuestion(parsed.question)
    : null;
  const briefResolution = hasNonCanonicalBriefNumber(rawMetadata)
    ? { mode: "room_metadata_v1" as const, reason: "invalid_payload" as const }
    : resolveOptionalInterviewBriefV2(parsed.interview_brief);
  const interviewBrief =
    briefResolution.mode === "brief_v2" &&
    isInterviewBriefCompatibleWithRoom(briefResolution.brief, {
      session_id: parsed.session_id,
      deadline_at: normalizedDeadline,
      round_type: parsed.round_type,
      config: normalizedConfig,
      question: normalizedQuestion,
    })
      ? briefResolution.brief
      : undefined;

  return buildInterviewRoomMetadata({
    contract_version: INTERVIEW_ROOM_METADATA_CONTRACT_VERSION,
    session_id: parsed.session_id,
    candidate_identity: isNonEmptyString(parsed.candidate_identity)
      ? parsed.candidate_identity
      : undefined,
    transcript_ingest_url: normalizeTranscriptIngestUrl(
      parsed.transcript_ingest_url
    ),
    deadline_at: normalizedDeadline,
    round_type: parsed.round_type,
    mode:
      parsed.mode === "text" || parsed.mode === "voice_video"
        ? parsed.mode
        : undefined,
    config: normalizedConfig,
    question: normalizedQuestion,
    ...(interviewBrief ? { interview_brief: interviewBrief } : {}),
  });
}

function hasNonCanonicalBriefNumber(rawMetadata: string): boolean {
  const rawBrief = extractRawTopLevelJsonProperty(
    rawMetadata,
    "interview_brief"
  );
  return (
    rawBrief.status === "duplicate" ||
    (rawBrief.status === "unique" &&
      hasNonIntegerJsonNumberToken(rawBrief.value))
  );
}

function extractRawTopLevelJsonProperty(
  raw: string,
  propertyName: string
):
  | { status: "absent" }
  | { status: "duplicate" }
  | { status: "unique"; value: string } {
  let cursor = 0;
  while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
  if (raw[cursor] !== "{") return { status: "absent" };
  cursor += 1;
  let value: string | null = null;
  let matches = 0;

  while (cursor < raw.length) {
    while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] === "}") break;
    if (raw[cursor] !== '"') return { status: "absent" };
    const keyEnd = findJsonStringEnd(raw, cursor);
    if (keyEnd === null) return { status: "absent" };
    let key: unknown;
    try {
      key = JSON.parse(raw.slice(cursor, keyEnd + 1));
    } catch {
      return { status: "absent" };
    }
    cursor = keyEnd + 1;
    while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] !== ":") return { status: "absent" };
    cursor += 1;
    while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
    const valueEnd = findJsonValueEnd(raw, cursor);
    if (valueEnd === null) return { status: "absent" };
    if (key === propertyName) {
      matches += 1;
      value = raw.slice(cursor, valueEnd);
    }
    cursor = valueEnd;
    while (/\s/u.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] === ",") {
      cursor += 1;
      continue;
    }
    if (raw[cursor] === "}") break;
    return { status: "absent" };
  }

  if (matches === 0) return { status: "absent" };
  if (matches > 1 || value === null) return { status: "duplicate" };
  return { status: "unique", value };
}

function findJsonStringEnd(raw: string, start: number): number | null {
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index;
  }
  return null;
}

function findJsonValueEnd(raw: string, start: number): number | null {
  if (raw[start] === '"') {
    const end = findJsonStringEnd(raw, start);
    return end === null ? null : end + 1;
  }
  if (raw[start] !== "{" && raw[start] !== "[") {
    const match = raw.slice(start).match(/^[^,}\]]+/u);
    return match ? start + match[0].trimEnd().length : null;
  }
  const stack = [raw[start]];
  let inString = false;
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      stack.pop();
      if (stack.length === 0) return index + 1;
    }
  }
  return null;
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
    // Full mock interviews defer every evaluation to the post-interview flow.
    // Legacy real_time and silent snapshots remain readable but normalize to
    // the same canonical behavior as the Python runtime.
    feedback_mode: DEFAULT_INTERVIEW_RUNTIME_CONFIG.feedback_mode,
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

function isInterviewBriefCompatibleWithRoom(
  brief: InterviewBriefV2,
  room: Pick<
    InterviewRoomMetadata,
    "session_id" | "deadline_at" | "round_type" | "config" | "question"
  >
): boolean {
  return (
    room.deadline_at !== null &&
    room.question !== null &&
    brief.session_id === room.session_id &&
    brief.deadline_at === room.deadline_at &&
    brief.round_type === room.round_type &&
    brief.difficulty === room.config.difficulty &&
    brief.duration_minutes === room.config.duration &&
    brief.selected_question.id === room.question.id &&
    brief.selected_question.text === room.question.text &&
    brief.selected_question.company === room.question.company &&
    brief.selected_question.type === room.question.type
  );
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

function normalizeTranscriptIngestUrl(value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new InterviewRoomMetadataError("invalid_transcript_ingest_url");
  }
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.pathname !== "/api/internal/transcript" ||
      url.search ||
      url.hash
    ) {
      throw new Error("invalid runtime transcript URL");
    }
    return url.toString();
  } catch {
    throw new InterviewRoomMetadataError("invalid_transcript_ingest_url");
  }
}

function isRoundType(value: unknown): value is RoundType {
  return (
    value === "behavioral" ||
    value === "product_sense" ||
    value === "execution" ||
    value === "strategy"
  );
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

const DECIMAL_NUMBER_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function envString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function envNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const trimmed = value?.trim();
  if (!trimmed || !DECIMAL_NUMBER_PATTERN.test(trimmed)) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
