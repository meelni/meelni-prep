import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { accountDeletionRequest, appUser, subscription } from "@/lib/db/schema";

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CancellationStateSnapshot {
  userId: string;
  status: string;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  version: number;
  lastEventTimestamp: Date | null;
}

export interface ProviderCancellationObservation {
  userId: string;
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  observedAt: Date;
}

export function nextProviderCancellationState(
  current: CancellationStateSnapshot,
  observation: ProviderCancellationObservation
) {
  if (current.userId !== observation.userId) {
    throw new Error("billing_subscription_user_mismatch");
  }
  if (current.stripeSubscriptionId !== observation.stripeSubscriptionId) {
    throw new Error("billing_subscription_provider_mismatch");
  }
  if (current.status === "canceled") {
    throw new Error("billing_subscription_already_ended");
  }
  if (
    !Number.isFinite(observation.currentPeriodEnd.getTime()) ||
    !Number.isFinite(observation.observedAt.getTime())
  ) {
    throw new Error("billing_subscription_observation_invalid");
  }

  const providerSecond = new Date(
    Math.floor(observation.observedAt.getTime() / 1000) * 1000
  );
  const lastEventTimestamp =
    current.lastEventTimestamp && current.lastEventTimestamp > providerSecond
      ? current.lastEventTimestamp
      : providerSecond;

  return {
    cancelAtPeriodEnd: observation.cancelAtPeriodEnd,
    currentPeriodEnd: observation.currentPeriodEnd,
    lastEventTimestamp,
    version: current.version + 1,
    updatedAt: observation.observedAt,
  };
}

export async function reconcileProviderCancellationState(
  observation: ProviderCancellationObservation
) {
  return db.transaction(async (tx) => {
    await lockBillingUserUnlessDeleting(tx, observation.userId);
    const [current] = await tx
      .select({
        userId: subscription.userId,
        status: subscription.status,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
        version: subscription.version,
        lastEventTimestamp: subscription.lastEventTimestamp,
      })
      .from(subscription)
      .where(eq(subscription.userId, observation.userId))
      .limit(1)
      .for("update");
    if (!current) throw new Error("billing_subscription_not_found");

    const next = nextProviderCancellationState(current, observation);
    const updated = await tx
      .update(subscription)
      .set(next)
      .where(
        and(
          eq(subscription.userId, observation.userId),
          eq(subscription.version, current.version)
        )
      )
      .returning({ id: subscription.id });
    if (updated.length !== 1) {
      throw new Error("billing_subscription_version_conflict");
    }
    return next;
  });
}

export async function retrieveAuthoritativeSubscription(
  provider: Pick<Stripe["subscriptions"], "retrieve">,
  subscriptionId: string
) {
  const snapshot = await provider.retrieve(subscriptionId, { timeout: 10_000 });
  if (snapshot.id !== subscriptionId) {
    throw new Error("stripe_subscription_snapshot_mismatch");
  }
  return snapshot;
}

export async function lockBillingUserUnlessDeleting(
  tx: BillingTransaction,
  userId: string
) {
  const [user] = await tx
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1)
    .for("update");
  if (!user) throw new Error("billing_user_not_found");
  const [tombstone] = await tx
    .select({ userId: accountDeletionRequest.userId })
    .from(accountDeletionRequest)
    .where(eq(accountDeletionRequest.userId, userId))
    .limit(1);
  if (tombstone) throw new Error("account_deletion_pending");
}
