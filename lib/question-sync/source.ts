export interface QuestionSyncQuestion {
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
}

export interface StoredQuestionSyncQuestion extends QuestionSyncQuestion {
  id: string;
  isActive: boolean;
}

export interface QuestionSyncPlan {
  questionsToInsert: QuestionSyncQuestion[];
  questionIdsToReactivate: string[];
  questionIdsToDeactivate: string[];
  sourceMissingQuestionIdsToDeactivate: string[];
}

/**
 * The current schema has no provider row id. Until provenance gets a dedicated
 * column, identity is the normalized tuple of every persisted source field:
 * question text, company, canonical storage type, and asked-at instant.
 */
export function questionSyncSourceIdentity(
  question: QuestionSyncQuestion
): string {
  return JSON.stringify([
    normalizeText(question.questionText),
    normalizeNullableText(question.company),
    normalizeText(question.questionType),
    question.askedAt?.toISOString() ?? null,
  ]);
}

export function deduplicateQuestionSyncSource<T extends QuestionSyncQuestion>(
  questions: readonly T[]
): { questions: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;

  for (const question of questions) {
    const key = questionSyncSourceIdentity(question);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }

    seen.add(key);
    unique.push(question);
  }

  return { questions: unique, duplicates };
}

export function planQuestionSync(
  sourceQuestions: readonly QuestionSyncQuestion[],
  existingQuestions: readonly StoredQuestionSyncQuestion[]
): QuestionSyncPlan {
  const existingByIdentity = new Map<string, StoredQuestionSyncQuestion[]>();
  for (const question of existingQuestions) {
    const identity = questionSyncSourceIdentity(question);
    const matches = existingByIdentity.get(identity) ?? [];
    matches.push(question);
    existingByIdentity.set(identity, matches);
  }

  const sourceIdentities = new Set<string>();
  const questionsToInsert: QuestionSyncQuestion[] = [];
  const questionIdsToReactivate: string[] = [];
  const surplusActiveIds = new Set<string>();

  for (const question of sourceQuestions) {
    const identity = questionSyncSourceIdentity(question);
    sourceIdentities.add(identity);
    const matches = existingByIdentity.get(identity) ?? [];
    const activeMatches = matches
      .filter((match) => match.isActive)
      .sort((left, right) => compareStableIds(left.id, right.id));
    if (activeMatches.length > 0) {
      for (const surplus of activeMatches.slice(1)) {
        surplusActiveIds.add(surplus.id);
      }
      continue;
    }

    const inactiveMatch = matches
      .filter((match) => !match.isActive)
      .sort((left, right) => compareStableIds(left.id, right.id))[0];
    if (inactiveMatch) questionIdsToReactivate.push(inactiveMatch.id);
    else questionsToInsert.push(question);
  }

  const sourceMissingQuestionIdsToDeactivate = existingQuestions
    .filter(
      (question) =>
        question.isActive &&
        !sourceIdentities.has(questionSyncSourceIdentity(question))
    )
    .map((question) => question.id);
  const questionIdsToDeactivate = [
    ...sourceMissingQuestionIdsToDeactivate,
    ...[...surplusActiveIds].sort(compareStableIds),
  ];

  return {
    questionsToInsert,
    questionIdsToReactivate,
    questionIdsToDeactivate,
    sourceMissingQuestionIdsToDeactivate,
  };
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeNullableText(value: string | null): string | null {
  const normalized = value ? normalizeText(value) : "";
  return normalized || null;
}
