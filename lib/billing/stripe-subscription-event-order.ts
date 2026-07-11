import type Stripe from "stripe";

export interface StripeSubscriptionEventCursor {
  createdAt: Date;
  priority: number;
  eventId: string;
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
