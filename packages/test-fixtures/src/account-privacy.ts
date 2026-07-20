import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  type AccountDataExportV1,
} from "@meelni/core";

export function createAccountDataExportFixture(): AccountDataExportV1 {
  return {
    schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
    exportedAt: "2026-07-10T16:00:00.000Z",
    scope: {
      included: ["Account identity and PM interview practice data"],
      excluded: [
        {
          category: "Provider operations",
          reason: "Raw provider payloads and credentials are excluded.",
        },
      ],
      retentionNotes: [
        "Generating an export does not delete or change account data.",
      ],
    },
    account: {
      id: "fixture-account-user-1",
      email: "candidate@example.com",
      name: "Fixture Candidate",
      createdAt: "2026-06-01T12:00:00.000Z",
      streak: { current: 2, longest: 4, lastPracticeAt: null },
    },
    settings: {
      displayName: "Fixture Candidate",
      defaultInterviewType: "product_sense",
      defaultDifficulty: "medium",
      questionRecency: "current",
      emailNotifications: true,
      sessionCompletionEmail: true,
      feedbackReadyEmail: true,
      weeklyProgressReport: false,
      theme: "system",
      analyticsConsent: {
        decision: "undecided",
        policyVersion: null,
        source: null,
        decidedAt: null,
        revision: 0,
      },
      createdAt: "2026-06-01T12:00:00.000Z",
      updatedAt: "2026-07-10T16:00:00.000Z",
    },
    practice: {
      interviews: [],
      bookmarks: [],
      practiceSets: [],
      focusedPracticeAttempts: [],
      achievements: [],
      insights: [],
    },
    billing: {
      subscription: { tier: "free", status: "active" },
      usage: [],
      payments: [],
      credits: { grants: [], reservations: [], transactions: [] },
    },
  };
}
