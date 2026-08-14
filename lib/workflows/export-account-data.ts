import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  parseShadowFeedbackArtifact,
  type AccountExportSettingsV1,
  type AccountDataExportV1,
} from "@meelni/core";

type DateValue = Date | string | null | undefined;

export interface AccountExportSource {
  account: {
    id: string;
    name: string | null;
    createdAt: DateValue;
    streakCurrent: number;
    streakLongest: number;
    lastPracticeDate: DateValue;
  } | null;
  settings: {
    userId: string;
    displayName: string | null;
    defaultInterviewType: string | null;
    defaultDifficulty: string | null;
    questionRecency: string | null;
    emailNotifications: boolean;
    sessionCompletionEmail: boolean;
    feedbackReadyEmail: boolean;
    weeklyProgressReport: boolean;
    theme: string | null;
    analyticsConsent: string;
    analyticsConsentVersion: number | null;
    analyticsConsentSource: string | null;
    analyticsConsentUpdatedAt: DateValue;
    analyticsConsentRevision: number;
    createdAt: DateValue;
    updatedAt: DateValue;
  } | null;
  interviews: Array<{
    userId: string;
    id: string;
    roundType: string;
    mode: string;
    persona: string | null;
    config: unknown;
    startedAt: DateValue;
    endedAt: DateValue;
    lifecycleState: string;
    terminalReason: string | null;
    status: string;
    totalTurns: number | null;
    totalWords: number | null;
    durationSeconds: number | null;
    questions: Array<Record<string, unknown>>;
    transcript: Array<Record<string, unknown>>;
    feedback: Record<string, unknown> | null;
  }>;
  bookmarks: Array<{ userId: string } & Record<string, unknown>>;
  practiceSets: Array<{ userId: string } & Record<string, unknown>>;
  focusedPracticeAttempts: Array<{ userId: string } & Record<string, unknown>>;
  feedbackQualitySignals: Array<{
    userId: string;
    contractVersion: string;
    outcome: string;
    response: string;
    reason: string | null;
    revision: number;
    createdAt: DateValue;
    updatedAt: DateValue;
  }>;
  shadowFeedbackArtifacts: Array<{ userId: string; artifact: unknown }>;
  contactSubmissions: Array<{ userId: string } & Record<string, unknown>>;
  achievements: Array<{ userId: string } & Record<string, unknown>>;
  insights: Array<{ userId: string } & Record<string, unknown>>;
  subscription: ({ userId: string } & Record<string, unknown>) | null;
  usage: Array<{ userId: string } & Record<string, unknown>>;
  payments: Array<{ userId: string } & Record<string, unknown>>;
  creditGrants: Array<{ userId: string } & Record<string, unknown>>;
  creditReservations: Array<{ userId: string } & Record<string, unknown>>;
  creditTransactions: Array<{ userId: string } & Record<string, unknown>>;
}

export const ACCOUNT_EXPORT_INCLUDED = [
  "Account identity, profile, preferences, and frozen legacy streak records",
  "Mock interviews, selected questions, transcripts, and feedback",
  "Bookmarks, practice sets, frozen legacy achievement records, and saved progress insights",
  "Focused-practice attempts, candidate responses, and deterministic self-reviews",
  "Closed helpfulness responses for actionable feedback reviews",
  "Versioned, non-authoritative shadow feedback artifacts",
  "Account-linked support requests and their current triage state",
  "Subscription, usage, payment summaries, and credit-ledger summaries",
] as const;

export const ACCOUNT_EXPORT_EXCLUDED = [
  {
    category: "Authentication and provider credentials",
    reason:
      "Passwords, tokens, API keys, service-role credentials, and provider identifiers are never exported.",
  },
  {
    category: "Raw billing and provider operations",
    reason:
      "Raw Stripe webhook payloads, provider errors, idempotency keys, internal metadata, and dispatch state are excluded.",
  },
  {
    category: "Operational security records",
    reason:
      "Rate-limit state, deletion tombstones, one-way provider fingerprints, logs, and backup contents are excluded.",
  },
  {
    category: "Other people and shared content",
    reason:
      "The export is scoped to the authenticated account and does not include other users or the full shared question bank.",
  },
] as const;

export const ACCOUNT_EXPORT_RETENTION_NOTES = [
  "Generating an export does not delete or change account data.",
  "A completed deletion keeps the durable tombstone and one-way provider fingerprints described by Meelni's deletion contract until a separate retention decision is approved.",
  "Payment processors, backups, security logs, and legally required records may follow separate retention obligations; Meelni does not promise an unapproved deletion date for those systems.",
] as const;

