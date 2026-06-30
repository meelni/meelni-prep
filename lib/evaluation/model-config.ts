export type FeedbackModelEnv = Record<string, string | undefined> & {
  OPENAI_FEEDBACK_MODEL?: string;
};

export function getFeedbackEvaluationModel(
  env: FeedbackModelEnv = process.env
): string {
  return env.OPENAI_FEEDBACK_MODEL?.trim() || "gpt-5.1";
}
