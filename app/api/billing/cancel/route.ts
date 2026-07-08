import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    })
  : null;

// Request validation
const cancelSchema = z.object({
  cancelImmediately: z.boolean().optional().default(false),
  reason: z.string().optional(),
  feedback: z.string().optional(),
});

/**
 * POST /api/billing/cancel
 *
 * Cancel the user's subscription.
 *
 * Options:
 * - cancelImmediately: true = cancel now, false = cancel at period end (default)
 * - reason: Optional cancellation reason for analytics
 * - feedback: Optional feedback for improvement
 *
 * California Automatic Renewal Law (ARL) Compliance:
 * - Users can cancel at any time through this API
 * - No external redirects required
 * - Clear confirmation of cancellation status
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

    // Parse and validate request body
    const body = await req.json();
    const result = cancelSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { cancelImmediately, reason, feedback } = result.data;
    const userId = user.id;

    // Get user's subscription
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    if (userSubscription.length === 0) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = userSubscription[0];

    // Check if already canceled
    if (sub.status === "canceled" || sub.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          error: "Subscription is already canceled",
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
        },
        { status: 400 }
      );
    }

    // Check if free tier
    if (sub.tier === "free") {
      return NextResponse.json(
        { error: "Free tier subscriptions cannot be canceled" },
        { status: 400 }
      );
    }

    // Require Stripe configuration
    if (!stripe) {
      return NextResponse.json(
        { error: "Payment system not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Cancel in Stripe
    if (!sub.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No Stripe subscription found. Please contact support." },
        { status: 400 }
      );
    }

    try {
      if (cancelImmediately) {
        // Cancel immediately - no more access after this
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId, {
          prorate: true, // Refund unused portion
        });

        // Update database
        await db
          .update(subscription)
          .set({
            status: "canceled",
            canceledAt: new Date(),
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          })
          .where(eq(subscription.userId, userId));

        // Log cancellation reason for analytics
        if (reason || feedback) {
          console.log("Subscription canceled immediately:", {
            userId,
            reason,
            feedback,
            timestamp: new Date().toISOString(),
          });
        }

        return NextResponse.json({
          success: true,
          message:
            "Your subscription has been canceled immediately. You will receive a prorated refund.",
          status: "canceled",
          effectiveDate: new Date().toISOString(),
        });
      } else {
        // Cancel at period end - keep access until then
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

        // Update database
        await db
          .update(subscription)
          .set({
            cancelAtPeriodEnd: true,
            updatedAt: new Date(),
          })
          .where(eq(subscription.userId, userId));

        // Log cancellation reason for analytics
        if (reason || feedback) {
          console.log("Subscription set to cancel at period end:", {
            userId,
            reason,
            feedback,
            periodEnd: sub.currentPeriodEnd,
            timestamp: new Date().toISOString(),
          });
        }

        return NextResponse.json({
          success: true,
          message:
            "Your subscription will be canceled at the end of the current billing period.",
          status: "cancel_at_period_end",
          effectiveDate: sub.currentPeriodEnd?.toISOString(),
          accessUntil: sub.currentPeriodEnd?.toISOString(),
        });
      }
    } catch (stripeError) {
      console.error("Stripe cancellation error:", stripeError);
      return NextResponse.json(
        {
          error:
            "Failed to cancel subscription. Please try again or contact support.",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Cancellation error:", error);
    return NextResponse.json(
      { error: "Failed to process cancellation request" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/billing/cancel
 *
 * Reactivate a subscription that was set to cancel at period end.
 * Only works if subscription hasn't actually been canceled yet.
 */
export async function DELETE() {
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

    // Get user's subscription
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    if (userSubscription.length === 0) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const sub = userSubscription[0];

    // Check if subscription can be reactivated
    if (sub.status === "canceled") {
      return NextResponse.json(
        {
          error:
            "Subscription has already been canceled and cannot be reactivated. Please start a new subscription.",
        },
        { status: 400 }
      );
    }

    if (!sub.cancelAtPeriodEnd) {
      return NextResponse.json(
        { error: "Subscription is not scheduled for cancellation" },
        { status: 400 }
      );
    }

    if (!stripe || !sub.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "Unable to reactivate subscription. Please contact support." },
        { status: 500 }
      );
    }

    try {
      // Reactivate in Stripe
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      // Update database
      await db
        .update(subscription)
        .set({
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscription.userId, userId));

      return NextResponse.json({
        success: true,
        message: "Your subscription has been reactivated.",
        status: "active",
      });
    } catch (stripeError) {
      console.error("Stripe reactivation error:", stripeError);
      return NextResponse.json(
        { error: "Failed to reactivate subscription. Please contact support." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Reactivation error:", error);
    return NextResponse.json(
      { error: "Failed to process reactivation request" },
      { status: 500 }
    );
  }
}
