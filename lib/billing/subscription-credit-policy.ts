import type { SubscriptionCreditPolicy } from "./credit-ledger-contracts";

export interface SubscriptionCreditPolicyState {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  gracePeriodEnd: Date | null;
}

const RESTRICTED_NOW: SubscriptionCreditPolicy = {
  restricted: true,
  availableThrough: null,
};

export function resolveSubscriptionCreditPolicy(
  row: SubscriptionCreditPolicyState | undefined
): SubscriptionCreditPolicy {
  if (!row) {
    return { restricted: false, availableThrough: null };
  }

  if (row.status === "past_due") {
    return {
      restricted: true,
      availableThrough: row.gracePeriodEnd,
    };
  }

  if (row.status === "canceled") {
    return {
      restricted: true,
      availableThrough: row.currentPeriodEnd,
    };
  }

  if (row.status === "active" || row.status === "trialing") {
    return row.cancelAtPeriodEnd
      ? { restricted: true, availableThrough: row.currentPeriodEnd }
      : { restricted: false, availableThrough: null };
  }

  return RESTRICTED_NOW;
}
