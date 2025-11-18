/**
 * Permissions Service
 *
 * Centralized tier-based access control for interview types and features.
 *
 * Tier Permissions:
 * - Free: Product Sense only
 * - Pro: All 4 interview types
 * - Premium: All 4 interview types + custom
 */

export type SubscriptionTier = "free" | "pro" | "premium";

export type RoundType =
  | "product_sense"
  | "behavioral"
  | "execution"
  | "strategy";

/**
 * Tier permission configuration
 * - 'all' = access to all interview types
 * - Array = specific interview types allowed
 */
const TIER_PERMISSIONS: Record<SubscriptionTier, RoundType[] | "all"> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all",
};

/**
 * All available interview types
 */
export const ALL_INTERVIEW_TYPES: RoundType[] = [
  "product_sense",
  "behavioral",
  "execution",
  "strategy",
];

/**
 * Check if a user with the given tier can access a specific interview type
 *
 * @param tier - User's subscription tier
 * @param roundType - Requested interview type
 * @returns true if access is allowed, false otherwise
 *
 * @example
 * canAccessInterviewType("free", "product_sense") // true
 * canAccessInterviewType("free", "execution") // false
 * canAccessInterviewType("pro", "execution") // true
 */
export function canAccessInterviewType(
  tier: SubscriptionTier,
  roundType: RoundType
): boolean {
  const permissions = TIER_PERMISSIONS[tier];

  // Pro and Premium have access to all types
  if (permissions === "all") {
    return true;
  }

  // Free tier has limited access
  return permissions.includes(roundType);
}

/**
 * Get all interview types allowed for a given tier
 *
 * @param tier - User's subscription tier
 * @returns Array of allowed interview types
 *
 * @example
 * getAllowedInterviewTypes("free") // ["product_sense"]
 * getAllowedInterviewTypes("pro") // ["product_sense", "behavioral", "execution", "strategy"]
 */
export function getAllowedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return ALL_INTERVIEW_TYPES;
  }

  return permissions;
}

/**
 * Get interview types that are locked for a given tier
 *
 * @param tier - User's subscription tier
 * @returns Array of locked interview types
 *
 * @example
 * getLockedInterviewTypes("free") // ["behavioral", "execution", "strategy"]
 * getLockedInterviewTypes("pro") // []
 */
export function getLockedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter((type) => !allowed.includes(type));
}

/**
 * Get required tier to access a specific interview type
 *
 * @param roundType - Interview type to check
 * @returns Minimum required tier ('free', 'pro', or 'premium')
 *
 * @example
 * getRequiredTier("product_sense") // "free"
 * getRequiredTier("execution") // "pro"
 */
export function getRequiredTier(roundType: RoundType): SubscriptionTier {
  // Product Sense is available on free tier
  if (roundType === "product_sense") {
    return "free";
  }

  // All other types require Pro
  return "pro";
}

/**
 * Human-readable labels for interview types
 */
export const INTERVIEW_TYPE_LABELS: Record<RoundType, string> = {
  product_sense: "Product Sense",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
};

/**
 * Get badge text for locked interview types
 *
 * @param roundType - Interview type
 * @returns Badge text ('Pro' or 'Premium')
 */
export function getRequiredTierBadge(roundType: RoundType): string {
  const tier = getRequiredTier(roundType);

  if (tier === "free") {
    return "";
  }

  // Capitalize first letter
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * NOTE: For server-side database access to get user tier, use:
 * import { getUserTier } from "@/lib/services/permissions-service.server";
 *
 * This separation prevents database code from being bundled in client components.
 */
