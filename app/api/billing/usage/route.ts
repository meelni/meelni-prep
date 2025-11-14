import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUsageSummary } from "@/lib/services/usage-service";

/**
 * GET /api/billing/usage
 *
 * Fetch user's usage quota for current billing period
 *
 * Returns:
 * - tier: 'free' | 'pro' | 'premium'
 * - interviewsUsed: number
 * - interviewsLimit: number (-1 for unlimited)
 * - percentUsed: number (0-100)
 * - isUnlimited: boolean
 * - periodStart: ISO timestamp
 * - periodEnd: ISO timestamp
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

    // Call usage service to get summary
    const usageSummary = await getUsageSummary(user.id);

    // Calculate percentage used
    const isUnlimited = usageSummary.interviewsLimit === -1;
    const percentUsed = isUnlimited
      ? 0
      : Math.round((usageSummary.interviewsUsed / usageSummary.interviewsLimit) * 100);

    return NextResponse.json({
      tier: usageSummary.tier,
      interviewsUsed: usageSummary.interviewsUsed,
      interviewsLimit: usageSummary.interviewsLimit,
      percentUsed,
      isUnlimited,
      periodStart: usageSummary.periodStart?.toISOString(),
      periodEnd: usageSummary.periodEnd?.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
