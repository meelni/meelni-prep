import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription, stripeCustomerMapping } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
} from "@/lib/billing/stripe-catalog";

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
 * - Called on user login to ensure subscription state is current
 * - Called after checkout completion
 * - Called when user reports discrepancy
 *
 * This helps prevent issues like:
 * - User paid but UI shows free tier (webhook delay or failure)
 * - User canceled but UI still shows active
 */
export async function POST(req: NextRequest) {
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

    // If no subscription exists, create a free tier record
    if (existingSubscription.length === 0) {
      // Check if user has a Stripe customer mapping
      const mapping = await db
        .select()
        .from(stripeCustomerMapping)
        .where(eq(stripeCustomerMapping.userId, userId))
        .limit(1);

      let stripeCustomerId: string | null = null;

      // If we have a mapping, try to get subscription from Stripe
      if (mapping.length > 0) {
        stripeCustomerId = mapping[0].stripeCustomerId;

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
            const syncedData = await syncSubscriptionFromStripe(userId, stripeSubscription);

            return NextResponse.json({
              synced: true,
              subscription: syncedData,
              message: "Subscription synced from Stripe",
            });
          }
        } catch (stripeError) {
          console.error("Error fetching Stripe subscription:", stripeError);
          // Continue to create free tier
        }
      }

      // Create free tier subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await db.insert(subscription).values({
        userId,
        tier: "free",
        status: "active",
        stripeCustomerId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      return NextResponse.json({
        synced: true,
        subscription: { tier: "free", status: "active" },
        message: "No paid subscription initialized",
      });
    }

    const sub = existingSubscription[0];

    // If user has a Stripe subscription, sync from Stripe
    if (sub.stripeSubscriptionId) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const syncedData = await syncSubscriptionFromStripe(userId, stripeSubscription);

        return NextResponse.json({
          synced: true,
          subscription: syncedData,
          message: "Subscription synced from Stripe",
        });
      } catch (stripeError) {
        // Subscription may have been deleted
        if (isStripeResourceMissing(stripeError)) {
          // Mark as canceled in our database
          await db
            .update(subscription)
            .set({
              status: "canceled",
              updatedAt: new Date(),
            })
            .where(eq(subscription.userId, userId));

          return NextResponse.json({
            synced: true,
            subscription: { tier: sub.tier, status: "canceled" },
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
          const syncedData = await syncSubscriptionFromStripe(userId, stripeSubscription);

          return NextResponse.json({
            synced: true,
            subscription: syncedData,
            message: "Found and synced subscription from Stripe",
          });
        }
      } catch (stripeError) {
        console.error("Error checking Stripe subscriptions:", stripeError);
      }
    }

    // No Stripe subscription - return current database state
    return NextResponse.json({
      synced: true,
      subscription: {
        tier: sub.tier,
        status: sub.status,
      },
      message: "No changes needed",
    });
  } catch (error) {
    console.error("Subscription sync error:", error);
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
  const status = mapStripeStatus(stripeSubscription.status);

  const existing = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  let tier: string | null = null;
  try {
    tier = getStripeCatalogIdForPrice(priceId);
  } catch (error) {
    console.warn("Skipping Stripe tier sync for unknown price", {
      userId,
      stripeSubscriptionId: stripeSubscription.id,
      priceId,
      error: getErrorMessage(error),
    });
  }

  if (!tier && existing.length === 0) {
    throw new Error(
      `Cannot sync subscription ${stripeSubscription.id} without a known catalog price`
    );
  }

  const updateData = {
    tier: tier ?? existing[0].tier,
    status,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: stripeSubscription.customer as string,
    stripePriceId: priceId,
    billingCycle: firstItem?.price?.recurring?.interval === "year" ? "annual" as const : "monthly" as const,
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
    await db
      .update(subscription)
      .set(updateData)
      .where(eq(subscription.userId, userId));
  } else {
    await db.insert(subscription).values({
      userId,
      ...updateData,
    });
  }

  return { tier: updateData.tier, status };
}

/**
 * Map Stripe subscription status to our internal status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "trialing":
      return "trialing";
    case "incomplete":
    case "incomplete_expired":
      return "canceled";
    default:
      return "active";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
