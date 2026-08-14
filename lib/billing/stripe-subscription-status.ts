import type Stripe from "stripe";

export type BillingSubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "paused"
  | "trialing";

const STRIPE_SUBSCRIPTION_STATUS_MAP = {
  active: "active",
  canceled: "canceled",
  incomplete: "paused",
  incomplete_expired: "paused",
  past_due: "past_due",
  paused: "paused",
  trialing: "trialing",
  unpaid: "paused",
} satisfies Record<Stripe.Subscription.Status, BillingSubscriptionStatus>;

export function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): BillingSubscriptionStatus {
  return STRIPE_SUBSCRIPTION_STATUS_MAP[stripeStatus] ?? "paused";
}
