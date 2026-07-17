export type FeedbackModelEnv = Record<string, string | undefined> & {
  OPENAI_FEEDBACK_MODEL?: string;
};

export const ACCEPTED_FEEDBACK_MODEL = "gpt-5.1";

export function getFeedbackEvaluationModel(
  env: FeedbackModelEnv = process.env
): string {
  return env.OPENAI_FEEDBACK_MODEL?.trim() || ACCEPTED_FEEDBACK_MODEL;
}
