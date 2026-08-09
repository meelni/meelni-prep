export const FEEDBACK_GENERATION_FIXTURE = {
  sessionId: "fixture-feedback-session-1",
  userId: "fixture-feedback-user-1",
  events: {
    initial: "feedback/generate.requested:fixture-feedback-session-1:1",
    retry: "feedback/generate.requested:fixture-feedback-session-1:2",
  },
  clock: {
    dispatchedAt: new Date("2026-07-10T14:50:00.000Z"),
    processingStartedAt: new Date("2026-07-10T14:51:00.000Z"),
    retryRequestedAt: new Date("2026-07-10T15:00:00.000Z"),
  },
} as const;
