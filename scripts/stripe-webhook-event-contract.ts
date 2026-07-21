import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES,
  STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES,
} from "../lib/billing/stripe-webhook-events";

export const STRIPE_WEBHOOK_EVENT_MARKDOWN_START =
  "<!-- stripe-webhook-event-contract:start -->";
export const STRIPE_WEBHOOK_EVENT_MARKDOWN_END =
  "<!-- stripe-webhook-event-contract:end -->";

export interface StripeWebhookEndpointContractResult {
  optionalConfigured: string[];
  optionalNotConfigured: string[];
}

export function renderStripeWebhookEventContractMarkdown(): string {
  return [
    STRIPE_WEBHOOK_EVENT_MARKDOWN_START,
    "",
    `Required events (${STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES.length}):`,
    "",
    ...STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES.map(
      (eventType) => `- \`${eventType}\``
    ),
    "",
    `Optional events (${STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES.length}):`,
    "",
    ...STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES.map(
      (eventType) => `- \`${eventType}\``
    ),
    STRIPE_WEBHOOK_EVENT_MARKDOWN_END,
  ].join("\n");
}

export function stripeWebhookEventContractJson(): {
  required: readonly string[];
  optional: readonly string[];
} {
  return {
    required: STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES,
    optional: STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES,
  };
}

export function verifyStripeWebhookEnabledEvents(
  enabledEvents: readonly string[]
): StripeWebhookEndpointContractResult {
  const duplicateEvents = duplicates(enabledEvents);
  if (duplicateEvents.length > 0) {
    throw new Error(
      `Stripe webhook endpoint contains duplicate events: ${duplicateEvents.join(", ")}`
    );
  }

  const configured = new Set(enabledEvents);
  const missingRequired = STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES.filter(
    (eventType) => !configured.has(eventType)
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Stripe webhook endpoint is missing required events: ${missingRequired.join(", ")}`
    );
  }

  const accepted = new Set<string>([
    ...STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES,
    ...STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES,
  ]);
  const unsupported = enabledEvents.filter(
    (eventType) => !accepted.has(eventType)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Stripe webhook endpoint contains unsupported events: ${unsupported.join(", ")}`
    );
  }

  return {
    optionalConfigured: STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES.filter(
      (eventType) => configured.has(eventType)
    ),
    optionalNotConfigured: STRIPE_OPTIONAL_WEBHOOK_EVENT_TYPES.filter(
      (eventType) => !configured.has(eventType)
    ),
  };
}

export function parseStripeWebhookEnabledEventsDocument(
  input: string
): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Stripe webhook endpoint evidence must be valid JSON.");
  }

  const enabledEvents = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? (parsed.enabled_events ?? parsed.enabledEvents)
      : null;
  if (
    !Array.isArray(enabledEvents) ||
    enabledEvents.some((eventType) => typeof eventType !== "string")
  ) {
    throw new Error(
      "Stripe webhook endpoint evidence must be an event array or an object with enabled_events."
    );
  }

  return enabledEvents;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function run(argv: string[]): void {
  if (
    argv.length === 0 ||
    (argv.length === 1 && argv[0] === "--format=markdown")
  ) {
    console.log(renderStripeWebhookEventContractMarkdown());
    return;
  }

  if (argv.length === 1 && argv[0] === "--format=json") {
    console.log(JSON.stringify(stripeWebhookEventContractJson(), null, 2));
    return;
  }

  const verificationArgument = argv.find((argument) =>
    argument.startsWith("--verify-enabled-events-file=")
  );
  if (argv.length === 1 && verificationArgument) {
    const evidencePath = verificationArgument.slice(
      "--verify-enabled-events-file=".length
    );
    if (!evidencePath) {
      throw new Error("An enabled-events evidence file path is required.");
    }
    const enabledEvents = parseStripeWebhookEnabledEventsDocument(
      readFileSync(evidencePath, "utf8")
    );
    const result = verifyStripeWebhookEnabledEvents(enabledEvents);
    console.log(
      `Stripe webhook event contract verified: ${STRIPE_REQUIRED_WEBHOOK_EVENT_TYPES.length} required; ${result.optionalConfigured.length} optional configured.`
    );
    return;
  }

  throw new Error(
    "Usage: stripe-webhook-event-contract [--format=markdown|--format=json|--verify-enabled-events-file=<path>]"
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Verification failed."
    );
    process.exitCode = 1;
  }
}
