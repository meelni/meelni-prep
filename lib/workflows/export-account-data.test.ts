import assert from "node:assert/strict";
import test from "node:test";

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
      account: null,
      settings: { userId: "user-one", saveTranscripts: true },
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
      achievements: [],
      insights: [],
      subscription: null,
      usage: [],
      payments: [],
      creditGrants: [],
      creditReservations: [],
      creditTransactions: [],
    },
  });

  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.account.id, "user-one");
  assert.deepEqual(result.practice.interviews[0]?.practiceOptions, {
    difficulty: "medium",
    durationMinutes: 30,
    feedbackMode: "end_only",
    hintMode: null,
  });
  assert.equal(JSON.stringify(result).includes("never-export"), false);
  assert.equal(JSON.stringify(result).includes("provider/model"), false);
  assert.equal(JSON.stringify(result).includes("Do not export this"), false);
  assert.equal(JSON.stringify(result).includes("userId"), false);
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
