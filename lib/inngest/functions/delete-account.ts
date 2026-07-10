import Stripe from "stripe";

import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import { deletedBillingIdempotencyKey } from "@/lib/billing/account-deletion-guard";
import { ensureStripePaymentFullyRefunded } from "@/lib/billing/stripe-refund-reconciliation";
import {
  loadStripeInvoicePaymentAllocations,
  refundStripeInvoicePaymentAllocations,
} from "@/lib/billing/stripe-invoice-reconciliation";
import { buildStripeDeletionSubject } from "@/lib/billing/stripe-privacy";
import {
  deleteUserApplicationData,
  getAccountDeletionRequest,
  listRecoverableAccountDeletions,
  markAccountDeletionCompleted,
  markAccountDeletionFailed,
  markAccountDeletionProcessing,
  recordLateStripeDeletionSubjects,
  redactStripeEventLogs,
} from "@/lib/db/account-deletions";
import { inngest } from "@/lib/inngest/client";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
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
      request.stripeSubjects.every(({ providerId }) => providerId === null)
    ) {
      return { status: "completed" };
    }

    await step.run("mark-processing", () =>
      runSafeAccountDeletionStep(
        () => markAccountDeletionProcessing(userId),
        "account_deletion_state_update_failed"
      )
    );

    try {
      await step.run("delete-account-providers-and-data", () =>
        runSafeAccountDeletionStep(
          () =>
            deleteAccountWorkflow(request, {
              cancelSubscription: async (subscriptionId) => {
                const stripe = createStripeClient();
                try {
                  await stripe.subscriptions.cancel(
                    subscriptionId,
                    { prorate: false },
                    {
                      idempotencyKey: deletedBillingIdempotencyKey(
                        subscriptionId,
                        "cancel"
                      ),
                    }
                  );
                } catch (error) {
                  if (!isAlreadyDeletedProviderError(error)) {
                    throw safeProviderError("stripe_provider_error");
                  }
                }
              },
              refundInvoice: async (invoiceId) => {
                const stripe = createStripeClient();
                try {
                  const invoice = await stripe.invoices.retrieve(invoiceId);
                  const allocations = await loadStripeInvoicePaymentAllocations(
                    stripe,
                    invoice
                  );
                  const subjects = allocations.map((allocation) => {
                    const subject = buildStripeDeletionSubject(
                      allocation.kind,
                      allocation.providerId
                    );
                    if (!subject) {
                      throw safeProviderError("stripe_provider_error");
                    }
                    return subject;
                  });
                  await recordLateStripeDeletionSubjects(userId, subjects);
                  await refundStripeInvoicePaymentAllocations(
                    stripe,
                    allocations
                  );
                  return subjects.map(({ fingerprint }) => fingerprint);
                } catch (error) {
                  if (
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "stripe_provider_error"
                  ) {
                    throw error;
                  }
                  throw safeProviderError("stripe_provider_error");
                }
              },
              refundPayment: async (kind, providerId) => {
                try {
                  await refundStripePayment(
                    createStripeClient(),
                    kind,
                    providerId
                  );
                } catch {
                  throw safeProviderError("stripe_provider_error");
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
            }),
          undefined
        )
      );
    } catch (error) {
      reportOperationalFailure({
        operation: "account_deletion",
        errorCode: "account_deletion_failed",
        severity: "critical",
        retryable: true,
      });
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

async function refundStripePayment(
  stripe: Stripe,
  kind: "charge" | "payment_intent",
  providerIdValue: string
) {
  await ensureStripePaymentFullyRefunded(
    stripe,
    kind,
    providerIdValue,
    deletedBillingIdempotencyKey(providerIdValue, "refund")
  );
}
