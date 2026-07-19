import { isCanonicalAccountUserId } from "./account-deletion-guard";

export const CHECKOUT_PAYMENT_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
] as const;

export type CheckoutPaymentEventType =
  (typeof CHECKOUT_PAYMENT_EVENT_TYPES)[number];

export type CheckoutFulfillmentTrigger = Exclude<
  CheckoutPaymentEventType,
  "checkout.session.async_payment_failed"
>;

export interface AuthoritativeCheckoutLineItem {
  priceId: string | null;
  quantity: number | null;
  currency: string | null;
}

export interface AuthoritativeCheckoutSession {
  id: string;
  status: string | null;
  paymentStatus: string;
  mode: string;
  clientReferenceId: string | null;
  metadata: Record<string, string> | null;
  customerId: string | null;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  lineItems: {
    data: AuthoritativeCheckoutLineItem[];
    hasMore: boolean;
  };
}

export interface InterviewPassGrantInput {
  userId: string;
  catalogId: "interview_pass";
  source: "checkout";
  sourceId: string;
  idempotencyKey: string;
}

export interface CheckoutFulfillmentDependencies {
  retrieveSession(sessionId: string): Promise<AuthoritativeCheckoutSession>;
  claimCustomerOwnership(input: {
    customerId: string;
    userId: string;
  }): Promise<void>;
  hasDeletionTombstone(userId: string): Promise<boolean>;
  grantInterviewPass(
    input: InterviewPassGrantInput
  ): Promise<{ grantId: string }>;
}

export interface FulfillInterviewPassCheckoutInput {
  eventType: CheckoutPaymentEventType;
  sessionId: string;
  expectedPriceId: string;
}

export type CheckoutFulfillmentResult =
  | {
      status: "fulfilled";
      sessionId: string;
      userId: string;
      grantId: string;
      idempotencyKey: string;
      paymentIntentId: string;
      amountInCents: number;
      currency: "usd";
    }
  | {
      status: "pending_payment";
      sessionId: string;
      userId: string;
    }
  | {
      status: "payment_failed";
      sessionId: string;
      userId: string;
      amountInCents: number;
      currency: "usd";
    }
  | {
      status: "account_deletion_pending";
      sessionId: string;
      userId: string;
    };

export const CHECKOUT_FULFILLMENT_ERROR_CODES = {
  sessionMismatch: "stripe_checkout_session_mismatch",
  sessionStatusInvalid: "stripe_checkout_session_status_invalid",
  modeInvalid: "stripe_checkout_mode_invalid",
  ownerInvalid: "stripe_checkout_owner_invalid",
  ownerMismatch: "stripe_checkout_owner_mismatch",
  catalogInvalid: "stripe_checkout_catalog_invalid",
  lineItemsIncomplete: "stripe_checkout_line_items_incomplete",
  lineItemInvalid: "stripe_checkout_line_item_invalid",
  currencyInvalid: "stripe_checkout_currency_invalid",
  paymentNotPaid: "stripe_checkout_payment_not_paid",
  paymentReferenceMissing: "stripe_checkout_payment_reference_missing",
  paymentAmountInvalid: "stripe_checkout_payment_amount_invalid",
} as const;

export type CheckoutFulfillmentErrorCode =
  (typeof CHECKOUT_FULFILLMENT_ERROR_CODES)[keyof typeof CHECKOUT_FULFILLMENT_ERROR_CODES];

export class CheckoutFulfillmentError extends Error {
  readonly code: CheckoutFulfillmentErrorCode;

  constructor(code: CheckoutFulfillmentErrorCode) {
    super("Stripe Checkout fulfillment failed");
    this.name = "CheckoutFulfillmentError";
    this.code = code;
  }
}

export function isCheckoutPaymentEventType(
  value: string
): value is CheckoutPaymentEventType {
  return (CHECKOUT_PAYMENT_EVENT_TYPES as readonly string[]).includes(value);
}

export function isCheckoutFulfillmentTrigger(
  value: string
): value is CheckoutFulfillmentTrigger {
  return (
    value === "checkout.session.completed" ||
    value === "checkout.session.async_payment_succeeded"
  );
}

export function isCheckoutFulfillmentError(
  error: unknown
): error is CheckoutFulfillmentError {
  return error instanceof CheckoutFulfillmentError;
}

