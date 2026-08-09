export const FEEDBACK_GENERATION_EVENT_PREFIX = "feedback/generate.requested";

export function feedbackGenerationEventId(
  sessionId: string,
  attempt: number
): string {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error("Feedback dispatch attempt must be a non-negative integer");
  }
  return `${FEEDBACK_GENERATION_EVENT_PREFIX}:${sessionId}:${attempt}`;
}
