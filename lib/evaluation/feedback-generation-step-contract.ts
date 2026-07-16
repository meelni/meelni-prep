/**
 * Inngest memoizes step output by durable step ID. These v2 IDs intentionally
 * differ from the legacy evaluate/save IDs whose cached payload shape is not
 * compatible with FeedbackV2Result.
 */
export const FEEDBACK_V2_EVALUATE_STEP_ID = "evaluate-session-v2" as const;
export const FEEDBACK_V2_SAVE_STEP_ID = "save-feedback-v2" as const;
