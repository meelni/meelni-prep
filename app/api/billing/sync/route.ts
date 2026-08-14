import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription, stripeCustomerMapping } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
} from "@/lib/billing/stripe-catalog";
import { mayApplyStripeSubscriptionResource } from "@/lib/billing/stripe-subscription-event-order";
import { mapStripeSubscriptionStatus } from "@/lib/billing/stripe-subscription-status";
import { cancelObservedMissingStripeSubscription } from "@/lib/db/stripe-subscription-sync";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    })
  : null;

/**
 * POST /api/billing/sync
 *
 * Syncs the user's subscription status from Stripe.
 * This ensures the local database reflects the current Stripe state.
 *
 * Use cases:
 * - Called after checkout completion
 * - Called when user reports discrepancy
 *
 * This helps prevent issues like:
 * - User paid but UI shows free tier (webhook delay or failure)
 * - User canceled but UI still shows active
 */
export async function POST() {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Check if Stripe is configured
    if (!stripe) {
      return NextResponse.json({
        synced: false,
        message: "Payment system not configured",
      });
    }

    // Get user's subscription from database
    const existingSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    // If no local subscription exists, recover only a real paid-provider
    // subscription. A sync request must never fabricate free entitlement.
    if (existingSubscription.length === 0) {
      // Check if user has a Stripe customer mapping
      const mapping = await db
        .select()
        .from(stripeCustomerMapping)
        .where(eq(stripeCustomerMapping.userId, userId))
        .limit(1);

      // If we have a mapping, try to get subscription from Stripe
      if (mapping.length > 0) {
        const stripeCustomerId = mapping[0].stripeCustomerId;

        try {
          // List subscriptions for this customer
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: "all",
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            const stripeSubscription = subscriptions.data[0];

            // Sync from Stripe to database
            const syncedData = await syncSubscriptionFromStripe(
              userId,
              stripeSubscription
            );

            return NextResponse.json({
              synced: true,
              subscription: syncedData,
              message: "Subscription synced from Stripe",
            });
          }
        } catch {
          console.error("Subscription sync provider lookup failed", {
            code: "stripe_subscription_lookup_failed",
          });
          throw new Error("stripe_subscription_lookup_failed");
        }
      }

      return NextResponse.json({
        synced: false,
        subscription: null,
        message: "No paid Stripe subscription found",
      });
    }

    const sub = existingSubscription[0];

    // If user has a Stripe subscription, sync from Stripe
    if (sub.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          sub.stripeSubscriptionId
        );
        const syncedData = await syncSubscriptionFromStripe(
          userId,
          stripeSubscription
        );

        return NextResponse.json({
          synced: true,
          subscription: syncedData,
          message: "Subscription synced from Stripe",
        });
      } catch (stripeError) {
        // Subscription may have been deleted
        if (isStripeResourceMissing(stripeError)) {
          const cancellation = await cancelObservedMissingStripeSubscription({
            userId,
            observedStripeSubscriptionId: sub.stripeSubscriptionId,
            observedVersion: sub.version,
          });
          if (cancellation.status === "conflict") {
            return NextResponse.json(
              {
                synced: false,
                message: "Subscription changed while syncing; retry required",
              },
              { status: 409 }
            );
          }

          return NextResponse.json({
            synced: true,
            subscription: {
              tier: cancellation.tier,
              status: "canceled",
            },
            message: "Subscription marked as canceled (not found in Stripe)",
          });
        }
        throw stripeError;
      }
    } else if (sub.stripeCustomerId) {
      // User has customer ID but no subscription - check if they have one now
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: sub.stripeCustomerId,
          status: "all",
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const stripeSubscription = subscriptions.data[0];
          const syncedData = await syncSubscriptionFromStripe(
            userId,
            stripeSubscription
          );

          return NextResponse.json({
            synced: true,
            subscription: syncedData,
            message: "Found and synced subscription from Stripe",
          });
        }
      } catch {
        console.error("Subscription sync provider lookup failed", {
          code: "stripe_subscription_lookup_failed",
        });
      }
    }

    if (sub.tier === "free") {
      return NextResponse.json({
        synced: false,
        subscription: null,
        message: "No paid Stripe subscription found",
      });
    }

    // Preserve an existing paid/canceled local state when there is no provider
    // object to recover. This read does not create or upgrade entitlement.
    return NextResponse.json({
      synced: true,
      subscription: {
        tier: sub.tier,
        status: sub.status,
      },
      message: "No changes needed",
    });
  } catch {
    console.error("Subscription sync failed", {
      code: "subscription_sync_failed",
    });
    return NextResponse.json(
      { error: "Failed to sync subscription" },
      { status: 500 }
    );
  }
}

function isStripeResourceMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "resource_missing"
  );
}

/**
 * Sync subscription data from Stripe to our database
 */
async function syncSubscriptionFromStripe(
  userId: string,
  stripeSubscription: Stripe.Subscription
): Promise<{ tier: string; status: string }> {
  const firstItem = stripeSubscription.items.data[0];
  const priceId = firstItem?.price?.id;
  const status = mapStripeSubscriptionStatus(stripeSubscription.status);

  const existing = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  let tier: string | null = null;
  try {
    tier = getStripeCatalogIdForPrice(priceId);
  } catch {
    console.warn("Subscription sync skipped", {
      code: "stripe_subscription_price_unknown",
    });
  }

  if (!tier && existing.length === 0) {
    throw new Error("stripe_subscription_price_unknown");
  }

  const resourceCreatedAt = new Date(stripeSubscription.created * 1000);
  if (!Number.isFinite(resourceCreatedAt.getTime())) {
    throw new Error("stripe_subscription_created_at_invalid");
  }
  const current = existing[0];
  const currentResourceId = current?.stripeSubscriptionId ?? null;
  const replacingResource = Boolean(
    currentResourceId && currentResourceId !== stripeSubscription.id
  );
  if (
    !mayApplyStripeSubscriptionResource({
      currentResourceId,
      currentStatus: current?.status ?? null,
      currentResourceProof: current?.stripeResourceCreatedAt
        ? {
            resourceCreatedAt: current.stripeResourceCreatedAt,
            createdEventCursor:
              current.stripeResourceCreatedEventTimestamp &&
              current.stripeResourceCreatedEventId
                ? {
                    createdAt: current.stripeResourceCreatedEventTimestamp,
                    priority: 30,
                    eventId: current.stripeResourceCreatedEventId,
                  }
                : null,
          }
        : null,
      retiredResourceIds: current?.retiredStripeSubscriptionIds ?? [],
      candidateResourceId: stripeSubscription.id,
      candidateResourceProof: {
        resourceCreatedAt,
        createdEventCursor: null,
      },
      eventType: "customer.subscription.created",
    })
  ) {
    throw new Error("stripe_subscription_resource_conflict");
  }

  const updateData = {
    tier: tier ?? existing[0].tier,
    status,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: stripeSubscription.customer as string,
    stripePriceId: priceId,
    stripeResourceCreatedAt: resourceCreatedAt,
    stripeResourceCreatedEventTimestamp:
      current?.stripeResourceCreatedEventTimestamp ?? null,
    stripeResourceCreatedEventId: current?.stripeResourceCreatedEventId ?? null,
    retiredStripeSubscriptionIds:
      replacingResource && currentResourceId
        ? sql`array_append(${subscription.retiredStripeSubscriptionIds}, ${currentResourceId})`
        : (current?.retiredStripeSubscriptionIds ?? []),
    billingCycle:
      firstItem?.price?.recurring?.interval === "year"
        ? ("annual" as const)
        : ("monthly" as const),
    currentPeriodStart: firstItem?.current_period_start
      ? new Date(firstItem.current_period_start * 1000)
      : null,
    currentPeriodEnd: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : null,
    trialEnd: stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : null,
    canceledAt: stripeSubscription.canceled_at
      ? new Date(stripeSubscription.canceled_at * 1000)
      : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    const result = await db
      .update(subscription)
      .set({ ...updateData, version: current.version + 1 })
      .where(
        and(
          eq(subscription.userId, userId),
          eq(subscription.version, current.version),
          currentResourceId
            ? eq(subscription.stripeSubscriptionId, currentResourceId)
            : isNull(subscription.stripeSubscriptionId)
        )
      )
      .returning({ id: subscription.id });
    if (result.length === 0) {
      throw new Error("stripe_subscription_version_conflict");
    }
  } else {
    await db.insert(subscription).values({
      userId,
      ...updateData,
    });
  }

  return { tier: updateData.tier, status };
}
