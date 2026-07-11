export const ACCOUNT_EXPORT_SCHEMA_VERSION = "1.0.0" as const;
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
    streak: {
      current: number;
      longest: number;
      lastPracticeAt: string | null;
    };
  };
  settings: Record<string, unknown> | null;
  practice: {
    interviews: Array<Record<string, unknown>>;
    bookmarks: Array<Record<string, unknown>>;
    practiceSets: Array<Record<string, unknown>>;
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
