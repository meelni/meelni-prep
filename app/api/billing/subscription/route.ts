import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/billing/subscription
 *
 * Fetch user's subscription details
 *
 * Returns:
 * - tier: 'free' | 'pro' | 'premium'
 * - status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing'
 * - billingCycle: 'monthly' | 'annual' | null
 * - currentPeriodStart: ISO timestamp
 * - currentPeriodEnd: ISO timestamp
 * - cancelAtPeriodEnd: boolean
 * - planName: string (e.g., "Pro Monthly")
 * - priceInCents: number
 * - currency: string
 *
 * Creates a default free subscription if none exists.
 */
export async function GET() {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Query subscription by user ID
    const userSubs = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
      .limit(1);

    // If no subscription exists, create a default free subscription
    if (userSubs.length === 0) {
      const now = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const [newSub] = await db
        .insert(subscription)
        .values({
          userId: user.id,
          tier: "free",
          status: "active",
          billingCycle: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          planName: "Free Plan",
          priceInCents: 0,
          currency: "usd",
        })
        .returning();

      return NextResponse.json({
        tier: newSub.tier,
        status: newSub.status,
        billingCycle: newSub.billingCycle,
        currentPeriodStart: newSub.currentPeriodStart?.toISOString(),
        currentPeriodEnd: newSub.currentPeriodEnd?.toISOString(),
        cancelAtPeriodEnd: newSub.cancelAtPeriodEnd,
        planName: newSub.planName,
        priceInCents: newSub.priceInCents,
        currency: newSub.currency,
        trialEnd: newSub.trialEnd?.toISOString() || null,
        proTrialUsed: newSub.proTrialUsed,
        premiumTrialUsed: newSub.premiumTrialUsed,
      });
    }

    const sub = userSubs[0];

    return NextResponse.json({
      tier: sub.tier,
      status: sub.status,
      billingCycle: sub.billingCycle,
      currentPeriodStart: sub.currentPeriodStart?.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      planName: sub.planName,
      priceInCents: sub.priceInCents,
      currency: sub.currency,
      trialEnd: sub.trialEnd?.toISOString() || null,
      proTrialUsed: sub.proTrialUsed,
      premiumTrialUsed: sub.premiumTrialUsed,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