export async function fulfillInterviewPassCheckout(
  input: FulfillInterviewPassCheckoutInput,
  deps: CheckoutFulfillmentDependencies
): Promise<CheckoutFulfillmentResult> {
  const session = await deps.retrieveSession(input.sessionId);
  assertAuthoritativeSession(session, input);

  const userId = session.metadata?.userId;
  if (!userId) {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.ownerInvalid);
  }

  if (input.eventType === "checkout.session.async_payment_failed") {
    if (session.customerId) {
      try {
        await deps.claimCustomerOwnership({
          customerId: session.customerId,
          userId,
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "stripe_subject_owner_mismatch"
        ) {
          throw fulfillmentError(
            CHECKOUT_FULFILLMENT_ERROR_CODES.ownerMismatch
          );
        }
        throw error;
      }
    }
    if (await deps.hasDeletionTombstone(userId)) {
      return {
        status: "account_deletion_pending",
        sessionId: session.id,
        userId,
      };
    }
    // A delayed failure can arrive after provider truth has already advanced
    // to paid. Never materialize stale failure truth in that case.
    if (session.paymentStatus === "paid") {
      return { status: "pending_payment", sessionId: session.id, userId };
    }
    if (session.paymentStatus !== "unpaid") {
      throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.paymentNotPaid);
    }
    if (
      session.amountTotal === null ||
      !Number.isSafeInteger(session.amountTotal) ||
      session.amountTotal < 0
    ) {
      throw fulfillmentError(
        CHECKOUT_FULFILLMENT_ERROR_CODES.paymentAmountInvalid
      );
    }
    return {
      status: "payment_failed",
      sessionId: session.id,
      userId,
      amountInCents: session.amountTotal,
      currency: "usd",
    };
  }

  if (session.paymentStatus === "unpaid") {
    if (input.eventType === "checkout.session.async_payment_succeeded") {
      throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.paymentNotPaid);
    }
    return { status: "pending_payment", sessionId: session.id, userId };
  }

  if (session.paymentStatus !== "paid") {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.paymentNotPaid);
  }
  if (!session.paymentIntentId) {
    throw fulfillmentError(
      CHECKOUT_FULFILLMENT_ERROR_CODES.paymentReferenceMissing
    );
  }
  if (
    session.amountTotal === null ||
    !Number.isSafeInteger(session.amountTotal) ||
    session.amountTotal < 0
  ) {
    throw fulfillmentError(
      CHECKOUT_FULFILLMENT_ERROR_CODES.paymentAmountInvalid
    );
  }

  if (session.customerId) {
    try {
      await deps.claimCustomerOwnership({
        customerId: session.customerId,
        userId,
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "stripe_subject_owner_mismatch"
      ) {
        throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.ownerMismatch);
      }
      throw error;
    }
  }

  if (await deps.hasDeletionTombstone(userId)) {
    return {
      status: "account_deletion_pending",
      sessionId: session.id,
      userId,
    };
  }

  const idempotencyKey = `stripe:checkout:${session.id}:interview_pass`;
  const { grantId } = await deps.grantInterviewPass({
    userId,
    catalogId: "interview_pass",
    source: "checkout",
    sourceId: session.id,
    idempotencyKey,
  });

  return {
    status: "fulfilled",
    sessionId: session.id,
    userId,
    grantId,
    idempotencyKey,
    paymentIntentId: session.paymentIntentId,
    amountInCents: session.amountTotal,
    currency: "usd",
  };
}

function assertAuthoritativeSession(
  session: AuthoritativeCheckoutSession,
  input: FulfillInterviewPassCheckoutInput
): void {
  if (!session.id || session.id !== input.sessionId) {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.sessionMismatch);
  }
  if (session.status !== "complete") {
    throw fulfillmentError(
      CHECKOUT_FULFILLMENT_ERROR_CODES.sessionStatusInvalid
    );
  }
  if (session.mode !== "payment") {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.modeInvalid);
  }

  const metadataUserId = session.metadata?.userId;
  if (
    !metadataUserId ||
    !session.clientReferenceId ||
    !isCanonicalAccountUserId(metadataUserId) ||
    !isCanonicalAccountUserId(session.clientReferenceId) ||
    metadataUserId !== session.clientReferenceId
  ) {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.ownerInvalid);
  }
  if (session.metadata?.catalogId !== "interview_pass") {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.catalogInvalid);
  }

  if (session.lineItems.hasMore) {
    throw fulfillmentError(
      CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemsIncomplete
    );
  }
  if (session.lineItems.data.length !== 1) {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid);
  }

  const [lineItem] = session.lineItems.data;
  if (
    !lineItem ||
    lineItem.priceId !== input.expectedPriceId ||
    lineItem.quantity !== 1
  ) {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.lineItemInvalid);
  }
  if (session.currency !== "usd" || lineItem.currency !== "usd") {
    throw fulfillmentError(CHECKOUT_FULFILLMENT_ERROR_CODES.currencyInvalid);
  }
}

function fulfillmentError(
  code: CheckoutFulfillmentErrorCode
): CheckoutFulfillmentError {
  return new CheckoutFulfillmentError(code);
}
