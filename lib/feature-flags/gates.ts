export const FEATURE_GATES = {
  meelniReactivationAccess: "meelni_reactivation_access",
} as const;

export const FEATURE_FLAG_DEFINITIONS = [
  {
    name: FEATURE_GATES.meelniReactivationAccess,
    label: "Reactivation access",
    description: "Hide discontinued messaging and reopen product entry points.",
  },
] as const;

export const FEATURE_EVENTS = {
  reactivationGateViewed: "meelni_reactivation_gate_viewed",
  reactivationLocalTest: "meelni_reactivation_local_test",
} as const;
