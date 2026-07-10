import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { paymentHistory } from "@/lib/db/schema";
import { count, desc, eq } from "drizzle-orm";

/**
 * GET /api/billing/payment-history
 *
 * Fetch user's payment history with pagination
 *
 * Query parameters:
 * - limit: number (default: 10, max: 100)
 * - offset: number (default: 0)
 *
 * Returns:
 * - payments: array of payment records
 *   - id: string
 *   - amountInCents: number
 *   - currency: string
 *   - status: 'succeeded' | 'failed' | 'partially_refunded' | 'refunded' | 'disputed' | 'canceled'
 *   - tier: string
 *   - billingCycle: string
 *   - periodStart: ISO timestamp
 *   - periodEnd: ISO timestamp
 *   - receiptUrl: string (nullable)
 *   - failureReason: string (nullable)
 *   - createdAt: ISO timestamp
 * - pagination:
 *   - total: number (total count of payments)
 *   - limit: number
 *   - offset: number
 *   - hasMore: boolean
 */
export async function GET(req: Request) {
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

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "10", 10),
      100
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // Fetch total count
    const totalCountResult = await db
      .select({ count: count() })
      .from(paymentHistory)
      .where(eq(paymentHistory.userId, user.id));

    const total = totalCountResult[0]?.count ?? 0;

    // Fetch payment history with pagination
    const payments = await db
      .select({
        id: paymentHistory.id,
        amountInCents: paymentHistory.amountInCents,
        currency: paymentHistory.currency,
        status: paymentHistory.status,
        tier: paymentHistory.tier,
        billingCycle: paymentHistory.billingCycle,
        periodStart: paymentHistory.periodStart,
        periodEnd: paymentHistory.periodEnd,
        receiptUrl: paymentHistory.receiptUrl,
        failureReason: paymentHistory.failureReason,
        createdAt: paymentHistory.createdAt,
      })
      .from(paymentHistory)
      .where(eq(paymentHistory.userId, user.id))
      .orderBy(desc(paymentHistory.createdAt))
      .limit(limit)
      .offset(offset);

    // Calculate hasMore
    const hasMore = offset + limit < total;

    // Format response with ISO timestamps
    const formattedPayments = payments.map((payment) => ({
      ...payment,
      periodStart: payment.periodStart?.toISOString() || null,
      periodEnd: payment.periodEnd?.toISOString() || null,
      createdAt: payment.createdAt.toISOString(),
    }));

    return NextResponse.json({
      payments: formattedPayments,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Error fetching payment history:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment history" },
      { status: 500 }
    );
  }
}
