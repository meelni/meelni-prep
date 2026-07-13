import { deletedBillingIdempotencyKey } from "@/lib/billing/account-deletion-guard";
import type {
  AccountDeletionRecord,
  ProcessedLiveKitDeletionRoom,
} from "@/lib/db/account-deletions";

export interface AccountDeletionSubscriptionCancellation {
  prorate: false;
  idempotencyKey: string;
}

export interface DeleteAccountWorkflowDeps {
  cancelSubscription(
    subscriptionId: string,
    cancellation: AccountDeletionSubscriptionCancellation
  ): Promise<void>;
  deleteCustomer(customerId: string): Promise<void>;
  terminateLiveKitRoom(
    roomName: string
  ): Promise<{ disposition: "deleted" | "already_absent" }>;
  redactProviderLogs(request: AccountDeletionRecord): Promise<void>;
  deleteApplicationData(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
  markCompleted(
    userId: string,
    processedFingerprints: string[],
    processedLiveKitRooms: ProcessedLiveKitDeletionRoom[]
  ): Promise<void>;
  isProvisioningLeaseExpired(
    userId: string,
    room: ProcessedLiveKitDeletionRoom
  ): Promise<boolean>;
}

export async function deleteAccountWorkflow(
  request: AccountDeletionRecord,
  deps: DeleteAccountWorkflowDeps
) {
  if (
    request.status === "completed" &&
    request.stripeSubjects.every(({ providerId }) => providerId === null) &&
    request.livekitRooms.every(({ roomName }) => roomName === null)
  ) {
    return { alreadyCompleted: true, retryAt: null };
  }

  // Local privacy cleanup does not wait on an external provider. The durable
  // tombstone keeps every provider reference required for later retries.
  await deps.redactProviderLogs(request);
  await deps.deleteApplicationData(request.userId);
  await deps.deleteAuthUser(request.userId);

  const pendingRooms = request.livekitRooms.filter(
    (room): room is typeof room & { roomName: string } => room.roomName !== null
  );
  const processedLiveKitRooms: ProcessedLiveKitDeletionRoom[] = [];
  const retainedProvisioningExpiries: string[] = [];
  for (const room of pendingRooms) {
    const result = await deps.terminateLiveKitRoom(room.roomName);
    // A missing room is normally an idempotent success. A provisioning target
    // is different: the create call may still commit after this lookup, so its
    // raw subject must survive until start either advances the generation or a
    // later cleanup actually terminates the room.
    const roomIdentity = {
      fingerprint: room.fingerprint,
      generation: room.generation,
    };
    const terminated = result.disposition === "deleted";
    const provisioningLeaseExpired =
      room.provisioning &&
      !terminated &&
      (await deps.isProvisioningLeaseExpired(request.userId, roomIdentity));
    if (terminated || !room.provisioning || provisioningLeaseExpired) {
      processedLiveKitRooms.push(roomIdentity);
    } else if (room.provisioningExpiresAt !== null) {
      retainedProvisioningExpiries.push(room.provisioningExpiresAt);
    }
  }

  const pendingSubjects = request.stripeSubjects.filter(
    (subject): subject is typeof subject & { providerId: string } =>
      subject.providerId !== null
  );
  const processedFingerprints = new Set(
    request.stripeSubjects.map(({ fingerprint }) => fingerprint)
  );
  for (const subject of pendingSubjects) {
    if (subject.kind === "subscription") {
      await deps.cancelSubscription(subject.providerId, {
        prorate: false,
        idempotencyKey: deletedBillingIdempotencyKey(
          subject.providerId,
          "cancel"
        ),
      });
    }
  }
  // Accepted deletion policy never compensates automatically. Historical
  // invoice and payment records remain subject to Stripe/legal retention; an
  // exceptional refund is a separate manual support decision.
  // Customer deletion remains last so the subscription is canceled first.
  for (const subject of pendingSubjects) {
    if (subject.kind === "customer") {
      await deps.deleteCustomer(subject.providerId);
    }
  }
  await deps.markCompleted(
    request.userId,
    [...processedFingerprints],
    processedLiveKitRooms
  );
  return {
    alreadyCompleted: false,
    retryAt: retainedProvisioningExpiries.sort()[0] ?? null,
  };
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
      code === "livekit_provider_error" ||
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
