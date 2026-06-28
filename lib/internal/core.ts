export const ROUND_TYPES = {
  behavioral: {
    label: "Behavioral",
    description: "Leadership & teamwork using STAR method",
    subtitle: "Demonstrate influence, resilience, and team leadership",
    icon: "Users",
    color: "from-blue-500 to-cyan-500",
  },
  product_sense: {
    label: "Product Sense",
    description: "Design thinking & product strategy",
    subtitle: "Design solutions and prioritize features for user problems",
    icon: "Lightbulb",
    color: "from-purple-500 to-pink-500",
  },
  execution: {
    label: "Execution",
    description: "Metrics, roadmapping & technical execution",
    subtitle: "Define metrics and analyze data to drive decisions",
    icon: "Target",
    color: "from-orange-500 to-red-500",
  },
  strategy: {
    label: "Strategy",
    description: "Business thinking & market analysis",
    subtitle: "Think long-term about market positioning and competitive advantage",
    icon: "TrendingUp",
    color: "from-green-500 to-emerald-500",
  },
} as const;

export type RoundType = keyof typeof ROUND_TYPES;

export const ALL_INTERVIEW_TYPES = [
  "product_sense",
  "behavioral",
  "execution",
  "strategy",
] as const satisfies readonly RoundType[];

export const DIFFICULTY_LEVELS = {
  beginner: {
    label: "Junior/APM",
    description: "0-2 years experience",
    subtitle: "Patient coaching with learning mode",
    icon: "Sprout",
  },
  intermediate: {
    label: "IC PM",
    description: "2-4 years experience",
    subtitle: "Balanced approach with standard bar",
    icon: "Zap",
  },
  advanced: {
    label: "Senior PM",
    description: "5+ years experience",
    subtitle: "High bar with strategic deep-dives",
    icon: "Trophy",
  },
} as const;

export type DifficultyLevel = keyof typeof DIFFICULTY_LEVELS;

export interface QuestionPreference {
  recency: "all" | "recent" | "very_recent";
  recentDays?: number;
}

export interface MinimalInterviewConfig {
  roundType: RoundType;
  difficulty: DifficultyLevel;
}

export interface InterviewConfig extends MinimalInterviewConfig {
  voice: string;
  speed: number;
  emotion: string;
  volume: number;
  duration: number;
  feedback_mode: "real_time" | "end_only" | "silent";
  questionPreference: QuestionPreference;
  stt_model: string;
  llm_model: string;
  tts_model: string;
}

export const SYSTEM_DEFAULTS = {
  voice: "cgSgspJ2msm6clMCkdW9",
  speed: 1.0,
  emotion: "professional",
  volume: 1.0,
  feedback_mode: "end_only" as const,
  questionPreference: {
    recency: "very_recent" as const,
    recentDays: 365,
  },
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
};

export const SMART_DURATION = {
  behavioral: 30,
  product_sense: 45,
  execution: 45,
  strategy: 45,
} as const satisfies Record<RoundType, 30 | 45>;

export const DEFAULT_CONFIG: InterviewConfig = {
  roundType: "product_sense",
  difficulty: "intermediate",
  ...SYSTEM_DEFAULTS,
  duration: SMART_DURATION.product_sense,
};

export const INTERVIEW_TYPE_LABELS: Record<RoundType, string> = {
  product_sense: "Product Sense",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

export function buildFullConfig(userConfig: MinimalInterviewConfig): InterviewConfig {
  return {
    ...userConfig,
    ...SYSTEM_DEFAULTS,
    duration: SMART_DURATION[userConfig.roundType],
  };
}

export function getDefaultDuration(roundType: RoundType): number {
  return SMART_DURATION[roundType];
}

export function getRecentDays(recency: "very_recent" | "recent" | "all"): number | undefined {
  switch (recency) {
    case "very_recent":
      return 365;
    case "recent":
      return 730;
    case "all":
      return undefined;
  }
}

export function isValidRoundType(value: string): value is RoundType {
  return (ALL_INTERVIEW_TYPES as readonly string[]).includes(value);
}

export type SubscriptionTier = "free" | "pro" | "premium";

const TIER_PERMISSIONS: Record<SubscriptionTier, readonly RoundType[] | "all"> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all",
};

export function canAccessInterviewType(
  tier: SubscriptionTier,
  roundType: RoundType
): boolean {
  const permissions = TIER_PERMISSIONS[tier];
  return permissions === "all" ? true : permissions.includes(roundType);
}

export function getAllowedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];
  return permissions === "all" ? [...ALL_INTERVIEW_TYPES] : [...permissions];
}

