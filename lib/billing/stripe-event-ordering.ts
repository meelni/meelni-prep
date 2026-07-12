export type StripeSubscriptionStateEvent =
  | "invoice_failed"
  | "invoice_succeeded"
  | "subscription_created"
  | "subscription_deleted"
  | "subscription_retrieved"
  | "subscription_updated";

export function shouldApplyStripeSubscriptionState(input: {
  currentStatus?: string | null;
  currentStripeSubscriptionId?: string | null;
  event: StripeSubscriptionStateEvent;
  eventTimestamp: Date;
  incomingStripeSubscriptionId?: string | null;
  lastEventTimestamp?: Date | null;
}) {
  const hasCurrentSubscriptionId = Boolean(input.currentStripeSubscriptionId);
  const hasIncomingSubscriptionId = Boolean(input.incomingStripeSubscriptionId);
  const isDifferentSubscription =
    hasCurrentSubscriptionId &&
    hasIncomingSubscriptionId &&
    input.currentStripeSubscriptionId !== input.incomingStripeSubscriptionId;

  if (!hasCurrentSubscriptionId && hasIncomingSubscriptionId) {
    // A creation event is sufficient to scope a legacy row that predates
    // provider resource identity. Other resource-specific events cannot prove
    // that they belong to the unscoped row and must fail closed.
    if (
      input.event !== "subscription_created" ||
      input.currentStatus !== "canceled"
    ) {
      return false;
    }
    if (!input.lastEventTimestamp) return true;
    return input.eventTimestamp.getTime() >= input.lastEventTimestamp.getTime();
  }

  if (
    !hasIncomingSubscriptionId &&
    (input.event === "invoice_failed" || input.event === "invoice_succeeded")
  ) {
    // An invoice without a subscription reference cannot safely mutate a
    // resource-scoped subscription row.
    return false;
  }

  if (isDifferentSubscription) {
    // Only a creation event may replace the user's current provider resource.
    // Updates, invoices, and deletions for an older Stripe subscription must
    // never mutate a newer subscription, even when they arrive later.
    if (
      input.event !== "subscription_created" ||
      input.currentStatus !== "canceled"
    ) {
      return false;
    }
    if (!input.lastEventTimestamp) return true;
    return input.eventTimestamp.getTime() >= input.lastEventTimestamp.getTime();
  }

  if (input.currentStatus === "canceled") {
    if (input.event !== "subscription_deleted") return false;
    return (
      !input.lastEventTimestamp ||
      input.eventTimestamp.getTime() >= input.lastEventTimestamp.getTime()
    );
  }
  if (!input.lastEventTimestamp) return true;
  const delta =
    input.eventTimestamp.getTime() - input.lastEventTimestamp.getTime();
  if (delta > 0) return true;
  if (delta < 0) return false;
  // Stripe timestamps have second resolution. Cancellation is the terminal
  // tie-breaker and invoice events can never overwrite it in the same second.
  return (
    input.event === "subscription_deleted" ||
    input.event === "subscription_retrieved"
  );
}
