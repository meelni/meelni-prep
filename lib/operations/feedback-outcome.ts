import {
  isFeedbackOutcomeReason,
  type FeedbackOutcomeReason,
} from "@meelni/core";

export interface FeedbackOutcomeEvent {
  event: "meelni_feedback_outcome";
  version: 1;
  occurredAt: string;
  outcomeReason: FeedbackOutcomeReason;
  correlationId: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Emit only the terminal/dispatch taxonomy and an owner-scoped UUID. */
export function reportFeedbackOutcome(
  input: { outcomeReason: FeedbackOutcomeReason; sessionId?: unknown },
  write: (serialized: string) => void = console.info
): FeedbackOutcomeEvent | null {
  if (!isFeedbackOutcomeReason(input.outcomeReason)) return null;
  const event: FeedbackOutcomeEvent = {
    event: "meelni_feedback_outcome",
    version: 1,
    occurredAt: new Date().toISOString(),
    outcomeReason: input.outcomeReason,
    correlationId:
      typeof input.sessionId === "string" && UUID_PATTERN.test(input.sessionId)
        ? input.sessionId
        : null,
  };
  try {
    write(JSON.stringify(event));
  } catch {
    return null;
  }
  return event;
}
