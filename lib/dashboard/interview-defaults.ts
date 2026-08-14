import type { DifficultyLevel, RoundType } from "@meelni/core";

import {
  DEFAULT_DASHBOARD_SETTINGS,
  type DashboardSettings,
  type DefaultDifficulty,
  type DefaultInterviewType,
  type QuestionRecency,
} from "./settings-contracts";

export interface InterviewLauncherDefaults {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  questionPreference: {
    recency: "all" | "recent" | "very_recent";
    recentDays?: number;
  };
}

const ROUND_DEFAULTS: Record<DefaultInterviewType, RoundType> = {
  product_sense: "product_sense",
  analytical: "execution",
  behavioral: "behavioral",
  strategy: "strategy",
};

const DIFFICULTY_DEFAULTS: Record<DefaultDifficulty, DifficultyLevel> = {
  easy: "beginner",
  medium: "intermediate",
  hard: "advanced",
};

const QUESTION_DEFAULTS: Record<
  QuestionRecency,
  InterviewLauncherDefaults["questionPreference"]
> = {
  current: { recency: "very_recent", recentDays: 365 },
  recent: { recency: "recent", recentDays: 730 },
  all: { recency: "all" },
};

export function normalizeInterviewLauncherDefaults(
  input: unknown
): InterviewLauncherDefaults {
  const settings = isRecord(input) ? input : {};
  const interviewType = isDefaultInterviewType(settings.defaultInterviewType)
    ? settings.defaultInterviewType
    : DEFAULT_DASHBOARD_SETTINGS.defaultInterviewType;
  const difficulty = isDefaultDifficulty(settings.defaultDifficulty)
    ? settings.defaultDifficulty
    : DEFAULT_DASHBOARD_SETTINGS.defaultDifficulty;
  const questionRecency = isQuestionRecency(settings.questionRecency)
    ? settings.questionRecency
    : DEFAULT_DASHBOARD_SETTINGS.questionRecency;

  return {
    roundType: ROUND_DEFAULTS[interviewType],
    difficulty: DIFFICULTY_DEFAULTS[difficulty],
    questionPreference: { ...QUESTION_DEFAULTS[questionRecency] },
  };
}

export function resolveInterviewLauncherDefaults({
  saved,
  explicitRoundType,
  explicitDifficulty,
}: {
  saved: InterviewLauncherDefaults;
  explicitRoundType?: RoundType | null;
  explicitDifficulty?: DifficultyLevel | null;
}): InterviewLauncherDefaults {
  return {
    ...saved,
    roundType: explicitRoundType ?? saved.roundType,
    difficulty: explicitDifficulty ?? saved.difficulty,
  };
}

function isDefaultInterviewType(
  value: unknown
): value is DashboardSettings["defaultInterviewType"] {
  return ["product_sense", "analytical", "behavioral", "strategy"].includes(
    String(value)
  );
}

function isDefaultDifficulty(
  value: unknown
): value is DashboardSettings["defaultDifficulty"] {
  return ["easy", "medium", "hard"].includes(String(value));
}

function isQuestionRecency(
  value: unknown
): value is DashboardSettings["questionRecency"] {
  return ["current", "recent", "all"].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
