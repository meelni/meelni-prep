import {
  ALL_INTERVIEW_TYPES,
  type RoundType,
} from "./interview";
import type { BillingCatalogId } from "./billing-catalog";

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "admin";

export interface CreditEntitlementState {
  activeOffer: BillingCatalogId | null;
  billingStatus: BillingStatus;
  remainingCredits: number;
  nextCreditExpiresAt: string | null;
  trialAvailable: boolean;
}

export interface CreditEntitlements {
  canStartInterview: boolean;
  remainingCredits: number;
  allowedRoundTypes: RoundType[];
  lockedRoundTypes: RoundType[];
  creditExpiresAt: string | null;
  billingStatus: BillingStatus;
  activeOffer: BillingCatalogId | null;
  trialAvailable: boolean;
  canBuyPass: boolean;
  canSubscribe: boolean;
  canBuyTopUp: boolean;
  noCreditReason: "no_credits_remaining" | "billing_inactive" | null;
}

const ACTIVE_BILLING_STATUSES = new Set<BillingStatus>([
  "trialing",
  "active",
  "admin",
]);

export function computeCreditEntitlements(
  state: CreditEntitlementState
): CreditEntitlements {
  const normalizedCredits = Math.max(0, state.remainingCredits);
  const billingActive = ACTIVE_BILLING_STATUSES.has(state.billingStatus);
  const canStartInterview = billingActive && normalizedCredits > 0;
  const isAdmin = state.billingStatus === "admin";

  return {
    canStartInterview,
    remainingCredits: normalizedCredits,
    allowedRoundTypes: canStartInterview ? [...ALL_INTERVIEW_TYPES] : [],
    lockedRoundTypes: canStartInterview ? [] : [...ALL_INTERVIEW_TYPES],
    creditExpiresAt: state.nextCreditExpiresAt,
    billingStatus: state.billingStatus,
    activeOffer: state.activeOffer,
    trialAvailable: state.trialAvailable,
    canBuyPass: !isAdmin,
    canSubscribe: !isAdmin,
    canBuyTopUp:
      !isAdmin &&
      (state.activeOffer === "starter" || state.activeOffer === "pro"),
    noCreditReason: canStartInterview
      ? null
      : billingActive
        ? "no_credits_remaining"
        : "billing_inactive",
  };
}

/**
 * Legacy tier helpers are retained during the credit-billing migration so the
 * current app can compile while session, Stripe, and UI slices move over.
 */
export type SubscriptionTier = "free" | "pro" | "premium";

const TIER_PERMISSIONS: Record<
  SubscriptionTier,
  readonly RoundType[] | "all"
> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all",
};

export function canAccessInterviewType(
  tier: SubscriptionTier,
  roundType: RoundType
): boolean {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return true;
  }

  return permissions.includes(roundType);
}

export function getAllowedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return [...ALL_INTERVIEW_TYPES];
  }

  return [...permissions];
}

export function getLockedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter((type) => !allowed.includes(type));
}

export function getRequiredTier(roundType: RoundType): SubscriptionTier {
  if (roundType === "product_sense") {
    return "free";
  }

  return "pro";
}

export function getRequiredTierBadge(roundType: RoundType): string {
  const tier = getRequiredTier(roundType);

  if (tier === "free") {
    return "";
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
