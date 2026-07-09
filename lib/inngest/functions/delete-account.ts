import Stripe from "stripe";

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
    const request = await getAccountDeletionRequest(userId);
    if (!request) throw new Error("Account deletion tombstone is missing");
    if (request.status === "completed") return { status: "completed" };

    await step.run("mark-processing", () =>
      markAccountDeletionProcessing(userId)
    );

    try {
      await step.run("delete-account-providers-and-data", () =>
        deleteAccountWorkflow(request, {
          cancelSubscription: async (subscriptionId) => {
            const stripe = createStripeClient();
            try {
              await stripe.subscriptions.cancel(subscriptionId, {
                prorate: true,
              });
            } catch (error) {
              if (!isAlreadyDeletedProviderError(error)) {
                throw safeProviderError("stripe_provider_error");
              }
            }
          },
          deleteCustomer: async (customerId) => {
            const stripe = createStripeClient();
            try {
              await stripe.customers.del(customerId);
            } catch (error) {
              if (!isAlreadyDeletedProviderError(error)) {
                throw safeProviderError("stripe_provider_error");
              }
            }
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
        })
      );
    } catch (error) {
      await markAccountDeletionFailed(
        userId,
        accountDeletionFailureCode(error)
      );
      throw error;
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
