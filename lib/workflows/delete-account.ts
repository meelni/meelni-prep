import type { AccountDeletionRecord } from "@/lib/db/account-deletions";

export interface DeleteAccountWorkflowDeps {
  cancelSubscription(subscriptionId: string): Promise<void>;
  deleteCustomer(customerId: string): Promise<void>;
  redactProviderLogs(request: AccountDeletionRecord): Promise<void>;
  deleteApplicationData(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  markCompleted(userId: string): Promise<void>;
}

export async function deleteAccountWorkflow(
  request: AccountDeletionRecord,
  deps: DeleteAccountWorkflowDeps
) {
  if (request.status === "completed") return { alreadyCompleted: true };

  await deps.deleteAuthUser(request.userId);
  for (const subject of request.stripeSubjects) {
    if (!subject.providerId) continue;
    if (subject.kind === "subscription") {
      await deps.cancelSubscription(subject.providerId);
    } else {
      await deps.deleteCustomer(subject.providerId);
    }
  }
  await deps.redactProviderLogs(request);

  // The durable tombstone survives this application-data transaction. If an
  // external provider fails, the retry resumes without allowing user recreation.
  await deps.deleteApplicationData(request.userId);
  await deps.markCompleted(request.userId);
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
