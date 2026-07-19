import { BILLING_CATALOG } from "@meelni/core";

export const CHECKOUT_SUCCESS_CATALOG_IDS = [
  "interview_pass",
  "starter",
  "pro",
] as const;

const CHECKOUT_SUCCESS_ERROR_REASONS = [
  "not_found",
  "invalid_purchase",
  "payment_failed",
  "payment_reversed",
  "temporarily_unavailable",
] as const;

const REVERSAL_STATUSES = new Set([
  "partially_refunded",
  "refunded",
  "disputed",
]);

export type CheckoutSuccessCatalogId =
  (typeof CHECKOUT_SUCCESS_CATALOG_IDS)[number];

export interface CheckoutSettlementEvidence {
  checkoutSessionId: string | null;
  invoiceId: string | null;
  paymentUserId: string;
  status: string;
  creditGrantId: string | null;
  catalogId: string | null;
  grantId: string | null;
  grantUserId: string | null;
  grantCatalogId: string | null;
  grantSource: string | null;
  grantSourceId: string | null;
  grantOriginalCredits: number | null;
}

export type CheckoutSuccessPublicState =
  | {
      status: "pending";
      retryable: true;
    }
  | {
      status: "confirmed";
      purchase: "interview_pass" | "subscription";
    }
  | {
      status: "error";
      reason:
        | "not_found"
        | "invalid_purchase"
        | "payment_failed"
        | "payment_reversed"
        | "temporarily_unavailable";
      retryable: boolean;
    };

export function isCheckoutSessionId(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    /^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(value)
  );
}

/**
 * Resolve browser-visible Checkout state exclusively from webhook-persisted
 * first-party records. Provider reads belong to signed webhook handling, not
 * an authenticated read endpoint that accepts a browser correlation value.
 */
export function resolveCheckoutSettlement(input: {
  requestedSessionId: string;
  userId: string;
  evidence: readonly CheckoutSettlementEvidence[];
}): CheckoutSuccessPublicState {
  const { requestedSessionId, userId, evidence } = input;

  if (evidence.length === 0) return checkoutPending();

  if (
    evidence.some(
      (row) =>
        row.paymentUserId !== userId ||
        row.checkoutSessionId !== requestedSessionId
    )
  ) {
    return checkoutError("not_found", false);
  }

  // Provider reversal truth always outranks an earlier successful grant.
  if (evidence.some((row) => REVERSAL_STATUSES.has(row.status))) {
    return checkoutError("payment_reversed", false);
  }

  const succeeded = evidence.filter((row) => row.status === "succeeded");
  if (succeeded.length > 1) {
    return checkoutError("invalid_purchase", true);
  }

  if (succeeded.length === 1) {
    const [payment] = succeeded;
    const catalogId = parseCheckoutCatalogId(payment.catalogId);
    if (!catalogId || !hasMatchingGrant(payment, catalogId)) {
      return checkoutError("invalid_purchase", true);
    }

    return {
      status: "confirmed",
      purchase:
        catalogId === "interview_pass" ? "interview_pass" : "subscription",
    };
  }

  if (
    evidence.some((row) => row.status === "failed" || row.status === "canceled")
  ) {
    return checkoutError("payment_failed", true);
  }

  return checkoutPending();
}

export function isCheckoutSuccessPublicState(
  value: unknown
): value is CheckoutSuccessPublicState {
  if (!value || typeof value !== "object" || !("status" in value)) {
    return false;
  }
  const state = value as Record<string, unknown>;
  if (state.status === "pending") return state.retryable === true;
  if (state.status === "confirmed") {
    return (
      state.purchase === "interview_pass" || state.purchase === "subscription"
    );
  }
  return (
    state.status === "error" &&
    (CHECKOUT_SUCCESS_ERROR_REASONS as readonly unknown[]).includes(
      state.reason
    ) &&
    typeof state.retryable === "boolean"
  );
}

export function checkoutPending(): CheckoutSuccessPublicState {
  return { status: "pending", retryable: true };
}

export function checkoutError(
  reason: Extract<CheckoutSuccessPublicState, { status: "error" }>["reason"],
  retryable: boolean
): CheckoutSuccessPublicState {
  return { status: "error", reason, retryable };
}

function parseCheckoutCatalogId(
  value: string | null
): CheckoutSuccessCatalogId | null {
  return (CHECKOUT_SUCCESS_CATALOG_IDS as readonly string[]).includes(
    value ?? ""
  )
    ? (value as CheckoutSuccessCatalogId)
    : null;
}

function hasMatchingGrant(
  payment: CheckoutSettlementEvidence,
  catalogId: CheckoutSuccessCatalogId
): boolean {
  if (
    !payment.creditGrantId ||
    payment.grantId !== payment.creditGrantId ||
    payment.grantUserId !== payment.paymentUserId ||
    payment.grantCatalogId !== catalogId ||
    payment.grantOriginalCredits !== BILLING_CATALOG[catalogId].includedCredits
  ) {
    return false;
  }

  if (catalogId === "interview_pass") {
    return (
      payment.grantSource === "checkout" &&
      payment.grantSourceId === payment.checkoutSessionId
    );
  }

  return (
    payment.grantSource === "subscription_renewal" &&
    Boolean(payment.invoiceId) &&
    payment.grantSourceId === payment.invoiceId
  );
}
