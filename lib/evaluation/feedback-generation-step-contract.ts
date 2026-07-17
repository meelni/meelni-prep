/**
 * Inngest memoizes step output by durable step ID. These v2 IDs intentionally
 * differ from the legacy fetch/evaluate/save IDs whose cached evidence identity
 * or payload shape is not compatible with FeedbackV2Result.
 */
export const FEEDBACK_V2_FETCH_TRANSCRIPT_STEP_ID =
  "fetch-transcript-v2" as const;
export const FEEDBACK_V2_EVALUATE_STEP_ID = "evaluate-session-v2" as const;
export const FEEDBACK_V2_SAVE_STEP_ID = "save-feedback-v2" as const;
