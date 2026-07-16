import type Stripe from "stripe";

import { fingerprintStripeSubject } from "./stripe-privacy";

export interface CheckoutSessionReference {
  id: string;
  url: string | null;
}

export async function obtainCheckoutSessionUnlessDeleting<
  T extends CheckoutSessionReference,
>(input: {
  hasDeletionTombstone(): Promise<boolean>;
  obtainSession(): Promise<T>;
  expireSession(sessionId: string, idempotencyKey: string): Promise<void>;
}): Promise<
  | { allowed: true; session: T }
  | { allowed: false; stage: "before_provider" | "after_provider" }
> {
  if (await input.hasDeletionTombstone()) {
    return { allowed: false, stage: "before_provider" };
  }

  const session = await input.obtainSession();
  if (!(await input.hasDeletionTombstone())) {
    return { allowed: true, session };
  }

  try {
    await input.expireSession(
      session.id,
      deletedBillingIdempotencyKey(session.id, "expire")
    );
  } catch {
    throw safeCheckoutDeletionError("deleted_checkout_expiry_failed");
  }
  return { allowed: false, stage: "after_provider" };
}

export function checkoutSessionAuthenticatedUserId(
  session: Pick<Stripe.Checkout.Session, "client_reference_id" | "metadata">
): string | null {
  const metadataUserId = session.metadata?.userId;
  const clientReferenceId = session.client_reference_id;
  if (
    !metadataUserId ||
    !clientReferenceId ||
    metadataUserId !== clientReferenceId
  ) {
    return null;
  }
  return metadataUserId;
}

export function stripeEventMetadataUserId(event: Stripe.Event): string | null {
  const object = event.data.object as unknown;
  if (!object || typeof object !== "object") return null;
  const record = object as Record<string, unknown>;
  const directUserId = metadataUserId(record.metadata);
  if (directUserId) return directUserId;

  const parent = objectRecord(record.parent);
  const subscriptionDetails = objectRecord(parent?.subscription_details);
  return metadataUserId(subscriptionDetails?.metadata);
}

export interface DeletedCheckoutReconciliationDeps {
  expireCheckout(
    checkoutSessionId: string,
    idempotencyKey: string
  ): Promise<void>;
  cancelSubscription(
    subscriptionId: string,
    idempotencyKey: string
  ): Promise<void>;
}

export async function reconcileDeletedCheckoutSession(
  session: Pick<
    Stripe.Checkout.Session,
    | "id"
    | "status"
    | "payment_status"
    | "payment_intent"
    | "invoice"
    | "subscription"
  >,
  deps: DeletedCheckoutReconciliationDeps
): Promise<{
  status: "expired" | "reconciled";
  subscriptionCanceled: boolean;
  paymentRefunded: boolean;
}> {
  if (session.status === "open") {
    await callSafely(() =>
      deps.expireCheckout(
        session.id,
        deletedBillingIdempotencyKey(session.id, "expire")
      )
    );
    return {
      status: "expired",
      subscriptionCanceled: false,
      paymentRefunded: false,
    };
  }

  const subscriptionId = providerId(session.subscription);
  if (subscriptionId) {
    await callSafely(() =>
      deps.cancelSubscription(
        subscriptionId,
        deletedBillingIdempotencyKey(subscriptionId, "cancel")
      )
    );
  }

  return {
    status: "reconciled",
    subscriptionCanceled: Boolean(subscriptionId),
    paymentRefunded: false,
  };
}

export function checkoutReconciliationErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code.startsWith("stripe_invoice_payment_")) {
      return "deleted_checkout_manual_reconciliation_required";
    }
    if (
      code === "deleted_checkout_expiry_failed" ||
      code === "deleted_checkout_reconciliation_failed" ||
      code === "deleted_checkout_manual_reconciliation_required" ||
      code === "deleted_subscription_reconciliation_failed" ||
      code === "deleted_subscription_manual_reconciliation_required" ||
      code === "deleted_invoice_reconciliation_failed" ||
      code === "deleted_invoice_manual_reconciliation_required" ||
      code === "deleted_customer_cleanup_failed" ||
      code === "deleted_billing_reconciliation_failed"
    ) {
      return code;
    }
  }
  return "deleted_checkout_reconciliation_failed";
}

export function deletedBillingIdempotencyKey(
  providerId: string,
  operation: "cancel" | "delete" | "expire"
) {
  const fingerprint = fingerprintStripeSubject(providerId);
  if (!fingerprint) {
    throw safeCheckoutDeletionError("deleted_checkout_reconciliation_failed");
  }
  return `account-deletion:${operation}:${fingerprint}`;
}

function metadataUserId(value: unknown) {
  const metadata = objectRecord(value);
  const userId = metadata?.userId;
  return typeof userId === "string" && userId ? userId : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function providerId(
  value:
    | string
    | { id: string }
    | Stripe.DeletedCustomer
    | Stripe.DeletedInvoice
    | null
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function callSafely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw safeCheckoutDeletionError(checkoutReconciliationErrorCode(error));
  }
}

function safeCheckoutDeletionError(code: string): Error & { code: string } {
  return Object.assign(new Error("Deleted checkout reconciliation failed"), {
    code,
  });
}
