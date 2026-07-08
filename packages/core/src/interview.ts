import type { HintMode } from "./session";

export const ROUND_TYPES = {
  behavioral: {
    label: "Behavioral",
    description: "Leadership & teamwork using STAR method",
    subtitle: "Demonstrate influence, resilience, and team leadership",
    icon: "Users",
    color: "from-blue-500 to-cyan-500"
  },
  product_sense: {
    label: "Product Sense",
    description: "Design thinking & product strategy",
    subtitle: "Design solutions and prioritize features for user problems",
    icon: "Lightbulb",
    color: "from-purple-500 to-pink-500"
  },
  execution: {
    label: "Execution",
    description: "Metrics, roadmapping & technical execution",
    subtitle: "Define metrics and analyze data to drive decisions",
    icon: "Target",
    color: "from-orange-500 to-red-500"
  },
  strategy: {
    label: "Strategy",
    description: "Business thinking & market analysis",
    subtitle: "Think long-term about market positioning and competitive advantage",
    icon: "TrendingUp",
    color: "from-green-500 to-emerald-500"
  }
} as const;

export type RoundType = keyof typeof ROUND_TYPES;

export const ALL_INTERVIEW_TYPES = [
  "product_sense",
  "behavioral",
  "execution",
  "strategy"
] as const satisfies readonly RoundType[];

export const DIFFICULTY_LEVELS = {
  beginner: {
    label: "Junior/APM",
    description: "0-2 years experience",
    subtitle: "Patient coaching with learning mode",
    icon: "Sprout"
  },
  intermediate: {
    label: "IC PM",
    description: "2-4 years experience",
    subtitle: "Balanced approach with standard bar",
    icon: "Zap"
  },
  advanced: {
    label: "Senior PM",
    description: "5+ years experience",
    subtitle: "High bar with strategic deep-dives",
    icon: "Trophy"
  }
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
  hintMode: HintMode;
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
  hintMode: "off" as const,
  questionPreference: {
    recency: "very_recent" as const,
    recentDays: 365
  },
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9"
};

export const SMART_DURATION = {
  behavioral: 30,
  product_sense: 45,
  execution: 45,
  strategy: 45
} as const satisfies Record<RoundType, 30 | 45>;

export const DEFAULT_CONFIG: InterviewConfig = {
  roundType: "product_sense",
  difficulty: "intermediate",
  ...SYSTEM_DEFAULTS,
  duration: SMART_DURATION.product_sense
};

export const INTERVIEW_TYPE_LABELS: Record<RoundType, string> = {
  product_sense: "Product Sense",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy"
};

export function buildFullConfig(userConfig: MinimalInterviewConfig): InterviewConfig {
  return {
    ...userConfig,
    ...SYSTEM_DEFAULTS,
    duration: SMART_DURATION[userConfig.roundType]
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
