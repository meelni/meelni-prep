export const FEEDBACK_ELIGIBILITY_POLICY = {
  partial: {
    minSubstantiveResponses: 1,
  },
  full: {
    minSubstantiveResponses: 5,
  },
} as const;

export const FEEDBACK_NUMERICAL_PRECISION_POLICY = {
  minSubstantiveResponses: 4,
} as const;
