import type Stripe from "stripe";

import { normalizeStripeBillingAdjustmentEvent } from "./stripe-adjustment-events";

/**
 * Identifies deliveries that represent the same business transition even when
 * Stripe sends them as different Event objects. Subscription updates are
 * deliberately excluded because the same object/type can carry new state.
 */
export function getStripeLogicalEventKey(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "customer.subscription.created":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end":
      return `${event.type}:${event.data.object.id}`;
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
    case "charge.dispute.closed": {
      const adjustment = normalizeStripeBillingAdjustmentEvent(event);
      return `billing-adjustment:${adjustment.providerAdjustmentId}:${adjustment.direction}`;
    }
    default:
      return null;
  }
}
