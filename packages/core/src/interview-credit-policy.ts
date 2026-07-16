export const INTERVIEW_CREDIT_POLICY_VERSION =
  "interview-credit-recovery.v1" as const;

export const INTERVIEW_BILLING_FAULTS = [
  "user",
  "provider",
  "integrity",
] as const;
export type InterviewBillingFault = (typeof INTERVIEW_BILLING_FAULTS)[number];

export const INTERVIEW_CREDIT_SETTLEMENT_ACTIONS = [
  "release",
  "refund",
  "retain",
] as const;
export type InterviewCreditSettlementAction =
  (typeof INTERVIEW_CREDIT_SETTLEMENT_ACTIONS)[number];

export const INTERVIEW_CREDIT_SETTLEMENT_REASONS = [
  "terminal_before_usable",
  "provider_failure_after_usable",
  "integrity_failure_after_usable",
  "user_outcome_after_usable",
] as const;
export type InterviewCreditSettlementReason =
  (typeof INTERVIEW_CREDIT_SETTLEMENT_REASONS)[number];

export type InterviewCreditReservationTerminalStatus =
  | "active"
  | "consumed"
  | "released"
  | "refunded";

export interface InterviewCreditPolicyResolution {
  policyVersion: typeof INTERVIEW_CREDIT_POLICY_VERSION;
  action: InterviewCreditSettlementAction;
  reason: InterviewCreditSettlementReason;
  ledgerMutationRequired: boolean;
}
export function resolveInterviewCreditPolicy(input: {
  fault: InterviewBillingFault;
  reservationStatus: InterviewCreditReservationTerminalStatus;
}): InterviewCreditPolicyResolution {
  if (
    input.reservationStatus === "active" ||
    input.reservationStatus === "released"
  ) {
    return {
      policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
      action: "release",
      reason: "terminal_before_usable",
      ledgerMutationRequired: input.reservationStatus === "active",
    };
  }

  if (input.reservationStatus === "refunded") {
    if (input.fault === "user") {
      throw new Error("interview_credit_policy_evidence_conflict");
    }
    return {
      policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
      action: "refund",
      reason:
        input.fault === "provider"
          ? "provider_failure_after_usable"
          : "integrity_failure_after_usable",
      ledgerMutationRequired: false,
    };
  }

  if (input.fault === "provider" || input.fault === "integrity") {
    return {
      policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
      action: "refund",
      reason:
        input.fault === "provider"
          ? "provider_failure_after_usable"
          : "integrity_failure_after_usable",
      ledgerMutationRequired: true,
    };
  }

  return {
    policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
    action: "retain",
    reason: "user_outcome_after_usable",
    ledgerMutationRequired: false,
  };
}

export function isSafeInterviewBillingFaultCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9_.-]{0,63}$/.test(value)
  );
}
