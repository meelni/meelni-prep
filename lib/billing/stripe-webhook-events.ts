import type Stripe from "stripe";

export type StripeWebhookEventRequirement = "required" | "optional";

export type StripeWebhookAction =
  | "checkout_payment"
  | "subscription_update"
  | "subscription_deleted"
  | "invoice_payment_succeeded"
  | "invoice_payment_failed"
  | "billing_adjustment"
  | "trial_will_end";

interface StripeWebhookEventDefinition {
  type: Stripe.Event["type"];
  requirement: StripeWebhookEventRequirement;
  action: StripeWebhookAction;
}

export const STRIPE_WEBHOOK_EVENT_CONTRACT = [
  {
    type: "checkout.session.completed",
    requirement: "required",
    action: "checkout_payment",
  },
  {
    type: "checkout.session.async_payment_succeeded",
    requirement: "required",
    action: "checkout_payment",
  },
  {
    type: "checkout.session.async_payment_failed",
    requirement: "required",
    action: "checkout_payment",
  },
  {
    type: "customer.subscription.created",
    requirement: "required",
    action: "subscription_update",
  },
  {
    type: "customer.subscription.updated",
    requirement: "required",
    action: "subscription_update",
  },
  {
    type: "customer.subscription.deleted",
    requirement: "required",
    action: "subscription_deleted",
  },
  {
    type: "invoice.payment_succeeded",
    requirement: "required",
    action: "invoice_payment_succeeded",
  },
  {
    type: "invoice.payment_failed",
    requirement: "required",
    action: "invoice_payment_failed",
  },
  {
    type: "refund.created",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "refund.updated",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "refund.failed",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "charge.refunded",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "charge.dispute.created",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "charge.dispute.funds_withdrawn",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "charge.dispute.funds_reinstated",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "charge.dispute.closed",
    requirement: "required",
    action: "billing_adjustment",
  },
  {
    type: "customer.subscription.trial_will_end",
    requirement: "optional",
    action: "trial_will_end",
  },
] as const satisfies readonly StripeWebhookEventDefinition[];

export type MeelniStripeWebhookEventType =
  (typeof STRIPE_WEBHOOK_EVENT_CONTRACT)[number]["type"];

export type StripeWebhookEventTypeForAction<
  Action extends StripeWebhookAction,
> = Extract<
  (typeof STRIPE_WEBHOOK_EVENT_CONTRACT)[number],
  { action: Action }
>["type"];

export type StripeWebhookEventForAction<Action extends StripeWebhookAction> =
  Extract<Stripe.Event, { type: StripeWebhookEventTypeForAction<Action> }>;

export type StripeWebhookActionHandlerContract<Result> = {
  [Action in StripeWebhookAction]: (
    event: StripeWebhookEventForAction<Action>
  ) => Result;
};

const ACTION_BY_EVENT_TYPE = buildActionIndex(STRIPE_WEBHOOK_EVENT_CONTRACT);

export const STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES = Object.freeze(
  STRIPE_WEBHOOK_EVENT_CONTRACT.filter(
    ({ requirement }) => requirement === "required"
  ).map(({ type }) => type)
);

export const STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES = Object.freeze(
  STRIPE_WEBHOOK_EVENT_CONTRACT.filter(
    ({ requirement }) => requirement === "optional"
  ).map(({ type }) => type)
);

export const STRIPE_ACCEPTED_WEBHOOK_EVENT_TYPES = Object.freeze(
  STRIPE_WEBHOOK_EVENT_CONTRACT.map(({ type }) => type)
);

export function getStripeWebhookAction(
  eventType: string
): StripeWebhookAction | null {
  return ACTION_BY_EVENT_TYPE.get(eventType) ?? null;
}

export function isMeelniStripeWebhookEventType(
  eventType: string
): eventType is MeelniStripeWebhookEventType {
  return ACTION_BY_EVENT_TYPE.has(eventType);
}

export function isStripeWebhookActionEvent<Action extends StripeWebhookAction>(
  event: Stripe.Event,
  action: Action
): event is StripeWebhookEventForAction<Action> {
  return getStripeWebhookAction(event.type) === action;
}

function buildActionIndex(
  definitions: readonly StripeWebhookEventDefinition[]
): ReadonlyMap<string, StripeWebhookAction> {
  const index = new Map<string, StripeWebhookAction>();
  for (const definition of definitions) {
    if (index.has(definition.type)) {
      throw new Error(`Duplicate Stripe webhook event: ${definition.type}`);
    }
    index.set(definition.type, definition.action);
  }
  return index;
}
