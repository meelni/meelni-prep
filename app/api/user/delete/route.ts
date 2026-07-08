import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  appUser,
  interviewSession,
  transcriptTurn,
  feedback,
  sessionQuestion,
  userSettings,
  subscription,
  stripeCustomerMapping,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    })
  : null;

/**
 * DELETE /api/user/delete
 *
 * Permanently deletes a user's account and all associated data.
 * This action is irreversible.
 *
 * Required steps:
 * 1. Cancel Stripe subscription (if exists)
 * 2. Delete all user data from database
 * 3. Delete Supabase auth user
 *
 * GDPR Compliance:
 * - Deletes all personal data
 * - Deletes all interview transcripts
 * - Cancels billing immediately
 */
export async function DELETE() {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // 1. Cancel Stripe subscription if exists
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    if (
      userSubscription.length > 0 &&
      userSubscription[0].stripeSubscriptionId &&
      stripe
    ) {
      try {
        // Cancel immediately (not at period end)
        await stripe.subscriptions.cancel(
          userSubscription[0].stripeSubscriptionId,
          {
            prorate: true, // Give them a refund for unused time
          }
        );
      } catch (stripeError) {
        console.error("Failed to cancel Stripe subscription:", stripeError);
        // Continue with deletion even if Stripe cancellation fails
        // Support can handle orphaned subscriptions
      }
    }

    // 2. Delete Stripe customer (optional but good practice)
    if (
      userSubscription.length > 0 &&
      userSubscription[0].stripeCustomerId &&
      stripe
    ) {
      try {
        await stripe.customers.del(userSubscription[0].stripeCustomerId);
      } catch (stripeError) {
        console.error("Failed to delete Stripe customer:", stripeError);
        // Continue anyway
      }
    }

    // 3. Delete all database records in correct order (respecting foreign keys)
    // Use transaction for atomicity
    await db.transaction(async (tx) => {
      // Get all session IDs for this user first
      const sessions = await tx
        .select({ id: interviewSession.id })
        .from(interviewSession)
        .where(eq(interviewSession.userId, userId));

      const sessionIds = sessions.map((s) => s.id);

      // Delete feedback for all sessions
      for (const sessionId of sessionIds) {
        await tx.delete(feedback).where(eq(feedback.sessionId, sessionId));
      }

      // Delete transcript turns for all sessions
      for (const sessionId of sessionIds) {
        await tx
          .delete(transcriptTurn)
          .where(eq(transcriptTurn.sessionId, sessionId));
      }

      // Delete session questions for all sessions
      for (const sessionId of sessionIds) {
        await tx
          .delete(sessionQuestion)
          .where(eq(sessionQuestion.sessionId, sessionId));
      }

      // Delete interview sessions
      await tx
        .delete(interviewSession)
        .where(eq(interviewSession.userId, userId));

      // Delete user settings
      await tx.delete(userSettings).where(eq(userSettings.userId, userId));

      // Delete stripe customer mapping (if not cascaded)
      await tx
        .delete(stripeCustomerMapping)
        .where(eq(stripeCustomerMapping.userId, userId));

      // Delete app_user (this will cascade to: subscription, usage_record, payment_history, user_insights)
      await tx.delete(appUser).where(eq(appUser.id, userId));
    });

    // 4. Delete Supabase auth user
    // Note: This requires service_role key - admin API
    const { error: deleteAuthError } =
      await supabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Failed to delete auth user:", deleteAuthError);
      // Data is already deleted, log for support to clean up auth manually
    }

    // 5. Sign out the user (invalidate session)
    await supabase.auth.signOut();

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete account. Please contact support.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/delete
 *
 * Initiate account deletion with confirmation check.
 * Requires the user to confirm by sending { confirmation: "DELETE" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { confirmation } = body;

    if (confirmation !== "DELETE") {
      return NextResponse.json(
        { error: "Invalid confirmation. Please type DELETE to confirm." },
        { status: 400 }
      );
    }

    // Redirect to DELETE handler
    return DELETE();
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to process deletion request" },
      { status: 500 }
    );
  }
}
