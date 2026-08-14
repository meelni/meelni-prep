import assert from "node:assert/strict";
import test from "node:test";

import {
  createShadowFeedbackArtifactKey,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
} from "@meelni/core";

import {
  createAccountDataExport,
  sanitizeUserValue,
} from "./export-account-data";

test("account export is versioned, user-scoped, and uses explicit safe practice options", () => {
  const result = createAccountDataExport({
    authenticatedUser: {
      id: "user-one",
      email: "candidate@example.com",
      name: "Candidate",
    },
    exportedAt: new Date("2026-07-10T16:00:00.000Z"),
    source: {
      account: {
        id: "user-one",
        name: "Candidate",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        streakCurrent: 4,
        streakLongest: 9,
        lastPracticeDate: new Date("2026-02-01T00:00:00.000Z"),
      },
      settings: {
        userId: "user-one",
        displayName: "Candidate",
        defaultInterviewType: "product_sense",
        defaultDifficulty: "medium",
        questionRecency: "current",
        emailNotifications: true,
        sessionCompletionEmail: true,
        feedbackReadyEmail: true,
        weeklyProgressReport: false,
        theme: "system",
        analyticsConsent: "declined",
        analyticsConsentVersion: 1,
        analyticsConsentSource: "settings",
        analyticsConsentUpdatedAt: new Date("2026-07-10T15:59:00.000Z"),
        analyticsConsentRevision: 3,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        updatedAt: new Date("2026-07-10T16:00:00.000Z"),
      },
      interviews: [
        {
          userId: "user-one",
          id: "session-one",
          roundType: "product_sense",
          mode: "voice_video",
          persona: null,
          config: {
            difficulty: "medium",
            duration: 30,
            feedback_mode: "end_only",
            llmModel: "provider/model",
            apiKey: "never-export",
          },
          startedAt: new Date("2026-07-10T15:00:00.000Z"),
          endedAt: null,
          lifecycleState: "active",
          terminalReason: null,
          status: "in_progress",
          totalTurns: 3,
          totalWords: 120,
          durationSeconds: 600,
          questions: [{ id: "question-one", questionText: "Design a product" }],
          transcript: [{ speaker: "user", text: "My answer" }],
          feedback: null,
        },
      ],
      bookmarks: [{ userId: "user-two", questionText: "Do not export this" }],
      practiceSets: [],
      focusedPracticeAttempts: [
        {
          userId: "user-one",
          id: "attempt-one",
          sourceSessionId: "session-one",
          sourceFeedbackId: "feedback-one",
          state: "completed",
          response: { kind: "reflection", text: "I changed the tradeoff." },
        },
        {
          userId: "user-two",
          id: "attempt-other-user",
          response: { text: "Do not export this attempt" },
        },
      ],
      feedbackQualitySignals: [
        {
          userId: "user-one",
          contractVersion: "feedback-quality-signal.v1",
          outcome: "partial_scorecard",
          response: "not_helpful",
          reason: "next_step_unclear",
          revision: 2,
          createdAt: new Date("2026-07-10T15:30:00.000Z"),
          updatedAt: new Date("2026-07-10T15:45:00.000Z"),
        },
        {
          userId: "user-two",
          contractVersion: "feedback-quality-signal.v1",
          outcome: "full_scorecard",
          response: "helpful",
          reason: null,
          revision: 1,
          createdAt: new Date("2026-07-10T15:31:00.000Z"),
          updatedAt: new Date("2026-07-10T15:31:00.000Z"),
        },
      ],
      shadowFeedbackArtifacts: [
        { userId: "user-one", artifact: shadowArtifact("session-one") },
        { userId: "user-two", artifact: shadowArtifact("session-other") },
      ],
      contactSubmissions: [
        {
          userId: "user-one",
          receiptId: "contact-one",
          email: "candidate@example.com",
          subject: "Billing question",
          message: "Please help with my plan.",
          idempotencyKey: "never-export",
        },
        {
          userId: "user-two",
          receiptId: "contact-other",
          message: "Do not export another user's message",
        },
      ],
      achievements: [
        {
          userId: "user-one",
          achievementId: "legacy_first_interview",
          earnedAt: new Date("2026-01-15T00:00:00.000Z"),
        },
        {
          userId: "user-two",
          achievementId: "do_not_export",
          earnedAt: new Date("2026-01-16T00:00:00.000Z"),
        },
      ],
      insights: [],
      subscription: null,
      usage: [],
      payments: [],
      creditGrants: [],
      creditReservations: [],
      creditTransactions: [],
    },
  });

  assert.equal(result.schemaVersion, "1.5.0");
  assert.equal(result.account.id, "user-one");
  assert.deepEqual(result.account.streak, {
    current: 4,
    longest: 9,
    lastPracticeAt: "2026-02-01T00:00:00.000Z",
  });
  assert.deepEqual(result.practice.achievements, [
    {
      achievementId: "legacy_first_interview",
      earnedAt: "2026-01-15T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(result.practice.interviews[0]?.practiceOptions, {
    difficulty: "medium",
    durationMinutes: 30,
    feedbackMode: "end_only",
    hintMode: null,
  });
  assert.equal(JSON.stringify(result).includes("never-export"), false);
  assert.equal(JSON.stringify(result).includes("provider/model"), false);
  assert.equal(JSON.stringify(result).includes("Do not export this"), false);
  assert.equal(JSON.stringify(result).includes("do_not_export"), false);
  assert.deepEqual(result.practice.focusedPracticeAttempts, [
    {
      id: "attempt-one",
      sourceSessionId: "session-one",
      sourceFeedbackId: "feedback-one",
      state: "completed",
      response: { kind: "reflection", text: "I changed the tradeoff." },
    },
  ]);
  assert.deepEqual(result.practice.feedbackQualitySignals, [
    {
      contractVersion: "feedback-quality-signal.v1",
      outcome: "partial_scorecard",
      response: "not_helpful",
      reason: "next_step_unclear",
      revision: 2,
      createdAt: "2026-07-10T15:30:00.000Z",
      updatedAt: "2026-07-10T15:45:00.000Z",
    },
  ]);
  assert.deepEqual(result.practice.shadowFeedbackArtifacts, [
    shadowArtifact("session-one"),
  ]);
  assert.deepEqual(result.communications.contactSubmissions, [
    {
      receiptId: "contact-one",
      email: "candidate@example.com",
      subject: "Billing question",
      message: "Please help with my plan.",
    },
  ]);
  assert.equal(
    JSON.stringify(result).includes("Do not export this attempt"),
    false
  );
  assert.equal(JSON.stringify(result).includes("userId"), false);
  assert.deepEqual(result.settings, {
    displayName: "Candidate",
    defaultInterviewType: "product_sense",
    defaultDifficulty: "medium",
    questionRecency: "current",
    emailNotifications: true,
    sessionCompletionEmail: true,
    feedbackReadyEmail: true,
    weeklyProgressReport: false,
    theme: "system",
    analyticsConsent: {
      decision: "declined",
      policyVersion: 1,
      source: "settings",
      decidedAt: "2026-07-10T15:59:00.000Z",
      revision: 3,
    },
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-07-10T16:00:00.000Z",
  });
  assert.equal("saveTranscripts" in (result.settings ?? {}), false);
  assert.equal("autoSaveTranscripts" in (result.settings ?? {}), false);
  assert.equal("shareAnonymousData" in (result.settings ?? {}), false);
});

test("account export fails closed on unknown shadow artifact versions", () => {
  const artifact = shadowArtifact("session-one");
  assert.throws(
    () =>
      createAccountDataExport({
        authenticatedUser: { id: "user-one" },
        source: {
          account: null,
          settings: null,
          interviews: [],
          bookmarks: [],
          practiceSets: [],
          focusedPracticeAttempts: [],
          feedbackQualitySignals: [],
          shadowFeedbackArtifacts: [
            {
              userId: "user-one",
              artifact: {
                ...artifact,
                contractVersion: "feedback.shadow-artifact.v0",
              },
            },
          ],
          contactSubmissions: [],
          achievements: [],
          insights: [],
          subscription: null,
          usage: [],
          payments: [],
          creditGrants: [],
          creditReservations: [],
          creditTransactions: [],
        },
      }),
    /version_unsupported/
  );
});

test("nested user content is recursively stripped of secrets and provider operations", () => {
  const sanitized = sanitizeUserValue({
    text: "User-authored answer",
    nested: {
      providerSecret: "secret",
      dispatchLastError: "raw provider failure",
      metadata: { harmless: false },
      evidence: [{ quote: "safe", authorization: "Bearer secret" }],
    },
  });

  assert.deepEqual(sanitized, {
    text: "User-authored answer",
    nested: { evidence: [{ quote: "safe" }] },
  });
});

function shadowArtifact(sessionLabel: string) {
  const sessionId =
    sessionLabel === "session-one"
      ? "44500000-0000-4000-8000-000000000445"
      : "44500000-0000-4000-8000-000000000446";
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key: createShadowFeedbackArtifactKey({
      sessionId,
      trustedBlockIdentity: {
        contractVersion: "trusted-answer-block-identity.v1",
        answerBlockId: "answer-block:0001",
        identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
      },
      rubricVersion: "pm-feedback-rubric.v3",
      promptVersion: "feedback.prompt.dimension-coverage.v1",
      selectionSchemaVersion: "feedback.dimension-coverage.selection.v1",
      modelVersion: "synthetic-shadow-model.v1",
    }),
    outcome: {
      state: "completed" as const,
      roundType: "product_sense" as const,
      mode: "coaching_review" as const,
      dimensions: {
        structure: { score: null, facetCodes: [] },
        clarity: { score: null, facetCodes: [] },
        insight: { score: null, facetCodes: [] },
        communication: { score: null, facetCodes: [] },
        leadership: { score: null, facetCodes: [] },
      },
    },
    metrics: {
      durationMs: 500,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2026-08-14T10:00:00.000Z",
  };
}
