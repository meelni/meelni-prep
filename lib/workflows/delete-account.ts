import type { AccountDeletionRecord } from "@/lib/db/account-deletions";

export interface DeleteAccountWorkflowDeps {
  cancelSubscription(subscriptionId: string): Promise<void>;
  refundInvoice(invoiceId: string): Promise<string[]>;
  refundPayment(
    kind: "charge" | "payment_intent",
    providerId: string
  ): Promise<void>;
  deleteCustomer(customerId: string): Promise<void>;
  redactProviderLogs(request: AccountDeletionRecord): Promise<void>;
  deleteApplicationData(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  markCompleted(userId: string, processedFingerprints: string[]): Promise<void>;
}

export async function deleteAccountWorkflow(
  request: AccountDeletionRecord,
  deps: DeleteAccountWorkflowDeps
) {
  if (
    request.status === "completed" &&
    request.stripeSubjects.every(({ providerId }) => providerId === null)
  ) {
    return { alreadyCompleted: true };
  }

  // Local privacy cleanup does not wait on an external provider. The durable
  // tombstone keeps every provider reference required for later retries.
  await deps.redactProviderLogs(request);
  await deps.deleteApplicationData(request.userId);
  await deps.deleteAuthUser(request.userId);

  const pendingSubjects = request.stripeSubjects.filter(
    (subject): subject is typeof subject & { providerId: string } =>
      subject.providerId !== null
  );
  const processedFingerprints = new Set(
    request.stripeSubjects.map(({ fingerprint }) => fingerprint)
  );
  for (const subject of pendingSubjects) {
    if (subject.kind === "subscription") {
      await deps.cancelSubscription(subject.providerId);
    }
  }
  for (const subject of pendingSubjects) {
    if (subject.kind === "charge" || subject.kind === "payment_intent") {
      await deps.refundPayment(subject.kind, subject.providerId);
    }
  }
  for (const subject of pendingSubjects) {
    if (subject.kind === "invoice") {
      for (const fingerprint of await deps.refundInvoice(subject.providerId)) {
        processedFingerprints.add(fingerprint);
      }
    }
  }
  // Customer deletion is deliberately last: cancellation and every known
  // refundable payment must reconcile before the provider identity disappears.
  for (const subject of pendingSubjects) {
    if (subject.kind === "customer") {
      await deps.deleteCustomer(subject.providerId);
    }
  }
  await deps.markCompleted(request.userId, [...processedFingerprints]);
  return { alreadyCompleted: false };
}

export function isAlreadyDeletedProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const status = "status" in error ? Number(error.status) : 0;
  return (
    code === "resource_missing" || code === "user_not_found" || status === 404
  );
}

export function accountDeletionFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (
      code === "stripe_provider_error" ||
      code === "auth_provider_error" ||
      code === "account_deletion_step_failed" ||
      code === "account_deletion_state_update_failed" ||
      code === "account_deletion_tombstone_missing"
    ) {
      return code;
    }
    if (code.startsWith("stripe")) return "stripe_provider_error";
    if (code.startsWith("auth") || code === "unexpected_failure") {
      return "auth_provider_error";
    }
  }
  return "account_deletion_step_failed";
}

export function safeAccountDeletionError(
  error: unknown,
  fallbackCode?: string
): Error & { code: string } {
  const code = fallbackCode ?? accountDeletionFailureCode(error);
  return Object.assign(new Error("Account deletion step failed"), { code });
}

export async function runSafeAccountDeletionStep<T>(
  operation: () => Promise<T>,
  fallbackCode?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw safeAccountDeletionError(error, fallbackCode);
  }
}
