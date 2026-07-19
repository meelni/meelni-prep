export type QuestionEntryAction = "paused" | "wait" | "launch" | "authenticate";

export function resolveQuestionEntryAction({
  authLoading,
  isAuthenticated,
  reactivationEnabled,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
  reactivationEnabled: boolean;
}): QuestionEntryAction {
  if (!reactivationEnabled) return "paused";
  if (authLoading) return "wait";
  return isAuthenticated ? "launch" : "authenticate";
}
