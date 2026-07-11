import assert from "node:assert/strict";
import test from "node:test";

import {
  deduplicateQuestionSyncSource,
  planQuestionSync,
  questionSyncContentIdentity,
  questionSyncSourceIdentity,
  type QuestionSyncQuestion,
  type StoredQuestionSyncQuestion,
} from "./source";
import {
  parseGoogleSheetTimestamp,
  questionSourceFingerprint,
} from "@/scripts/sync-questions-from-sheet";

test("offset-less Google Forms timestamps are stable across process timezones", () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const utc = parseGoogleSheetTimestamp("7/9/2026 14:30:15", "-07:00");
    process.env.TZ = "America/Los_Angeles";
    const losAngeles = parseGoogleSheetTimestamp("7/9/2026 14:30:15", "-07:00");

    assert.equal(utc?.toISOString(), "2026-07-09T21:30:15.000Z");
    assert.equal(losAngeles?.toISOString(), utc?.toISOString());
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

test("source fingerprints retain safe provenance without private source data", () => {
  const base = {
    company: "Meta",
    questionText: "Improve Search",
    sourceCategory: "Product Design",
    askedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const fingerprint = questionSourceFingerprint(base);

  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(
    fingerprint,
    questionSourceFingerprint({
      ...base,
      company: "  META ",
      questionText: " improve   SEARCH ",
    })
  );
  assert.notEqual(
    fingerprint,
    questionSourceFingerprint({
      ...base,
      sourceCategory: "Product Execution",
    })
  );
});

test("exact and near-duplicate identities have separate conservative policies", () => {
  const base = question();
  const laterPunctuationVariant = question({
    questionText: "Improve—Search!",
    askedAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceFingerprint: "b".repeat(64),
  });

  assert.notEqual(
    questionSyncSourceIdentity(base),
    questionSyncSourceIdentity(laterPunctuationVariant)
  );
  assert.equal(
    questionSyncContentIdentity(base),
    questionSyncContentIdentity(laterPunctuationVariant)
  );
  assert.notEqual(
    questionSyncContentIdentity(base),
    questionSyncContentIdentity(
      question({ questionText: "Improve Search for new sellers" })
    )
  );
});

test("dedupe removes only exact source fingerprints", () => {
  const base = question();
  const result = deduplicateQuestionSyncSource([
    base,
    { ...base, questionText: "different formatting is still exact upstream" },
    question({ sourceFingerprint: "b".repeat(64) }),
  ]);

  assert.equal(result.duplicates, 1);
  assert.equal(result.questions.length, 2);
});

test("near duplicates preserve the active canonical id and are quarantined", () => {
  const canonical = question();
  const later = question({
    askedAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceFingerprint: "b".repeat(64),
  });
  const existing = stored(canonical, { id: "selected-question" });
  const ids = ["quarantine-id"];

  const plan = planQuestionSync(
    [later, canonical],
    [existing],
    () => ids.shift()!
  );

  assert.equal(plan.nearDuplicateRowsQuarantined, 1);
  assert.equal(plan.questionsToInsert.length, 1);
  assert.deepEqual(plan.questionsToInsert[0], {
    id: "quarantine-id",
    ...later,
    isActive: false,
    qualityStatus: "quarantined_near_duplicate",
    duplicateOfQuestionId: "selected-question",
  });
  assert.equal(
    plan.questionsToUpdate.some(
      (record) => record.id === "selected-question" && record.isActive
    ),
    false
  );
});

test("source order and replay converge on one deterministic plan", () => {
  const earlier = question();
  const later = question({
    askedAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceFingerprint: "b".repeat(64),
  });
  const ids = () => {
    const values = ["canonical", "quarantine"];
    return () => values.shift()!;
  };

  const left = planQuestionSync([later, earlier], [], ids());
  const right = planQuestionSync([earlier, later], [], ids());
  assert.deepEqual(left, right);

  const replay = planQuestionSync(
    [later, earlier],
    left.questionsToInsert,
    () => "must-not-insert"
  );
  assert.deepEqual(replay.questionsToInsert, []);
  assert.deepEqual(replay.questionsToUpdate, []);
  assert.equal(replay.nearDuplicateRowsQuarantined, 1);
});

test("legacy active duplicates converge on the lowest stable id", () => {
  const source = question();
  const legacy = { sourceKind: "legacy" as const, sourceFingerprint: null };
  const plan = planQuestionSync(
    [source],
    [
      stored(source, { ...legacy, id: "z-surplus" }),
      stored(source, { ...legacy, id: "a-survivor" }),
    ],
    () => "unused"
  );

  assert.equal(
    plan.questionsToUpdate.find((record) => record.id === "a-survivor")
      ?.qualityStatus,
    "published"
  );
  assert.deepEqual(
    plan.questionsToUpdate.find((record) => record.id === "z-surplus"),
    {
      ...stored(source, { ...legacy, id: "z-surplus" }),
      isActive: false,
      qualityStatus: "retired_exact_duplicate",
      duplicateOfQuestionId: "a-survivor",
    }
  );
  assert.equal(plan.duplicateRecordsRetired, 1);
});

test("source removal retires publication without deleting selected-question rows", () => {
  const existing = stored(question(), { id: "preserved-id" });
  const plan = planQuestionSync([], [existing]);

  assert.deepEqual(plan.sourceMissingQuestionIdsToDeactivate, ["preserved-id"]);
  assert.deepEqual(plan.questionsToUpdate, [
    {
      ...existing,
      isActive: false,
      qualityStatus: "retired_source_missing",
      duplicateOfQuestionId: null,
    },
  ]);
});

function stored(
  source: QuestionSyncQuestion,
  overrides: Partial<StoredQuestionSyncQuestion> = {}
): StoredQuestionSyncQuestion {
  return {
    ...source,
    id: "existing",
    isActive: true,
    qualityStatus: "published",
    duplicateOfQuestionId: null,
    ...overrides,
  };
}

function question(
  overrides: Partial<QuestionSyncQuestion> = {}
): QuestionSyncQuestion {
  return {
    company: "Meta",
    questionText: "Improve Search",
    questionType: "Product Sense",
    askedAt: new Date("2026-01-01T00:00:00.000Z"),
    sourceKind: "google_sheets",
    sourceCategory: "Product Design",
    sourceFingerprint: "a".repeat(64),
    ...overrides,
  };
}
