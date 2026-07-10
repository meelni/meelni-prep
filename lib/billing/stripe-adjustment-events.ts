import type Stripe from "stripe";

import type { StripeBillingAdjustmentInput } from "./stripe-billing-adjustment";

export function normalizeStripeBillingAdjustmentEvent(
  event: Stripe.Event
): StripeBillingAdjustmentInput {
  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    const refund = event.data.object as Stripe.Refund;
    return {
      stripeEventId: event.id,
      providerAdjustmentId: refund.id,
      adjustmentType: "refund",
      direction:
        refund.status === "failed" || refund.status === "canceled"
          ? "reinstate"
          : "withdraw",
      paymentIntentId: getExpandableId(refund.payment_intent),
      chargeId: getExpandableId(refund.charge),
      amountInCents: refund.amount,
      currency: refund.currency,
      metadata: { providerEventType: event.type },
    };
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const latestRefund = [...(charge.refunds?.data ?? [])].sort(
      (left, right) => right.created - left.created
    )[0];
    return {
      stripeEventId: event.id,
      providerAdjustmentId:
        latestRefund?.id ??
        `charge-refunded:${charge.id}:${charge.amount_refunded}`,
      adjustmentType: "refund",
      direction: "withdraw",
      paymentIntentId: getExpandableId(charge.payment_intent),
      chargeId: charge.id,
      amountInCents: latestRefund?.amount ?? charge.amount_refunded,
      currency: latestRefund?.currency ?? charge.currency,
      metadata: { providerEventType: event.type },
    };
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.funds_withdrawn" ||
    event.type === "charge.dispute.funds_reinstated" ||
    event.type === "charge.dispute.closed"
  ) {
    const dispute = event.data.object as Stripe.Dispute;
    return {
      stripeEventId: event.id,
      providerAdjustmentId: dispute.id,
      adjustmentType: "dispute",
      direction:
        event.type === "charge.dispute.funds_reinstated" ||
        (event.type === "charge.dispute.closed" && dispute.status === "won")
          ? "reinstate"
          : "withdraw",
      paymentIntentId: getExpandableId(dispute.payment_intent),
      chargeId: getExpandableId(dispute.charge),
      amountInCents: dispute.amount,
      currency: dispute.currency,
      metadata: { providerEventType: event.type, reason: dispute.reason },
    };
  }

  throw new Error(`Unsupported billing adjustment event: ${event.type}`);
}

function getExpandableId(
  value: { id: string } | string | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
