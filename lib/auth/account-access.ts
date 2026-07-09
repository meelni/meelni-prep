export type AccountAccessDecision =
  | "allow"
  | "unauthenticated"
  | "account_deletion_pending";

export function getAccountAccessDecision(input: {
  requiresAuthentication: boolean;
  authenticatedUserId?: string;
  hasDeletionTombstone: boolean;
}): AccountAccessDecision {
  if (input.authenticatedUserId && input.hasDeletionTombstone) {
    return "account_deletion_pending";
  }
  if (input.requiresAuthentication && !input.authenticatedUserId) {
    return "unauthenticated";
  }
  return "allow";
}
