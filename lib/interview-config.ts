/**
 * Compatibility exports for the legacy app import path.
 *
 * Canonical interview contracts now live in `@meelni/core`.
 */
export {
  DEFAULT_CONFIG,
  DIFFICULTY_LEVELS,
  ROUND_TYPES,
  SMART_DURATION,
  SYSTEM_DEFAULTS,
  buildFullConfig,
  getDefaultDuration,
  getRecentDays,
  isValidRoundType,
  type DifficultyLevel,
  type InterviewConfig,
  type MinimalInterviewConfig,
  type QuestionPreference,
  type RoundType
} from "@meelni/core";
