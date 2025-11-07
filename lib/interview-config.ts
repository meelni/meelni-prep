/**
 * Interview Configuration Types and Constants
 *
 * This module defines the configuration interface for mock interviews,
 * including voice settings, interview parameters, and model configurations.
 */

export interface QuestionPreference {
  recency: "all" | "recent" | "very_recent";
  recentDays?: number; // Number of days for filtering (365, 730, or undefined for all)
}

export interface InterviewConfig {
  // Voice settings
  voice: string;           // Cartesia voice ID
  speed: number;           // 0.6 - 1.5
  emotion: string;         // e.g., "professional", "friendly"
  volume: number;          // 0.5 - 2.0

  // Interview settings
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number;        // minutes (15, 30, 45)
  feedback_mode: 'real_time' | 'end_only' | 'silent';

  // Question preferences
  questionPreference?: QuestionPreference;

  // Model settings
  stt_model: string;       // e.g., "deepgram/nova-3"
  llm_model: string;       // e.g., "openai/gpt-4.1-mini"
  tts_model: string;       // e.g., "cartesia/sonic-3:voice-id"
}

export const DEFAULT_CONFIG: InterviewConfig = {
  voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", // Tessa
  speed: 1.0,
  emotion: "professional",
  volume: 1.0,
  difficulty: "intermediate",
  duration: 30,
  feedback_mode: "end_only",
  questionPreference: {
    recency: "very_recent",
    recentDays: 365,
  },
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
};

export const ROUND_TYPES = {
  behavioral: {
    label: "Behavioral",
    description: "Leadership, teamwork, and past experiences using STAR method",
    subtitle: "Demonstrate influence, resilience, and team leadership",
    icon: "Users",
    duration: 30,
    color: "from-blue-500 to-cyan-500",
  },
  product_sense: {
    label: "Product Sense",
    description: "Design thinking, user empathy, and product strategy",
    subtitle: "Design solutions and prioritize features for user problems",
    icon: "Lightbulb",
    duration: 45,
    color: "from-purple-500 to-pink-500",
  },
  execution: {
    label: "Execution",
    description: "Metrics, roadmapping, and technical execution",
    subtitle: "Define metrics and analyze data to drive decisions",
    icon: "Target",
    duration: 40,
    color: "from-orange-500 to-red-500",
  },
  strategy: {
    label: "Strategy",
    description: "Business thinking, market analysis, and long-term vision",
    subtitle: "Think long-term about market positioning and competitive advantage",
    icon: "TrendingUp",
    duration: 45,
    color: "from-green-500 to-emerald-500",
  },
} as const;

export type RoundType = keyof typeof ROUND_TYPES;

export const DIFFICULTY_LEVELS = {
  beginner: {
    label: "Beginner",
    description: "Basic questions, helpful prompts, more guidance",
    icon: "Smile",
  },
  intermediate: {
    label: "Intermediate",
    description: "Standard difficulty, some follow-ups",
    icon: "Zap",
  },
  advanced: {
    label: "Advanced",
    description: "Challenging questions, minimal guidance, bar-raiser mode",
    icon: "Award",
  },
} as const;

export type DifficultyLevel = keyof typeof DIFFICULTY_LEVELS;

export const FEEDBACK_MODES = {
  real_time: {
    label: "Real-time Feedback",
    description: "Get immediate feedback during the interview",
  },
  end_only: {
    label: "End Only",
    description: "Receive comprehensive feedback after completion",
  },
  silent: {
    label: "Silent Mode",
    description: "No feedback during interview, focus on flow",
  },
} as const;

export type FeedbackMode = keyof typeof FEEDBACK_MODES;

export const DURATION_OPTIONS = [
  { value: 15, label: "15 minutes", description: "Quick practice session" },
  { value: 30, label: "30 minutes", description: "Standard interview" },
  { value: 45, label: "45 minutes", description: "Extended deep dive" },
] as const;

export const EMOTION_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "calm", label: "Calm" },
  { value: "confident", label: "Confident" },
  { value: "curious", label: "Curious" },
] as const;

/**
 * Convert recency selection to days for API query
 */
export function getRecentDays(recency: "very_recent" | "recent" | "all"): number | undefined {
  switch (recency) {
    case "very_recent":
      return 365; // 1 year (2024)
    case "recent":
      return 730; // 2 years (2023-2024)
    case "all":
      return undefined; // No filter
  }
}

/**
 * Get the appropriate duration for a round type
 */
export function getDefaultDuration(roundType: RoundType): number {
  return ROUND_TYPES[roundType].duration;
}

/**
 * Validate interview configuration
 */
export function validateConfig(config: Partial<InterviewConfig>): boolean {
  if (config.speed !== undefined && (config.speed < 0.6 || config.speed > 1.5)) {
    return false;
  }
  if (config.volume !== undefined && (config.volume < 0.5 || config.volume > 2.0)) {
    return false;
  }
  if (config.duration !== undefined && ![15, 30, 45].includes(config.duration)) {
    return false;
  }
  return true;
}
