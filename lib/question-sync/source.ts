import { randomUUID } from "node:crypto";

import type {
  QuestionQualityStatus,
  QuestionSourceKind,
} from "@/lib/question-sync/types";
import {
  normalizeQuestionIdentityText,
  normalizeQuestionPresentationText,
  normalizeQuestionPromptForNearDuplicate,
} from "@/lib/question-sync/normalization";

export interface QuestionSyncQuestion {
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  sourceKind: QuestionSourceKind;
  sourceCategory: string | null;
  sourceFingerprint: string | null;
}

export interface StoredQuestionSyncQuestion extends QuestionSyncQuestion {
  id: string;
  isActive: boolean;
  qualityStatus: QuestionQualityStatus;
  duplicateOfQuestionId: string | null;
}

export type PlannedQuestionSyncRecord = StoredQuestionSyncQuestion;

export interface QuestionSyncPlan {
  questionsToInsert: PlannedQuestionSyncRecord[];
  questionsToUpdate: PlannedQuestionSyncRecord[];
  sourceMissingQuestionIdsToDeactivate: string[];
  nearDuplicateRowsQuarantined: number;
  duplicateRecordsRetired: number;
}

/**
 * Exact duplicate identity retains all non-private source provenance. A source
 * fingerprint is preferred once available; the legacy tuple keeps rollout
 * behavior deterministic while old rows are backfilled by a live sync.
 */
export function questionSyncSourceIdentity(
  question: QuestionSyncQuestion
): string {
  return (
    cleanFingerprint(question.sourceFingerprint) ??
    JSON.stringify([
      normalizeQuestionIdentityText(question.questionText),
      normalizeNullableIdentityText(question.company),
      normalizeQuestionIdentityText(question.questionType),
      question.askedAt?.toISOString() ?? null,
      normalizeNullableIdentityText(question.sourceCategory),
    ])
  );
}

/**
 * Near-duplicate identity is deliberately conservative: it ignores source
 * occurrence time and harmless case, spacing, quote, and punctuation drift,
 * but requires the same company and canonical PM round. It does not attempt
 * semantic or edit-distance matching.
 */
export function questionSyncContentIdentity(
  question: QuestionSyncQuestion
): string {
  return JSON.stringify([
    normalizeQuestionPromptForNearDuplicate(question.questionText),
    normalizeNullableIdentityText(question.company),
    normalizeQuestionIdentityText(question.questionType),
  ]);
}

export function deduplicateQuestionSyncSource<T extends QuestionSyncQuestion>(
  questions: readonly T[]
): { questions: T[]; duplicates: number } {
  const groups = groupBy(questions, questionSyncSourceIdentity);
  const unique = sortedEntries(groups).map(
    ([, matches]) => [...matches].sort(compareExactSourceRepresentation)[0]!
  );

  return { questions: unique, duplicates: questions.length - unique.length };
}

export function planQuestionSync(
  sourceQuestions: readonly QuestionSyncQuestion[],
  existingQuestions: readonly StoredQuestionSyncQuestion[],
  createId: () => string = randomUUID
): QuestionSyncPlan {
  const sourceByContent = groupBy(sourceQuestions, questionSyncContentIdentity);
  const existingByContent = groupBy(
    existingQuestions,
    questionSyncContentIdentity
  );
  const existingByFingerprint = new Map<string, StoredQuestionSyncQuestion[]>();
  for (const question of existingQuestions) {
    const fingerprint = cleanFingerprint(question.sourceFingerprint);
    if (!fingerprint) continue;
    const matches = existingByFingerprint.get(fingerprint) ?? [];
    matches.push(question);
    existingByFingerprint.set(fingerprint, matches);
  }

  const questionsToInsert: PlannedQuestionSyncRecord[] = [];
  const questionsToUpdate: PlannedQuestionSyncRecord[] = [];
  const consumedExistingIds = new Set<string>();
  const sourceContentIdentities = new Set(sourceByContent.keys());
  const sourceMissingQuestionIdsToDeactivate: string[] = [];
  let nearDuplicateRowsQuarantined = 0;
  let duplicateRecordsRetired = 0;

  for (const [contentIdentity, unsortedSourceGroup] of sortedEntries(
    sourceByContent
  )) {
    const sourceGroup = [...unsortedSourceGroup].sort(compareSourceProvenance);
    const canonicalSource = sourceGroup[0]!;
    const existingContentGroup = [
      ...(existingByContent.get(contentIdentity) ?? []),
    ].sort(compareStableIds);
    const canonicalExisting = selectCanonicalExisting(
      canonicalSource,
      existingContentGroup
    );
    const canonicalId = canonicalExisting?.id ?? createId();
    if (canonicalExisting) consumedExistingIds.add(canonicalExisting.id);

    addDesiredRecord(
      desiredRecord(canonicalId, canonicalSource, {
        isActive: true,
        qualityStatus: "published",
        duplicateOfQuestionId: null,
      }),
      canonicalExisting,
      questionsToInsert,
      questionsToUpdate
    );

    for (const duplicateSource of sourceGroup.slice(1)) {
      nearDuplicateRowsQuarantined++;
      const duplicateExisting = selectFingerprintMatch(
        duplicateSource,
        existingByFingerprint,
        consumedExistingIds
      );
      const duplicateId = duplicateExisting?.id ?? createId();
      if (duplicateExisting) consumedExistingIds.add(duplicateExisting.id);
      addDesiredRecord(
        desiredRecord(duplicateId, duplicateSource, {
          isActive: false,
          qualityStatus: "quarantined_near_duplicate",
          duplicateOfQuestionId: canonicalId,
        }),
        duplicateExisting,
        questionsToInsert,
        questionsToUpdate
      );
    }

    for (const surplus of existingContentGroup) {
      if (consumedExistingIds.has(surplus.id)) continue;
      consumedExistingIds.add(surplus.id);
      const desired = {
        ...surplus,
        isActive: false,
        qualityStatus: "retired_exact_duplicate" as const,
        duplicateOfQuestionId: canonicalId,
      };
      if (!sameStoredRecord(desired, surplus)) {
        questionsToUpdate.push(desired);
        duplicateRecordsRetired++;
      }
    }
  }

  for (const existing of [...existingQuestions].sort(compareStableIds)) {
    if (
      consumedExistingIds.has(existing.id) ||
      sourceContentIdentities.has(questionSyncContentIdentity(existing))
    ) {
      continue;
    }

    consumedExistingIds.add(existing.id);
    if (existing.isActive) {
      sourceMissingQuestionIdsToDeactivate.push(existing.id);
    }
    const desired = {
      ...existing,
      isActive: false,
      qualityStatus: "retired_source_missing" as const,
      duplicateOfQuestionId: null,
    };
    if (!sameStoredRecord(desired, existing)) questionsToUpdate.push(desired);
  }

  return {
    questionsToInsert,
    questionsToUpdate,
    sourceMissingQuestionIdsToDeactivate,
    nearDuplicateRowsQuarantined,
    duplicateRecordsRetired,
  };
}