export function createAccountDataExport(input: {
  authenticatedUser: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
  source: AccountExportSource;
  exportedAt?: Date;
}): AccountDataExportV1 {
  const exportedAt = input.exportedAt ?? new Date();
  const userId = input.authenticatedUser.id;
  const account =
    input.source.account?.id === userId ? input.source.account : null;

  return {
    schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    scope: {
      included: [...ACCOUNT_EXPORT_INCLUDED],
      excluded: ACCOUNT_EXPORT_EXCLUDED.map((item) => ({ ...item })),
      retentionNotes: [...ACCOUNT_EXPORT_RETENTION_NOTES],
    },
    account: {
      id: input.authenticatedUser.id,
      email: input.authenticatedUser.email ?? null,
      name: account?.name ?? input.authenticatedUser.name ?? null,
      createdAt: isoDate(account?.createdAt),
      streak: {
        current: account?.streakCurrent ?? 0,
        longest: account?.streakLongest ?? 0,
        lastPracticeAt: isoDate(account?.lastPracticeDate),
      },
    },
    settings: createSafeSettingsExport(input.source.settings, userId),
    practice: {
      interviews: input.source.interviews
        .filter((interview) => interview.userId === userId)
        .map((interview) => ({
          id: interview.id,
          roundType: interview.roundType,
          mode: interview.mode,
          persona: interview.persona,
          practiceOptions: safePracticeOptions(interview.config),
          startedAt: isoDate(interview.startedAt),
          endedAt: isoDate(interview.endedAt),
          lifecycleState: interview.lifecycleState,
          terminalReason: interview.terminalReason,
          status: interview.status,
          totalTurns: interview.totalTurns,
          totalWords: interview.totalWords,
          durationSeconds: interview.durationSeconds,
          questions: sanitizeUserValue(interview.questions),
          transcript: sanitizeUserValue(interview.transcript),
          feedback: sanitizeUserValue(interview.feedback),
        })),
      bookmarks: sanitizeOwnedRows(input.source.bookmarks, userId),
      practiceSets: sanitizeOwnedRows(input.source.practiceSets, userId),
      focusedPracticeAttempts: sanitizeOwnedRows(
        input.source.focusedPracticeAttempts,
        userId
      ),
      feedbackQualitySignals: sanitizeOwnedRows(
        input.source.feedbackQualitySignals,
        userId
      ),
      shadowFeedbackArtifacts: input.source.shadowFeedbackArtifacts
        .filter((row) => row.userId === userId)
        .map((row) => parseShadowFeedbackArtifact(row.artifact)),
      achievements: sanitizeOwnedRows(input.source.achievements, userId),
      insights: sanitizeOwnedRows(input.source.insights, userId),
    },
    communications: {
      contactSubmissions: sanitizeOwnedRows(
        input.source.contactSubmissions,
        userId
      ),
    },
    billing: {
      subscription: sanitizeOwnedRecord(input.source.subscription, userId),
      usage: sanitizeOwnedRows(input.source.usage, userId),
      payments: sanitizeOwnedRows(input.source.payments, userId),
      credits: {
        grants: sanitizeOwnedRows(input.source.creditGrants, userId),
        reservations: sanitizeOwnedRows(
          input.source.creditReservations,
          userId
        ),
        transactions: sanitizeOwnedRows(
          input.source.creditTransactions,
          userId
        ),
      },
    },
  };
}

function createSafeSettingsExport(
  settings: AccountExportSource["settings"],
  userId: string
): AccountExportSettingsV1 | null {
  if (!settings || settings.userId !== userId) return null;

  return {
    displayName: settings.displayName,
    defaultInterviewType: settings.defaultInterviewType,
    defaultDifficulty: settings.defaultDifficulty,
    questionRecency: settings.questionRecency,
    emailNotifications: settings.emailNotifications,
    sessionCompletionEmail: settings.sessionCompletionEmail,
    feedbackReadyEmail: settings.feedbackReadyEmail,
    weeklyProgressReport: settings.weeklyProgressReport,
    theme: settings.theme,
    analyticsConsent: {
      decision:
        settings.analyticsConsent === "accepted" ||
        settings.analyticsConsent === "declined"
          ? settings.analyticsConsent
          : "undecided",
      policyVersion: settings.analyticsConsentVersion,
      source: isAnalyticsConsentSource(settings.analyticsConsentSource)
        ? settings.analyticsConsentSource
        : null,
      decidedAt: isoDate(settings.analyticsConsentUpdatedAt),
      revision: settings.analyticsConsentRevision,
    },
    createdAt: isoDate(settings.createdAt),
    updatedAt: isoDate(settings.updatedAt),
  };
}

function isAnalyticsConsentSource(
  value: string | null
): value is NonNullable<AccountExportSettingsV1["analyticsConsent"]["source"]> {
  return (
    value === "banner" ||
    value === "settings" ||
    value === "legacy_decline" ||
    value === "account_sync"
  );
}

const SENSITIVE_KEY =
  /(?:password|secret|token|authorization|api.?key|service.?role|provider.?id|stripe.*id|livekit|payload|metadata|idempotency|dispatch|last.?error|failure.?reason|receipt.?url|source.?id|reservation.?key|fingerprint)/i;

export function sanitizeUserValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUserValue(item)) as T;
  }
  if (value instanceof Date) {
    return value.toISOString() as T;
  }
  if (!value || typeof value !== "object") return value;

  const sanitized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, entry]) => [key, sanitizeUserValue(entry)])
  );
  return sanitized as T;
}

function sanitizeOwnedRecord<T extends { userId: string }>(
  value: T | null,
  userId: string
) {
  if (!value || value.userId !== userId) return null;
  const { userId: ownershipMarker, ...record } = value;
  void ownershipMarker;
  return sanitizeUserValue(record);
}

function sanitizeOwnedRows<T extends { userId: string }>(
  rows: T[],
  userId: string
) {
  return rows
    .filter((row) => row.userId === userId)
    .map((row) => {
      const { userId: ownershipMarker, ...record } = row;
      void ownershipMarker;
      return sanitizeUserValue(record);
    });
}

function safePracticeOptions(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const record = config as Record<string, unknown>;
  return {
    difficulty: stringOrNull(record.difficulty),
    durationMinutes: numberOrNull(record.duration),
    feedbackMode: stringOrNull(record.feedback_mode ?? record.feedbackMode),
    hintMode: stringOrNull(record.hintMode ?? record.hint_mode),
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDate(value: DateValue): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
