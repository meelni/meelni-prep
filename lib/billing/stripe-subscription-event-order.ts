import type Stripe from "stripe";

export interface StripeSubscriptionEventCursor {
  createdAt: Date;
  priority: number;
  eventId: string;
}

export interface StripeSubscriptionResourceProof {
  resourceCreatedAt: Date;
  createdEventCursor: StripeSubscriptionEventCursor | null;
}

export function mayApplyStripeSubscriptionResource(input: {
  currentResourceId: string | null;
  currentStatus: string | null;
  currentResourceProof: StripeSubscriptionResourceProof | null;
  retiredResourceIds: readonly string[];
  candidateResourceId: string;
  candidateResourceProof: StripeSubscriptionResourceProof;
  eventType: string;
}): boolean {
  if (input.retiredResourceIds.includes(input.candidateResourceId)) {
    return false;
  }
  if (!input.currentResourceId) return true;
  if (input.currentResourceId === input.candidateResourceId) return true;
  if (
    input.eventType !== "customer.subscription.created" ||
    !input.currentResourceProof
  ) {
    return false;
  }

  const resourceCreatedDifference =
    input.candidateResourceProof.resourceCreatedAt.getTime() -
    input.currentResourceProof.resourceCreatedAt.getTime();
  if (resourceCreatedDifference !== 0) return resourceCreatedDifference > 0;

  const currentCreation = input.currentResourceProof.createdEventCursor;
  const candidateCreation = input.candidateResourceProof.createdEventCursor;
  if (!currentCreation || !candidateCreation) return false;
  return (
    compareStripeSubscriptionEventCursors(candidateCreation, currentCreation) >
    0
  );
}

const priorities: Record<string, number> = {
  "invoice.payment_failed": 10,
  "invoice.payment_succeeded": 20,
  "customer.subscription.created": 30,
  "customer.subscription.updated": 30,
  "customer.subscription.deleted": 40,
};

export function stripeSubscriptionEventCursor(
  event: Pick<Stripe.Event, "created" | "id" | "type">
): StripeSubscriptionEventCursor {
  const priority = priorities[event.type];
  if (priority === undefined) {
    throw new Error("unsupported_stripe_subscription_event");
  }
  return {
    createdAt: new Date(event.created * 1000),
    priority,
    eventId: event.id,
  };
}

export function compareStripeSubscriptionEventCursors(
  left: StripeSubscriptionEventCursor,
  right: StripeSubscriptionEventCursor
): number {
  const timestamp = left.createdAt.getTime() - right.createdAt.getTime();
  if (timestamp !== 0) return timestamp;
  if (left.priority !== right.priority) return left.priority - right.priority;
  return Buffer.from(left.eventId, "utf8").compare(
    Buffer.from(right.eventId, "utf8")
  );
}

export function stripeSubscriptionCursorMayApply(input: {
  currentResourceId: string | null;
  candidateResourceId: string;
  currentCursor: StripeSubscriptionEventCursor | null;
  candidateCursor: StripeSubscriptionEventCursor;
}): boolean {
  if (input.currentResourceId !== input.candidateResourceId) return true;
  if (!input.currentCursor) return true;
  return (
    compareStripeSubscriptionEventCursors(
      input.candidateCursor,
      input.currentCursor
    ) > 0
  );
}
