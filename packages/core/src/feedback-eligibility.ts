export const FEEDBACK_ELIGIBILITY_POLICY = {
  partial: {
    minTurns: 5,
    minDurationMinutes: 5,
    minSubstantiveResponses: 3,
  },
  full: {
    minTurns: 20,
    minDurationMinutes: 20,
    minSubstantiveResponses: 5,
  },
} as const;
