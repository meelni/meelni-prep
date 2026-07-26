import {
  normalizeQuestionRound,
  QUESTION_ROUND_TYPES,
  type RoundType,
} from "@meelni/core";

const MIN_SAFE_VALIDATION_RATIO = 0.7;
const MAX_SAFE_DEACTIVATION_RATIO = 0.25;

export function getMissingQuestionRounds(
  questions: readonly { questionType: string }[]
): RoundType[] {
  const available = new Set(
    questions.flatMap(({ questionType }) => {
      const roundType = normalizeQuestionRound(questionType);
      return roundType ? [roundType] : [];
    })
  );
  return QUESTION_ROUND_TYPES.filter((roundType) => !available.has(roundType));
}

export function getQuestionSyncSafetyError({
  activeExistingRows,
  deactivationRows,
  sourceRows,
  validRows,
}: {
  activeExistingRows: number;
  deactivationRows: number;
  sourceRows: number;
  validRows: number;
}): string | null {
  if (sourceRows > 0 && validRows === 0) {
    return "Question sync aborted: no source rows passed validation.";
  }

  const validationRatio = sourceRows > 0 ? validRows / sourceRows : 1;
  if (validationRatio < MIN_SAFE_VALIDATION_RATIO) {
    return `Question sync aborted: only ${(validationRatio * 100).toFixed(1)}% of source rows passed validation.`;
  }

  const deactivationRatio =
    activeExistingRows > 0 ? deactivationRows / activeExistingRows : 0;
  if (
    activeExistingRows > 0 &&
    deactivationRatio > MAX_SAFE_DEACTIVATION_RATIO
  ) {
    return `Question sync aborted: proposed deactivation affects ${(deactivationRatio * 100).toFixed(1)}% of active questions.`;
  }

  return null;
}
