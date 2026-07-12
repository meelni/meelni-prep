import Stripe from "stripe";
import {
  createLiveKitInterviewProvider,
  getLiveKitEnvironment,
} from "@meelni/integrations";
import { deletedBillingIdempotencyKey } from "@/lib/billing/account-deletion-guard";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import {
  deleteUserApplicationData,
  getAccountDeletionRequest,
  listRecoverableAccountDeletions,
  markAccountDeletionCompleted,
  markAccountDeletionFailed,
  markAccountDeletionProcessing,
  redactStripeEventLogs,
} from "@/lib/db/account-deletions";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountDeletionFailureCode,
  deleteAccountWorkflow,
  isAlreadyDeletedProviderError,
  runSafeAccountDeletionStep,
  safeAccountDeletionError,
} from "@/lib/workflows/delete-account";

export const deleteAccount = inngest.createFunction(
  {
    id: "account-deletion",
    name: "Delete Account",
    retries: 5,
    concurrency: [{ limit: 1, key: "event.data.userId" }],
  },
  { event: "account/deletion.requested" },
  async ({ event, step }) => {
    const userId = String(event.data.userId);
    // Keep raw provider IDs out of persisted Inngest step output/history.
    let request: Awaited<ReturnType<typeof getAccountDeletionRequest>>;
    try {
      request = await getAccountDeletionRequest(userId);
    } catch (error) {
      throw safeAccountDeletionError(error);
    }
    if (!request) {
      throw safeAccountDeletionError(
        null,
        "account_deletion_tombstone_missing"
      );
    }
    if (
      request.status === "completed" &&
      request.stripeSubjects.every(({ providerId }) => providerId === null) &&
      request.livekitRooms.every(({ roomName }) => roomName === null)
    ) {
      return { status: "completed" };
    }

    await step.run("mark-processing", () =>
      runSafeAccountDeletionStep(
        () => markAccountDeletionProcessing(userId),
        "account_deletion_state_update_failed"
      )
    );
    // Mark-processing upgrades legacy provisioning subjects with a persisted
    // database-clock lease. Re-read so this attempt cannot retain a null-expiry
    // target forever or invent an app-clock deadline.
    try {
      request = await getAccountDeletionRequest(userId);
    } catch (error) {
      throw safeAccountDeletionError(error);
    }
    if (!request) {
      throw safeAccountDeletionError(
        null,
        "account_deletion_tombstone_missing"
      );
    }

    try {
      const cleanup = await step.run("delete-account-providers-and-data", () =>
        runSafeAccountDeletionStep(
          () =>
            deleteAccountWorkflow(request, {
              cancelSubscription: async (subscriptionId, cancellation) => {
                const stripe = createStripeClient();
                try {
                  await stripe.subscriptions.cancel(
                    subscriptionId,
                    { prorate: cancellation.prorate },
                    {
                      idempotencyKey: cancellation.idempotencyKey,
                    }
                  );
                } catch (error) {
                  if (!isAlreadyDeletedProviderError(error)) {
                    throw safeProviderError("stripe_provider_error");
                  }
                }
              },
              deleteCustomer: async (customerId) => {
                const stripe = createStripeClient();
                try {
                  await stripe.customers.del(
                    customerId,
                    {},
                    {
                      idempotencyKey: deletedBillingIdempotencyKey(
                        customerId,
                        "delete"
                      ),
                    }
                  );
                } catch (error) {
                  if (!isAlreadyDeletedProviderError(error)) {
                    throw safeProviderError("stripe_provider_error");
                  }
                }
              },
              terminateLiveKitRoom: async (roomName) => {
                const environment = getLiveKitEnvironment();
                if (!environment.ok) {
                  throw safeProviderError("livekit_provider_error");
                }
                const result =
                  await createLiveKitInterviewProvider().terminateInterviewRoom(
                    { roomName, env: environment.data }
                  );
                if (!result.ok) {
                  throw safeProviderError("livekit_provider_error");
                }
                return result.data;
              },
              redactProviderLogs: redactStripeEventLogs,
              deleteApplicationData: deleteUserApplicationData,
              deleteAuthUser: async (targetUserId) => {
                const { error } =
                  await createAdminClient().auth.admin.deleteUser(targetUserId);
                if (error && !isAlreadyDeletedProviderError(error)) {
                  throw safeProviderError("auth_provider_error");
                }
              },
              markCompleted: markAccountDeletionCompleted,
              now: () => new Date(),
            }),
          undefined
        )
      );
      if (cleanup.retryAt) {
        await step.sleepUntil(
          "wait-for-livekit-provisioning-lease",
          cleanup.retryAt
        );
        await step.sendEvent("retry-livekit-provisioning-cleanup", {
          name: "account/deletion.requested",
          data: { userId },
        });
      }
    } catch (error) {
      const failureCode = accountDeletionFailureCode(error);
      try {
        await markAccountDeletionFailed(userId, failureCode);
      } catch {
        throw safeAccountDeletionError(
          null,
          "account_deletion_state_update_failed"
        );
      }
      throw safeAccountDeletionError(error, failureCode);
    }

    return { status: "completed" };
  }
);

export const recoverAccountDeletions = inngest.createFunction(
  {
    id: "account-deletion-recovery",
    name: "Recover Account Deletions",
    retries: 2,
  },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const userIds = await step.run("find-recoverable-deletions", () =>
      listRecoverableAccountDeletions(new Date(Date.now() - 15 * 60 * 1000))
    );
    if (userIds.length > 0) {
      await step.sendEvent(
        "requeue-account-deletions",
        userIds.map((userId) => ({
          name: "account/deletion.requested" as const,
          data: { userId },
        }))
      );
    }
    return { requeued: userIds.length };
  }
);

function createStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error("Stripe is not configured"), {
      code: "stripe_not_configured",
    });
  }
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}

function safeProviderError(code: string) {
  return Object.assign(new Error("Provider deletion step failed"), { code });
}
