import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { accountDeletionRequest, appUser, subscription } from "@/lib/db/schema";

export type MissingSubscriptionCancellationResult =
  | { status: "canceled"; tier: string }
  | { status: "conflict" };

export async function cancelObservedMissingStripeSubscription(
  input: {
    userId: string;
    observedStripeSubscriptionId: string;
    observedVersion: number;
  },
  database: Pick<typeof db, "transaction"> = db
): Promise<MissingSubscriptionCancellationResult> {
  return database.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, input.userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("billing_user_not_found");

    const [tombstone] = await tx
      .select({ userId: accountDeletionRequest.userId })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, input.userId))
      .limit(1);
    if (tombstone) throw new Error("account_deletion_pending");

    const [current] = await tx
      .select()
      .from(subscription)
      .where(eq(subscription.userId, input.userId))
      .limit(1)
      .for("update");
    if (
      !current ||
      current.stripeSubscriptionId !== input.observedStripeSubscriptionId ||
      current.version !== input.observedVersion
    ) {
      return { status: "conflict" };
    }

    const updated = await tx
      .update(subscription)
      .set({
        status: "canceled",
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscription.userId, input.userId),
          eq(
            subscription.stripeSubscriptionId,
            input.observedStripeSubscriptionId
          ),
          eq(subscription.version, input.observedVersion)
        )
      )
      .returning({ tier: subscription.tier });
    if (!updated[0]) return { status: "conflict" };
    return { status: "canceled", tier: updated[0].tier };
  });
}
