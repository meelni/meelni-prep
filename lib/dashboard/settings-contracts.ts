export type SettingsCategoryId =
  | "account"
  | "interview-defaults"
  | "plan-credits"
  | "notifications"
  | "data-privacy";

export type DefaultInterviewType =
  | "product_sense"
  | "analytical"
  | "behavioral"
  | "strategy";

export type DefaultDifficulty = "easy" | "medium" | "hard";
export type QuestionRecency = "current" | "recent" | "all";

export interface DashboardSettings {
  displayName: string;
  defaultInterviewType: DefaultInterviewType;
  defaultDifficulty: DefaultDifficulty;
  questionRecency: QuestionRecency;
  autoSaveTranscripts: boolean;
  emailNotifications: boolean;
  sessionCompletionEmail: boolean;
  feedbackReadyEmail: boolean;
  weeklyProgressReport: boolean;
  shareAnonymousData: boolean;
  saveTranscripts: boolean;
  theme: "light" | "dark" | "system";
}

export interface SettingsContractItem {
  category: SettingsCategoryId;
  label: string;
  source: string;
  action: "editable" | "read-only" | "external" | "future";
  shipsNow: boolean;
}

export const SETTINGS_CATEGORY_LABELS: Record<SettingsCategoryId, string> = {
  account: "Account",
  "interview-defaults": "Interview defaults",
  "plan-credits": "Plan & credits",
  notifications: "Notifications",
  "data-privacy": "Data & privacy",
};

export const SETTINGS_CATEGORY_ORDER: SettingsCategoryId[] = [
  "account",
  "interview-defaults",
  "plan-credits",
  "notifications",
  "data-privacy",
];

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  displayName: "",
  defaultInterviewType: "product_sense",
  defaultDifficulty: "medium",
  questionRecency: "current",
  autoSaveTranscripts: true,
  emailNotifications: true,
  sessionCompletionEmail: true,
  feedbackReadyEmail: true,
  weeklyProgressReport: false,
  shareAnonymousData: true,
  saveTranscripts: true,
  theme: "system",
};

export const SETTINGS_DATA_CONTRACT: SettingsContractItem[] = [
  {
    category: "account",
    label: "Name and email",
    source: "Supabase auth user plus /api/user/settings displayName",
    action: "editable",
    shipsNow: true,
  },
  {
    category: "account",
    label: "Target role and interview timeline",
    source: "No durable profile fields yet",
    action: "future",
    shipsNow: true,
  },
  {
    category: "account",
    label: "Sign-in method and current session",
    source: "Supabase auth session",
    action: "read-only",
    shipsNow: true,
  },
  {
    category: "interview-defaults",
    label: "Round type, difficulty, question recency, transcript storage",
    source: "/api/user/settings user_settings columns",
    action: "editable",
    shipsNow: true,
  },
  {
    category: "plan-credits",
    label: "Subscription and available credits",
    source: "/api/billing/subscription and /api/billing/credits",
    action: "external",
    shipsNow: true,
  },
  {
    category: "notifications",
    label: "Email notification preferences",
    source: "/api/user/settings user_settings columns",
    action: "editable",
    shipsNow: true,
  },
  {
    category: "data-privacy",
    label: "Transcript retention and anonymous product improvement",
    source: "/api/user/settings user_settings columns",
    action: "editable",
    shipsNow: true,
  },
  {
    category: "data-privacy",
    label: "Account deletion",
    source: "/api/user/delete",
    action: "external",
    shipsNow: true,
  },
];

export function normalizeDashboardSettings(
  input: Partial<DashboardSettings> | null | undefined,
  fallbackDisplayName = ""
): DashboardSettings {
  return {
    ...DEFAULT_DASHBOARD_SETTINGS,
    displayName: fallbackDisplayName,
    ...input,
  };
}

export function initialsForUser(displayName?: string | null, email?: string | null) {
  const source = displayName || email || "User";
  const chunks = source.includes("@") ? [source] : source.split(/\s+/);

  return chunks
    .filter(Boolean)
    .map((chunk) => chunk[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function labelForInterviewType(value: DefaultInterviewType) {
  switch (value) {
    case "analytical":
      return "Analytical";
    case "behavioral":
      return "Behavioral";
    case "strategy":
      return "Strategy";
    case "product_sense":
    default:
      return "Product sense";
  }
}

export function labelForDifficulty(value: DefaultDifficulty) {
  switch (value) {
    case "easy":
      return "Easy";
    case "hard":
      return "Hard";
    case "medium":
    default:
      return "Medium";
  }
}

export function labelForQuestionRecency(value: QuestionRecency) {
  switch (value) {
    case "recent":
      return "Recent company questions";
    case "all":
      return "All available questions";
    case "current":
    default:
      return "Current interview loops";
  }
}
