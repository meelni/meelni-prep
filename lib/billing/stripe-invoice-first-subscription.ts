import type Stripe from "stripe";

import type { PaidSubscriptionServicePeriod } from "./stripe-invoice-service-period";

export type InvoiceFirstSubscriptionBootstrap = {
  billingCycle: "annual" | "monthly";
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  catalogId: "pro" | "starter";
  customerId: string;
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  priceId: string;
  resourceCreatedAt: Date;
  status: "active";
  subscriptionId: string;
  trialEnd: Date | null;
  userId: string;
};

export function deriveInvoiceFirstSubscriptionBootstrap(input: {
  invoice: Stripe.Invoice;
  paidServicePeriod: PaidSubscriptionServicePeriod;
  supportedPrices: ReadonlyMap<string, "pro" | "starter">;
  subscription: Stripe.Subscription;
  subscriptionId: string;
}): InvoiceFirstSubscriptionBootstrap {
  const {
    invoice,
    paidServicePeriod,
    supportedPrices,
    subscription,
    subscriptionId,
  } = input;
  if (invoice.billing_reason !== "subscription_create") {
    throw evidenceError();
  }

  const invoiceCustomerId = providerId(invoice.customer);
  const subscriptionCustomerId = providerId(subscription.customer);
  if (
    !invoiceCustomerId ||
    subscription.id !== subscriptionId ||
    subscriptionCustomerId !== invoiceCustomerId
  ) {
    throw evidenceError();
  }

  const subscriptionOwner = normalizedMetadataOwner(
    subscription.metadata?.userId
  );
  const invoiceOwner = normalizedMetadataOwner(invoice.metadata?.userId);
  if (
    !subscriptionOwner ||
    (invoiceOwner && invoiceOwner !== subscriptionOwner)
  ) {
    throw evidenceError();
  }

  if (subscription.items.has_more || subscription.items.data.length !== 1) {
    throw evidenceError();
  }
  const item = subscription.items.data[0]!;
  const priceId = item.price?.id;
  const catalogId = priceId ? supportedPrices.get(priceId) : undefined;
  const billingCycle = item.price?.recurring?.interval;
  const currentPeriodStart = providerTimestamp(item.current_period_start);
  const currentPeriodEnd = providerTimestamp(item.current_period_end);
  if (
    !priceId ||
    !catalogId ||
    item.quantity !== 1 ||
    (item.subscription && providerId(item.subscription) !== subscriptionId) ||
    priceId !== paidServicePeriod.priceId ||
    (billingCycle !== "month" && billingCycle !== "year") ||
    !currentPeriodStart ||
    !currentPeriodEnd ||
    currentPeriodStart.getTime() !== paidServicePeriod.periodStart.getTime() ||
    currentPeriodEnd.getTime() !== paidServicePeriod.periodEnd.getTime() ||
    subscription.status !== "active"
  ) {
    throw evidenceError();
  }

  const resourceCreatedAt = providerTimestamp(subscription.created);
  const trialEnd = nullableProviderTimestamp(subscription.trial_end);
  const canceledAt = nullableProviderTimestamp(subscription.canceled_at);
  if (
    !resourceCreatedAt ||
    trialEnd === undefined ||
    canceledAt === undefined
  ) {
    throw evidenceError();
  }

  return {
    billingCycle: billingCycle === "month" ? "monthly" : "annual",
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt,
    catalogId,
    customerId: invoiceCustomerId,
    currentPeriodEnd,
    currentPeriodStart,
    priceId,
    resourceCreatedAt,
    status: subscription.status,
    subscriptionId,
    trialEnd,
    userId: subscriptionOwner,
  };
}

function providerId(value: { id: string } | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function providerTimestamp(value: number): Date | null {
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  const timestamp = new Date(value * 1_000);
  return Number.isFinite(timestamp.getTime()) ? timestamp : null;
}

function nullableProviderTimestamp(
  value: number | null
): Date | null | undefined {
  return value === null ? null : (providerTimestamp(value) ?? undefined);
}

function normalizedMetadataOwner(value: string | undefined): string | null {
  const owner = value?.trim();
  return owner ? owner : null;
}

function evidenceError(): Error {
  return new Error("stripe_invoice_subscription_bootstrap_evidence_invalid");
}
