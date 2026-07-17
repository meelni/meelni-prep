import type Stripe from "stripe";

const MAX_INVOICE_LINE_PAGES = 10;
const INVOICE_LINE_PAGE_SIZE = 100;

type LegacyInvoice = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

type LegacyInvoiceLine = Stripe.InvoiceLineItem & {
  price?: string | Stripe.Price | null;
  proration?: boolean | null;
};

export type PaidSubscriptionServicePeriod = {
  periodEnd: Date;
  periodStart: Date;
  priceId: string;
};

/**
 * The embedded invoice line list is only a first page. Fetch the authoritative
 * list before making an entitlement decision when Stripe says more lines exist.
 */
export async function loadCompleteStripeInvoiceLines(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<Stripe.InvoiceLineItem[]> {
  if (!invoice.lines.has_more) return [...invoice.lines.data];

  const lines: Stripe.InvoiceLineItem[] = [];
  const seenLineIds = new Set<string>();
  let startingAfter: string | undefined;

  for (let pageIndex = 0; pageIndex < MAX_INVOICE_LINE_PAGES; pageIndex += 1) {
    const page = await stripe.invoices.listLineItems(invoice.id, {
      limit: INVOICE_LINE_PAGE_SIZE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (
      !Array.isArray(page.data) ||
      page.data.length === 0 ||
      page.data.length > INVOICE_LINE_PAGE_SIZE
    ) {
      throw invoiceLineEvidenceError();
    }
    for (const line of page.data) {
      if (!line.id || seenLineIds.has(line.id)) {
        throw invoiceLineEvidenceError();
      }
      seenLineIds.add(line.id);
      lines.push(line);
    }
    if (!page.has_more) return lines;
    startingAfter = page.data.at(-1)?.id;
    if (!startingAfter) throw invoiceLineEvidenceError();
  }

  throw invoiceLineEvidenceError();
}

/**
 * Select the recurring subscription line that represents the paid service.
 * Modern Stripe invoices can have a zero-length top-level invoice period, so
 * subscription credit fulfillment must use the non-proration line period.
 */
export function selectPaidSubscriptionServicePeriod(
  invoice: Stripe.Invoice,
  recurringPriceIds: readonly string[],
  lines: readonly Stripe.InvoiceLineItem[] = invoice.lines.data
): PaidSubscriptionServicePeriod | null {
  const supportedPrices = new Set(recurringPriceIds);
  const invoiceSubscription = invoiceSubscriptionIdentity(invoice);
  if (!invoiceSubscription.valid || !invoiceSubscription.id) return null;

  const candidateLines = lines.map((line) => ({
    association: subscriptionAssociation(line, invoiceSubscription.id),
    line,
    price: linePriceIdentity(line),
  }));
  if (candidateLines.some(({ price }) => !price.valid)) return null;

  const supportedLines = candidateLines.filter(
    ({ price }) => price.id && supportedPrices.has(price.id)
  );
  if (supportedLines.some(({ association }) => association === "mismatched")) {
    return null;
  }

  const entitlementLines = supportedLines.filter(
    ({ association }) => association !== "proration"
  );

  const matchingLines = entitlementLines.filter(
    ({ association }) => association === "matching"
  );
  if (matchingLines.length === 1) {
    const candidate = matchingLines[0]!;
    const period = normalizePeriod(candidate.line.period);
    return period && candidate.price.id
      ? { ...period, priceId: candidate.price.id }
      : null;
  }
  if (matchingLines.length > 1) return null;

  // Compatibility for payloads and fixtures without subscription association.
  // The invoice period is safe only for one unassociated supported line and no
  // contradictory supported line.
  const unassociatedLines = entitlementLines.filter(
    ({ association }) => association === "unassociated"
  );
  if (
    unassociatedLines.length !== 1 ||
    unassociatedLines.length !== entitlementLines.length
  ) {
    return null;
  }
  const period = normalizePeriod({
    start: invoice.period_start,
    end: invoice.period_end,
  });
  const priceId = unassociatedLines[0]!.price.id;
  return period && priceId ? { ...period, priceId } : null;
}

/**
 * Payment history may retain a catalog classification even when an invoice is
 * not an entitlement renewal. Ambiguous or contradictory prices intentionally
 * produce no classification instead of blocking payment-truth persistence.
 */
export function selectUniqueSupportedStripeInvoicePriceId(
  lines: readonly Stripe.InvoiceLineItem[],
  recurringPriceIds: readonly string[]
): string | null {
  const supportedPrices = new Set(recurringPriceIds);
  const candidates = new Set<string>();
  for (const line of lines) {
    const price = linePriceIdentity(line);
    if (!price.valid) return null;
    if (price.id && supportedPrices.has(price.id)) candidates.add(price.id);
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}

export function getStripeInvoiceSubscriptionId(
  invoice: Stripe.Invoice
): string | null {
  const identity = invoiceSubscriptionIdentity(invoice);
  return identity.valid ? identity.id : null;
}

function subscriptionAssociation(
  line: Stripe.InvoiceLineItem,
  invoiceSubscriptionId: string | null
): "matching" | "mismatched" | "proration" | "unassociated" {
  const legacyLine = line as LegacyInvoiceLine;
  const subscriptionItemDetails =
    line.parent?.type === "subscription_item_details"
      ? line.parent.subscription_item_details
      : null;
  const invoiceItemDetails =
    line.parent?.type === "invoice_item_details"
      ? line.parent.invoice_item_details
      : null;
  const parentDetails = subscriptionItemDetails ?? invoiceItemDetails;
  const modernProration = parentDetails?.proration;
  if (
    typeof modernProration === "boolean" &&
    typeof legacyLine.proration === "boolean" &&
    modernProration !== legacyLine.proration
  ) {
    return "mismatched";
  }
  if (invoiceItemDetails) return "mismatched";

  const parentSubscriptionId = getProviderId(parentDetails?.subscription);
  const lineSubscriptionId = getProviderId(line.subscription);
  if (
    parentSubscriptionId &&
    lineSubscriptionId &&
    parentSubscriptionId !== lineSubscriptionId
  ) {
    return "mismatched";
  }
  const subscriptionId = parentSubscriptionId ?? lineSubscriptionId;
  if (subscriptionId) {
    if (!invoiceSubscriptionId || subscriptionId !== invoiceSubscriptionId) {
      return "mismatched";
    }
    return modernProration === true || legacyLine.proration === true
      ? "proration"
      : "matching";
  }
  if (line.parent) return "mismatched";
  return modernProration === true || legacyLine.proration === true
    ? "proration"
    : "unassociated";
}

function invoiceSubscriptionIdentity(invoice: Stripe.Invoice): {
  id: string | null;
  valid: boolean;
} {
  const modernId = getProviderId(
    invoice.parent?.subscription_details?.subscription
  );
  const legacyId = getProviderId((invoice as LegacyInvoice).subscription);
  return modernId && legacyId && modernId !== legacyId
    ? { id: null, valid: false }
    : { id: modernId ?? legacyId, valid: true };
}

function linePriceIdentity(line: Stripe.InvoiceLineItem): {
  id: string | null;
  valid: boolean;
} {
  const modernId = line.pricing?.price_details?.price ?? null;
  const legacyId = getProviderId((line as LegacyInvoiceLine).price);
  return modernId && legacyId && modernId !== legacyId
    ? { id: null, valid: false }
    : { id: modernId ?? legacyId, valid: true };
}

function normalizePeriod(
  period: { end: number; start: number } | null | undefined
): Pick<PaidSubscriptionServicePeriod, "periodEnd" | "periodStart"> | null {
  if (
    !period ||
    !Number.isSafeInteger(period.start) ||
    !Number.isSafeInteger(period.end) ||
    period.start <= 0 ||
    period.end <= period.start
  ) {
    return null;
  }
  const periodStart = new Date(period.start * 1000);
  const periodEnd = new Date(period.end * 1000);
  return Number.isFinite(periodStart.getTime()) &&
    Number.isFinite(periodEnd.getTime())
    ? { periodEnd, periodStart }
    : null;
}

function getProviderId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoiceLineEvidenceError(): Error & { code: string } {
  return Object.assign(
    new Error("Stripe invoice line evidence is incomplete"),
    {
      code: "stripe_invoice_line_evidence_incomplete",
    }
  );
}
