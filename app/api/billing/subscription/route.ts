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
 * This read is side-effect free. Accounts without a paid subscription receive
 * a synthetic free state without creating a billing row.
 */
export async function GET() {
  try {
    // Check authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query subscription by user ID
    const userSubs = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
      .limit(1);

    // Preserve GET as a read: a billing page visit must not create entitlement
    // or start a synthetic billing period.
    if (userSubs.length === 0) {
      return NextResponse.json({
        tier: "free",
        status: "active",
        billingCycle: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        planName: null,
        priceInCents: 0,
        currency: "usd",
        trialEnd: null,
        proTrialUsed: false,
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
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}
