/**
 * Simplified Interview Configuration
 *
 * Users only choose:
 * - Interview Type (roundType)
 * - Difficulty Level (difficulty)
 *
 * Everything else is system-managed for optimal quality.
 */

export interface QuestionPreference {
  recency: "all" | "recent" | "very_recent";
  recentDays?: number;
}

/**
 * Minimal user-facing configuration
 * Users only make 2 choices!
 */
export interface MinimalInterviewConfig {
  roundType: RoundType;
  difficulty: DifficultyLevel;
}

/**
 * Full configuration including system defaults
 * This is what gets sent to the backend
 */
export interface InterviewConfig extends MinimalInterviewConfig {
  // System-managed voice settings
  voice: string;
  speed: number;
  emotion: string;
  volume: number;

  // System-managed interview settings
  duration: number;
  feedback_mode: 'real_time' | 'end_only' | 'silent';

  // System-managed question preferences
  questionPreference: QuestionPreference;

  // System-managed model settings
  stt_model: string;
  llm_model: string;
  tts_model: string;
}

/**
 * System-optimized defaults
 * These are the settings we've chosen for best quality
 */
export const SYSTEM_DEFAULTS = {
  // Voice model (ElevenLabs - natural, professional)
  voice: "cgSgspJ2msm6clMCkdW9",

  // Speech parameters (optimized through testing)
  speed: 1.0,          // Natural speaking pace
  emotion: "professional", // Balanced, trustworthy tone
  volume: 1.0,         // Standard volume

  // Feedback (don't interrupt flow)
  feedback_mode: "end_only" as const,

  // Question pool (always recent)
  questionPreference: {
    recency: "very_recent" as const,
    recentDays: 365, // Last 1 year (2024)
  },

  // Models (best quality/cost ratio)
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
};

/**
 * Smart duration based on interview type
 * Must be 15, 30, or 45 minutes per validation schema
 */
export const SMART_DURATION = {
  behavioral: 30,     // STAR stories need time
  product_sense: 45,  // Design problems are longer
  execution: 45,      // Metrics analysis needs depth (changed from 40 to match schema)
  strategy: 45,       // Strategic thinking requires exploration
} as const;

/**
 * Round type definitions
 */
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

/**
 * Difficulty level definitions
 * Maps to user experience levels
 */
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

/**
 * Build full configuration from user's minimal choices
 */
export function buildFullConfig(
  userConfig: MinimalInterviewConfig
): InterviewConfig {
  return {
    ...userConfig,
    ...SYSTEM_DEFAULTS,
    duration: SMART_DURATION[userConfig.roundType],
  };
}

/**
 * Legacy: Keep for backward compatibility
 * @deprecated Use SYSTEM_DEFAULTS instead
 */
export const DEFAULT_CONFIG: InterviewConfig = {
  roundType: "product_sense",
  difficulty: "intermediate",
  ...SYSTEM_DEFAULTS,
  duration: SMART_DURATION.product_sense,
};

/**
 * Get the appropriate duration for a round type
 */
export function getDefaultDuration(roundType: RoundType): number {
  return SMART_DURATION[roundType];
}

/**
 * Convert recency selection to days for API query
 * @deprecated Not needed in simplified flow (always use very_recent)
 */
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