export function getLockedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter((type) => !allowed.includes(type));
}

export function getRequiredTier(roundType: RoundType): SubscriptionTier {
  return roundType === "product_sense" ? "free" : "pro";
}

export function getRequiredTierBadge(roundType: RoundType): string {
  const tier = getRequiredTier(roundType);
  return tier === "free" ? "" : tier.charAt(0).toUpperCase() + tier.slice(1);
}

export type FeedbackDimension =
  | "structure"
  | "clarity"
  | "insight"
  | "communication"
  | "leadership";

export interface RubricScores {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
  overall: number;
}

export interface FeedbackItem {
  dimension: FeedbackDimension;
  text: string;
  evidence_quote?: string;
  example?: string;
}

export interface DrillSuggestion {
  title: string;
  description: string;
  tips: string[];
}

export interface EvaluationResponse {
  session_id: string;
  scores: RubricScores;
  strengths: FeedbackItem[];
  improvements: FeedbackItem[];
  drills: DrillSuggestion[];
  summary: string;
}

export const SCORE_WEIGHTS = {
  structure: 0.25,
  clarity: 0.2,
  insight: 0.25,
  communication: 0.15,
  leadership: 0.15,
} as const satisfies Record<FeedbackDimension, number>;

export function calculateOverallScore(scores: Omit<RubricScores, "overall">): number {
  const weighted =
    scores.structure * SCORE_WEIGHTS.structure +
    scores.clarity * SCORE_WEIGHTS.clarity +
    scores.insight * SCORE_WEIGHTS.insight +
    scores.communication * SCORE_WEIGHTS.communication +
    scores.leadership * SCORE_WEIGHTS.leadership;

  return Math.round(weighted * 10) / 10;
}

export function validateScores(scores: RubricScores): boolean {
  return (
    isScoreInRange(scores.structure) &&
    isScoreInRange(scores.clarity) &&
    isScoreInRange(scores.insight) &&
    isScoreInRange(scores.communication) &&
    isScoreInRange(scores.leadership) &&
    isScoreInRange(scores.overall)
  );
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(10, score));
}

function isScoreInRange(score: number): boolean {
  return score >= 0 && score <= 10;
}

export interface QuestionPracticePayload {
  questionId: string;
  questionText: string;
  company: string | null;
  questionType: string;
}

export type Speaker = "user" | "interviewer";
export type InterviewMode = "voice_video" | "text";
export type AgentState = "idle" | "listening" | "thinking" | "speaking";

export interface TranscriptTurn {
  id: string;
  sessionId: string;
  speaker: Speaker;
  startedAt: Date;
  endedAt: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export interface TranscriptTurnInput {
  sessionId: string;
  speaker: Speaker;
  startedAt?: Date;
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export interface SessionMetadata {
  id: string;
  userId: string;
  role: string;
  roundType: RoundType;
  mode: InterviewMode;
  persona?: string;
  livekitRoomName?: string;
  config?: SessionConfig;
  startedAt: Date;
  endedAt?: Date;
}

export interface SessionConfig {
  duration?: number;
  difficulty?: "easy" | "medium" | "hard";
  voice?: string;
  speed?: number;
  emotion?: string;
  volume?: number;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
  [key: string]: unknown;
}

export interface TranscriptSaveRequest {
  sessionId: string;
  speaker: Speaker;
  startedAt?: string;
  endedAt?: string;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export interface TranscriptBatchSaveRequest {
  sessionId: string;
  turns: Array<{
    speaker: Speaker;
    startedAt?: string;
    endedAt?: string;
    text?: string;
    audioMs?: number;
    latencyMs?: number;
    section?: string;
  }>;
}

export interface TranscriptSaveResponse {
  success: boolean;
  turn: TranscriptTurn;
}

export interface TranscriptBatchSaveResponse {
  success: boolean;
  turns: TranscriptTurn[];
}

export interface TranscriptSaveError {
  error: string;
  message?: string;
  attemptNumber?: number;
  willRetry?: boolean;
}

export interface TranscriptStats {
  totalTurns: number;
  userTurns: number;
  interviewerTurns: number;
  totalWords: number;
  userWords: number;
  averageLatency: number;
  totalDuration: number;
}

export interface QueuedTranscriptSave {
  id: string;
  turn: TranscriptTurnInput;
  attemptCount: number;
  lastAttempt: Date;
  error?: string;
}

export interface TranscriptSaveResult {
  success: boolean;
  turn?: TranscriptTurn;
  error?: string;
  attemptNumber?: number;
}
