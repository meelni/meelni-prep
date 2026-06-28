import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";

export type SubscriptionTier = "free" | "pro" | "premium";

const TIER_PERMISSIONS: Record<SubscriptionTier, readonly RoundType[] | "all"> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all"
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
