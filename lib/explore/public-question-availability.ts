export type QuestionLoadState = "loading" | "success" | "error";

export interface PublicQuestionAvailability {
  hasVerifiedCount: boolean;
  totalQuestions: number | null;
}

/** Exact public counts exist only after a successful, validated API response. */
export function resolvePublicQuestionAvailability(
  state: QuestionLoadState,
  totalQuestions: number
): PublicQuestionAvailability {
  if (
    state !== "success" ||
    !Number.isSafeInteger(totalQuestions) ||
    totalQuestions < 0
  ) {
    return { hasVerifiedCount: false, totalQuestions: null };
  }

  return { hasVerifiedCount: true, totalQuestions };
}
