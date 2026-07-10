import { createHash } from "node:crypto";

import type Stripe from "stripe";

import { ensureStripeInvoicePaymentAllocationRefunded } from "./stripe-refund-reconciliation";

const MAX_INVOICE_PAYMENT_PAGES = 10;
const INVOICE_PAYMENT_PAGE_SIZE = 100;

export type StripeInvoicePaymentAllocation = {
  allocationAmount: number;
  allocationFingerprint: string;
  invoicePaymentId: string;
  kind: "charge" | "payment_intent";
  providerId: string;
};

export async function loadStripeInvoicePaymentAllocations(
  stripe: Stripe,
  invoice: Pick<Stripe.Invoice, "amount_paid" | "currency" | "id">
): Promise<StripeInvoicePaymentAllocation[]> {
  assertNonnegativeAmount(invoice.amount_paid);
  const allocations: StripeInvoicePaymentAllocation[] = [];
  let startingAfter: string | undefined;

  for (
    let pageIndex = 0;
    pageIndex < MAX_INVOICE_PAYMENT_PAGES;
    pageIndex += 1
  ) {
    const page = await stripe.invoicePayments.list({
      invoice: invoice.id,
      limit: INVOICE_PAYMENT_PAGE_SIZE,
      status: "paid",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const payment of page.data) {
      allocations.push(toAllocation(payment, invoice.currency));
    }
    if (!page.has_more) {
      assertAllocationTotal(invoice.amount_paid, allocations);
      return allocations;
    }
    const lastId = page.data.at(-1)?.id;
    if (!lastId) throw invoicePaymentEvidenceError();
    startingAfter = lastId;
  }

  throw invoicePaymentEvidenceError();
}

export async function refundStripeInvoicePaymentAllocations(
  stripe: Stripe,
  allocations: StripeInvoicePaymentAllocation[]
) {
  for (const allocation of allocations) {
    await ensureStripeInvoicePaymentAllocationRefunded(stripe, {
      allocationAmount: allocation.allocationAmount,
      allocationFingerprint: allocation.allocationFingerprint,
      kind: allocation.kind,
      providerId: allocation.providerId,
      baseIdempotencyKey: invoicePaymentRefundKey(allocation),
    });
  }
}

function toAllocation(
  payment: Stripe.InvoicePayment,
  invoiceCurrency: string
): StripeInvoicePaymentAllocation {
  if (
    payment.status !== "paid" ||
    payment.currency !== invoiceCurrency ||
    typeof payment.amount_paid !== "number" ||
    payment.amount_paid <= 0
  ) {
    throw invoicePaymentEvidenceError();
  }
  assertNonnegativeAmount(payment.amount_paid);
  if (payment.payment.type === "payment_record") {
    throw invoicePaymentManualReconciliationError();
  }

  const kind = payment.payment.type;
  const providerId =
    kind === "payment_intent"
      ? getProviderId(payment.payment.payment_intent)
      : getProviderId(payment.payment.charge);
  const requiredPrefix = kind === "payment_intent" ? "pi_" : "ch_";
  if (!providerId?.startsWith(requiredPrefix)) {
    throw invoicePaymentEvidenceError();
  }

  return {
    allocationAmount: payment.amount_paid,
    allocationFingerprint: fingerprint(payment.id),
    invoicePaymentId: payment.id,
    kind,
    providerId,
  };
}

function assertAllocationTotal(
  invoiceAmountPaid: number,
  allocations: StripeInvoicePaymentAllocation[]
) {
  let total = 0;
  for (const allocation of allocations) {
    if (total > Number.MAX_SAFE_INTEGER - allocation.allocationAmount) {
      throw invoicePaymentEvidenceError();
    }
    total += allocation.allocationAmount;
  }
  if (total !== invoiceAmountPaid) throw invoicePaymentEvidenceError();
}

function assertNonnegativeAmount(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw invoicePaymentEvidenceError();
  }
}

function invoicePaymentRefundKey(allocation: StripeInvoicePaymentAllocation) {
  return `account-deletion:invoice-payment-refund:${fingerprint(
    `${allocation.invoicePaymentId}:${allocation.providerId}`
  )}`;
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getProviderId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoicePaymentEvidenceError(): Error & { code: string } {
  return Object.assign(
    new Error("Stripe invoice payment evidence is invalid"),
    {
      code: "stripe_invoice_payment_evidence_invalid",
    }
  );
}

function invoicePaymentManualReconciliationError(): Error & { code: string } {
  return Object.assign(
    new Error("Stripe invoice payment requires manual reconciliation"),
    { code: "stripe_invoice_payment_manual_reconciliation_required" }
  );
}