function desiredRecord(
  id: string,
  source: QuestionSyncQuestion,
  disposition: Pick<
    PlannedQuestionSyncRecord,
    "isActive" | "qualityStatus" | "duplicateOfQuestionId"
  >
): PlannedQuestionSyncRecord {
  return { id, ...source, ...disposition };
}

function addDesiredRecord(
  desired: PlannedQuestionSyncRecord,
  existing: StoredQuestionSyncQuestion | undefined,
  inserts: PlannedQuestionSyncRecord[],
  updates: PlannedQuestionSyncRecord[]
): void {
  if (!existing) inserts.push(desired);
  else if (!sameStoredRecord(desired, existing)) updates.push(desired);
}

function selectCanonicalExisting(
  source: QuestionSyncQuestion,
  existing: readonly StoredQuestionSyncQuestion[]
): StoredQuestionSyncQuestion | undefined {
  return (
    existing.find(
      (question) => question.isActive && question.qualityStatus === "published"
    ) ??
    existing.find(
      (question) =>
        cleanFingerprint(question.sourceFingerprint) ===
        cleanFingerprint(source.sourceFingerprint)
    ) ??
    existing[0]
  );
}

function selectFingerprintMatch(
  source: QuestionSyncQuestion,
  existingByFingerprint: ReadonlyMap<
    string,
    readonly StoredQuestionSyncQuestion[]
  >,
  consumedIds: ReadonlySet<string>
): StoredQuestionSyncQuestion | undefined {
  const fingerprint = cleanFingerprint(source.sourceFingerprint);
  if (!fingerprint) return undefined;
  return [...(existingByFingerprint.get(fingerprint) ?? [])]
    .sort(compareStableIds)
    .find((question) => !consumedIds.has(question.id));
}

function sameStoredRecord(
  left: StoredQuestionSyncQuestion,
  right: StoredQuestionSyncQuestion
): boolean {
  return (
    left.id === right.id &&
    left.company === right.company &&
    left.questionText === right.questionText &&
    left.questionType === right.questionType &&
    left.askedAt?.toISOString() === right.askedAt?.toISOString() &&
    left.sourceKind === right.sourceKind &&
    left.sourceCategory === right.sourceCategory &&
    left.sourceFingerprint === right.sourceFingerprint &&
    left.isActive === right.isActive &&
    left.qualityStatus === right.qualityStatus &&
    left.duplicateOfQuestionId === right.duplicateOfQuestionId
  );
}

function compareSourceProvenance(
  left: QuestionSyncQuestion,
  right: QuestionSyncQuestion
): number {
  const leftTime = left.askedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.askedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return questionSyncSourceIdentity(left).localeCompare(
    questionSyncSourceIdentity(right),
    "en"
  );
}

function compareExactSourceRepresentation(
  left: QuestionSyncQuestion,
  right: QuestionSyncQuestion
): number {
  return (
    compareStrings(
      stableSourceRepresentation(left),
      stableSourceRepresentation(right)
    ) ||
    compareStrings(
      rawSourceRepresentation(left),
      rawSourceRepresentation(right)
    )
  );
}

function stableSourceRepresentation(question: QuestionSyncQuestion): string {
  return JSON.stringify([
    normalizeQuestionPresentationText(question.questionText),
    normalizeQuestionPresentationText(question.company ?? "") || null,
    normalizeQuestionPresentationText(question.questionType),
    question.askedAt?.toISOString() ?? null,
    normalizeQuestionPresentationText(question.sourceCategory ?? "") || null,
    question.sourceKind,
    cleanFingerprint(question.sourceFingerprint),
  ]);
}

function rawSourceRepresentation(question: QuestionSyncQuestion): string {
  return JSON.stringify([
    question.questionText,
    question.company,
    question.questionType,
    question.askedAt?.toISOString() ?? null,
    question.sourceCategory,
    question.sourceKind,
    question.sourceFingerprint,
  ]);
}

function compareStableIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function groupBy<T>(
  values: readonly T[],
  identity: (value: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = identity(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function sortedEntries<T>(groups: ReadonlyMap<string, T[]>): [string, T[]][] {
  return [...groups.entries()].sort(([left], [right]) =>
    compareStrings(left, right)
  );
}

function cleanFingerprint(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNullableIdentityText(value: string | null): string | null {
  const normalized = value ? normalizeQuestionIdentityText(value) : "";
  return normalized || null;
}
