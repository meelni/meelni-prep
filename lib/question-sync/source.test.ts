import assert from "node:assert/strict";
import test from "node:test";

import {
  deduplicateQuestionSyncSource,
  planQuestionSync,
  questionSyncSourceIdentity,
  type QuestionSyncQuestion,
  type StoredQuestionSyncQuestion,
} from "./source";
import { parseGoogleSheetTimestamp } from "@/scripts/sync-questions-from-sheet";

test("offset-less Google Forms timestamps are stable across process timezones", () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const utc = parseGoogleSheetTimestamp("7/9/2026 14:30:15", "-07:00");
    process.env.TZ = "America/Los_Angeles";
    const losAngeles = parseGoogleSheetTimestamp("7/9/2026 14:30:15", "-07:00");

    assert.equal(utc?.toISOString(), "2026-07-09T21:30:15.000Z");
    assert.equal(losAngeles?.toISOString(), utc?.toISOString());
    assert.equal(
      questionSyncSourceIdentity(question({ askedAt: utc ?? null })),
      questionSyncSourceIdentity(question({ askedAt: losAngeles ?? null }))
    );
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test("timestamp parser rejects ambiguous named zones and invalid calendar dates", () => {
  assert.throws(
    () =>
      parseGoogleSheetTimestamp("11/1/2026 01:30:00", "America/Los_Angeles"),
    /invalid_google_sheet_time_zone/
  );
  assert.equal(parseGoogleSheetTimestamp("2/30/2026 10:00:00", "UTC"), null);
});

test("composite source identity normalizes values without discarding provenance", () => {
  const base = question();
  assert.equal(
    questionSyncSourceIdentity(base),
    questionSyncSourceIdentity({
      ...base,
      company: "  META ",
      questionText: "  improve   SEARCH ",
      questionType: "product sense",
    })
  );

  for (const variant of [
    { ...base, company: "Google" },
    { ...base, questionType: "Execution" },
    { ...base, askedAt: new Date("2026-02-01T00:00:00.000Z") },
  ]) {
    assert.notEqual(
      questionSyncSourceIdentity(base),
      questionSyncSourceIdentity(variant)
    );
  }
});

test("dedupe removes only exact composite duplicates", () => {
  const base = question();
  const result = deduplicateQuestionSyncSource([
    base,
    { ...base, questionText: "  IMPROVE   search " },
    { ...base, company: "Google" },
    { ...base, questionType: "Execution" },
    { ...base, askedAt: new Date("2026-02-01T00:00:00.000Z") },
  ]);

  assert.equal(result.duplicates, 1);
  assert.equal(result.questions.length, 4);
});

test("plan reactivates an exact inactive source identity", () => {
  const base = question();
  const existing: StoredQuestionSyncQuestion = {
    ...base,
    id: "inactive",
    isActive: false,
  };

  assert.deepEqual(planQuestionSync([base], [existing]), {
    questionsToInsert: [],
    questionIdsToReactivate: ["inactive"],
    questionIdsToDeactivate: [],
    sourceMissingQuestionIdsToDeactivate: [],
  });
});

test("duplicate active identities converge on the lowest stable id", () => {
  const base = question();
  const result = planQuestionSync(
    [base],
    [
      { ...base, id: "z-surplus", isActive: true },
      { ...base, id: "a-survivor", isActive: true },
      { ...base, id: "m-surplus", isActive: true },
    ]
  );

  assert.deepEqual(result, {
    questionsToInsert: [],
    questionIdsToReactivate: [],
    questionIdsToDeactivate: ["m-surplus", "z-surplus"],
    sourceMissingQuestionIdsToDeactivate: [],
  });
});

test("changed provenance inserts a new identity and retires the old one", () => {
  const old = question();
  const replacement = { ...old, company: "Google" };
  const existing: StoredQuestionSyncQuestion = {
    ...old,
    id: "old",
    isActive: true,
  };

  assert.deepEqual(planQuestionSync([replacement], [existing]), {
    questionsToInsert: [replacement],
    questionIdsToReactivate: [],
    questionIdsToDeactivate: ["old"],
    sourceMissingQuestionIdsToDeactivate: ["old"],
  });
});

function question(
  overrides: Partial<QuestionSyncQuestion> = {}
): QuestionSyncQuestion {
  return {
    company: "Meta",
    questionText: "Improve Search",
    questionType: "Product Sense",
    askedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
