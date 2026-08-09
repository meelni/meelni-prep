/**
 * Compatibility exports for the legacy permissions-service import path.
 *
 * Canonical entitlement contracts now live in `@meelni/core`.
 */
export {
  ALL_INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  canAccessInterviewType,
  getAllowedInterviewTypes,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
  type RoundType,
  type SubscriptionTier,
} from "@meelni/core";

/**
 * NOTE: For server-side database access to get user tier, use:
 * import { getUserTier } from "@/lib/services/permissions-service.server";
 *
 * This separation prevents database code from being bundled in client components.
 */
