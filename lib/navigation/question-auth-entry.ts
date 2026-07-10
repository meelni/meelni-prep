export type QuestionEntryAction = "wait" | "launch" | "authenticate";

export function resolveQuestionEntryAction({
  authLoading,
  isAuthenticated,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
}): QuestionEntryAction {
  if (authLoading) return "wait";
  return isAuthenticated ? "launch" : "authenticate";
}
