import type Stripe from "stripe";

import type { AuthoritativeCheckoutSession } from "./stripe-checkout-fulfillment";

export type RetrievedAuthoritativeCheckoutSession =
  AuthoritativeCheckoutSession & {
    status: string | null;
    paymentStatus: string;
    mode: string;
    clientReferenceId: string | null;
    metadata: Record<string, string> | null;
    invoiceId: string | null;
    subscriptionId: string | null;
  };

export async function retrieveAuthoritativeCheckoutSession(
  stripe: Stripe,
  sessionId: string
): Promise<RetrievedAuthoritativeCheckoutSession> {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });
  const lineItems = session.line_items;

  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    mode: session.mode,
    clientReferenceId: session.client_reference_id,
    metadata: session.metadata ? { ...session.metadata } : null,
    customerId: getProviderId(session.customer),
    paymentIntentId: getProviderId(session.payment_intent),
    invoiceId: getProviderId(session.invoice),
    subscriptionId: getProviderId(session.subscription),
    amountTotal: session.amount_total,
    currency: session.currency,
    lineItems: {
      data: (lineItems?.data ?? []).map((lineItem) => ({
        priceId: getProviderId(lineItem.price),
        quantity: lineItem.quantity,
        currency: lineItem.currency,
      })),
      hasMore: lineItems?.has_more ?? true,
    },
  };
}

export async function findAuthoritativeSubscriptionCheckoutSession(
  stripe: Stripe,
  input: {
    subscriptionId: string;
    invoiceId: string;
    customerId: string;
    userId: string;
    catalogId: "starter" | "pro";
    expectedPriceId: string;
  }
): Promise<{ id: string }> {
  const session = await findSubscriptionCheckoutSessionForInvoice(stripe, {
    subscriptionId: input.subscriptionId,
    invoiceId: input.invoiceId,
    customerId: input.customerId,
    supportedPrices: new Map([[input.expectedPriceId, input.catalogId]]),
  });
  if (
    session.paymentStatus !== "paid" ||
    session.userId !== input.userId ||
    session.catalogId !== input.catalogId ||
    session.priceId !== input.expectedPriceId
  ) {
    throw new Error("stripe_subscription_checkout_session_invalid");
  }
  return { id: session.id };
}

export async function findSubscriptionCheckoutSessionForInvoice(
  stripe: Stripe,
  input: {
    subscriptionId: string;
    invoiceId: string;
    customerId: string;
    supportedPrices: ReadonlyMap<string, "starter" | "pro">;
  }
): Promise<{
  id: string;
  userId: string;
  catalogId: "starter" | "pro";
  priceId: string;
  paymentStatus: string;
}> {
  const sessions = await stripe.checkout.sessions.list({
    subscription: input.subscriptionId,
    status: "complete",
    limit: 100,
    expand: ["data.line_items"],
  });
  if (sessions.has_more || sessions.data.length !== 1) {
    throw new Error("stripe_subscription_checkout_session_ambiguous");
  }

  const [session] = sessions.data;
  const lineItems = session?.line_items;
  const [lineItem] = lineItems?.data ?? [];
  const userId = session?.metadata?.userId;
  const catalogId = session?.metadata?.catalogId;
  const priceId = getProviderId(lineItem?.price ?? null);
  if (
    !session ||
    session.status !== "complete" ||
    session.mode !== "subscription" ||
    getProviderId(session.subscription) !== input.subscriptionId ||
    getProviderId(session.invoice) !== input.invoiceId ||
    getProviderId(session.customer) !== input.customerId ||
    !userId ||
    session.client_reference_id !== userId ||
    (catalogId !== "starter" && catalogId !== "pro") ||
    !lineItems ||
    lineItems.has_more ||
    lineItems.data.length !== 1 ||
    !lineItem ||
    !priceId ||
    input.supportedPrices.get(priceId) !== catalogId ||
    lineItem.quantity !== 1 ||
    lineItem.currency !== "usd" ||
    session.currency !== "usd"
  ) {
    throw new Error("stripe_subscription_checkout_session_invalid");
  }

  return {
    id: session.id,
    userId,
    catalogId,
    priceId,
    paymentStatus: session.payment_status,
  };
}

function getProviderId(value: string | { id: string } | null): string | null {
  return value ? (typeof value === "string" ? value : value.id) : null;
}
