export const ACCOUNT_EXPORT_SCHEMA_VERSION = "1.2.0" as const;
export const ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;

export type AccountDeletionAuthDecision =
  | { allowed: true; authenticatedAt: string }
  | { allowed: false; reason: "reauthentication_required" };

export function getAccountDeletionAuthDecision(input: {
  lastSignInAt?: string | null;
  now?: Date;
  maxAgeMs?: number;
}): AccountDeletionAuthDecision {
  const authenticatedAt = input.lastSignInAt
    ? new Date(input.lastSignInAt)
    : null;
  const now = input.now ?? new Date();
  const maxAgeMs = input.maxAgeMs ?? ACCOUNT_DELETION_RECENT_AUTH_WINDOW_MS;

  if (
    !authenticatedAt ||
    Number.isNaN(authenticatedAt.getTime()) ||
    authenticatedAt.getTime() > now.getTime() ||
    now.getTime() - authenticatedAt.getTime() > maxAgeMs
  ) {
    return { allowed: false, reason: "reauthentication_required" };
  }

  return { allowed: true, authenticatedAt: authenticatedAt.toISOString() };
}

export interface AccountExportExclusion {
  category: string;
  reason: string;
}

export interface AccountExportSettingsV1 {
  displayName: string | null;
  defaultInterviewType: string | null;
  defaultDifficulty: string | null;
  questionRecency: string | null;
  emailNotifications: boolean;
  sessionCompletionEmail: boolean;
  feedbackReadyEmail: boolean;
  weeklyProgressReport: boolean;
  theme: string | null;
  analyticsConsent: {
    decision: "undecided" | "accepted" | "declined";
    policyVersion: number | null;
    source: "banner" | "settings" | "legacy_decline" | "account_sync" | null;
    decidedAt: string | null;
    revision: number;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AccountDataExportV1 {
  schemaVersion: typeof ACCOUNT_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  scope: {
    included: string[];
    excluded: AccountExportExclusion[];
    retentionNotes: string[];
  };
  account: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string | null;
    /** Frozen legacy values retained for export-schema 1.0.0 compatibility. */
    streak: {
      current: number;
      longest: number;
      lastPracticeAt: string | null;
    };
  };
  settings: AccountExportSettingsV1 | null;
  practice: {
    interviews: Array<Record<string, unknown>>;
    bookmarks: Array<Record<string, unknown>>;
    practiceSets: Array<Record<string, unknown>>;
    focusedPracticeAttempts: Array<Record<string, unknown>>;
    /** Frozen legacy rows retained for export-schema 1.0.0 compatibility. */
    achievements: Array<Record<string, unknown>>;
    insights: Array<Record<string, unknown>>;
  };
  billing: {
    subscription: Record<string, unknown> | null;
    usage: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    credits: {
      grants: Array<Record<string, unknown>>;
      reservations: Array<Record<string, unknown>>;
      transactions: Array<Record<string, unknown>>;
    };
  };
}
