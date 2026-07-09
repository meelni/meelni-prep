import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { stripeCustomerMapping, subscription } from "@/lib/db/schema";
import {
  markAccountDeletionFailed,
  requestAccountDeletion,
} from "@/lib/db/account-deletions";
import { inngest } from "@/lib/inngest/client";
import { buildStripeDeletionSubjects } from "@/lib/billing/stripe-privacy";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/user/delete
 *
 * Persists and queues an irreversible, retryable account deletion.
 *
 * Provider calls are never treated as transactionally coupled to Postgres.
 * The tombstone remains until the background workflow has removed Stripe,
 * application data, and Supabase Auth state.
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
    const userSubscription = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);
    const currentSubscription = userSubscription[0];
    const customerMappings = await db
      .select({ stripeCustomerId: stripeCustomerMapping.stripeCustomerId })
      .from(stripeCustomerMapping)
      .where(eq(stripeCustomerMapping.userId, userId));
    await requestAccountDeletion({
      userId,
      stripeSubjects: buildStripeDeletionSubjects({
        subscriptionId: currentSubscription?.stripeSubscriptionId,
        subscriptionCustomerId: currentSubscription?.stripeCustomerId,
        mappedCustomerIds: customerMappings.map(
          ({ stripeCustomerId }) => stripeCustomerId
        ),
      }),
    });

    try {
      await inngest.send({
        name: "account/deletion.requested",
        data: { userId },
      });
    } catch (error) {
      console.error("Failed to queue account deletion:", error);
      await markAccountDeletionFailed(userId, "event_enqueue_failed");
      return NextResponse.json(
        { error: "Deletion was saved but could not be queued. Please retry." },
        { status: 503 }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json(
      {
        success: true,
        status: "deletion_requested",
        message: "Account deletion is in progress.",
      },
      { status: 202 }
    );
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
