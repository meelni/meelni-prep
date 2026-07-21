import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getStripeWebhookAction,
  isMeelniStripeWebhookEventType,
  STRIPE_ACCEPTED_WEBHOOK_EVENT_TYPES,
  STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES,
  STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES,
  STRIPE_WEBHOOK_EVENT_CONTRACT,
  type StripeWebhookActionHandlerContract,
} from "./stripe-webhook-events";
import {
  parseStripeWebhookEnabledEventsDocument,
  renderStripeWebhookEventContractMarkdown,
  STRIPE_WEBHOOK_EVENT_MARKDOWN_END,
  STRIPE_WEBHOOK_EVENT_MARKDOWN_START,
  verifyStripeWebhookEnabledEvents,
} from "../../scripts/stripe-webhook-event-contract";

const EXPECTED_REQUIRED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "charge.dispute.closed",
] as const;

const CONTRACT_DOCUMENTS = [
  "docs/contracts/stripe-webhook-events.md",
  "docs/STRIPE_LIVE_MODE_CHECKLIST.md",
  "docs/integrations/stripe/test-plan.md",
  "docs/operations/credit-billing-launch.md",
] as const;

const COMPILE_TIME_ACTION_HANDLERS = {
  checkout_payment: () => undefined,
  subscription_update: () => undefined,
  subscription_deleted: () => undefined,
  invoice_payment_succeeded: () => undefined,
  invoice_payment_failed: () => undefined,
  billing_adjustment: () => undefined,
  trial_will_end: () => undefined,
} satisfies StripeWebhookActionHandlerContract<void>;

test("defines the exact required and optional Stripe endpoint allowlist", () => {
  assert.deepEqual(
    STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES,
    EXPECTED_REQUIRED_EVENTS
  );
  assert.deepEqual(STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES, [
    "customer.subscription.trial_will_end",
  ]);
  assert.equal(STRIPE_WEBHOOK_EVENT_CONTRACT.length, 17);
  assert.equal(new Set(STRIPE_ACCEPTED_WEBHOOK_EVENT_TYPES).size, 17);
});

test("maps every accepted event to a runtime action and ignores unknown events", () => {
  for (const eventType of STRIPE_ACCEPTED_WEBHOOK_EVENT_TYPES) {
    assert.equal(isMeelniStripeWebhookEventType(eventType), true);
    assert.notEqual(getStripeWebhookAction(eventType), null);
  }
  assert.equal(isMeelniStripeWebhookEventType("customer.created"), false);
  assert.equal(getStripeWebhookAction("customer.created"), null);
  assert.deepEqual(Object.keys(COMPILE_TIME_ACTION_HANDLERS).sort(), [
    "billing_adjustment",
    "checkout_payment",
    "invoice_payment_failed",
    "invoice_payment_succeeded",
    "subscription_deleted",
    "subscription_update",
    "trial_will_end",
  ]);
});

test("verifies exact endpoint evidence with the optional event independently classified", () => {
  assert.deepEqual(verifyStripeWebhookEnabledEvents(EXPECTED_REQUIRED_EVENTS), {
    optionalConfigured: [],
    optionalNotConfigured: ["customer.subscription.trial_will_end"],
  });
  assert.deepEqual(
    verifyStripeWebhookEnabledEvents([
      ...EXPECTED_REQUIRED_EVENTS,
      "customer.subscription.trial_will_end",
    ]),
    {
      optionalConfigured: ["customer.subscription.trial_will_end"],
      optionalNotConfigured: [],
    }
  );
});

test("rejects incomplete, wildcard, unsupported, or duplicate endpoint evidence", () => {
  assert.throws(
    () => verifyStripeWebhookEnabledEvents(EXPECTED_REQUIRED_EVENTS.slice(1)),
    /missing required events: checkout\.session\.completed/
  );
  assert.throws(
    () => verifyStripeWebhookEnabledEvents([...EXPECTED_REQUIRED_EVENTS, "*"]),
    /unsupported events: \*/
  );
  assert.throws(
    () =>
      verifyStripeWebhookEnabledEvents([
        ...EXPECTED_REQUIRED_EVENTS,
        "customer.created",
      ]),
    /unsupported events: customer\.created/
  );
  assert.throws(
    () =>
      verifyStripeWebhookEnabledEvents([
        ...EXPECTED_REQUIRED_EVENTS,
        "invoice.payment_failed",
      ]),
    /duplicate events: invoice\.payment_failed/
  );
});

test("parses sanitized Stripe endpoint exports without requiring provider access", () => {
  assert.deepEqual(
    parseStripeWebhookEnabledEventsDocument(
      JSON.stringify({ enabled_events: EXPECTED_REQUIRED_EVENTS })
    ),
    EXPECTED_REQUIRED_EVENTS
  );
  assert.deepEqual(
    parseStripeWebhookEnabledEventsDocument(
      JSON.stringify({ enabledEvents: EXPECTED_REQUIRED_EVENTS })
    ),
    EXPECTED_REQUIRED_EVENTS
  );
  assert.throws(
    () => parseStripeWebhookEnabledEventsDocument("not-json"),
    /must be valid JSON/
  );
});

test("keeps every Stripe runbook and checklist on the executable event contract", () => {
  const expected = renderStripeWebhookEventContractMarkdown();
  for (const relativePath of CONTRACT_DOCUMENTS) {
    const document = readFileSync(
      new URL(`../../${relativePath}`, import.meta.url),
      "utf8"
    );
    assert.equal(
      extractContractBlock(document),
      expected,
      `${relativePath} has drifted from the executable Stripe webhook event contract`
    );
  }
});

function extractContractBlock(document: string): string {
  const start = document.indexOf(STRIPE_WEBHOOK_EVENT_MARKDOWN_START);
  const end = document.indexOf(STRIPE_WEBHOOK_EVENT_MARKDOWN_END);
  assert.notEqual(start, -1, "missing Stripe webhook contract start marker");
  assert.notEqual(end, -1, "missing Stripe webhook contract end marker");
  assert.equal(
    document.indexOf(STRIPE_WEBHOOK_EVENT_MARKDOWN_START, start + 1),
    -1,
    "duplicate Stripe webhook contract block"
  );
  return document.slice(start, end + STRIPE_WEBHOOK_EVENT_MARKDOWN_END.length);
}
