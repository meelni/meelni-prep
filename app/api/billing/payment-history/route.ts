import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { paymentHistory } from "@/lib/db/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { parseNonNegativeIntegerParam } from "@/lib/utils/pagination";

const VISIBLE_PAYMENT_PREDICATE = sql<boolean>`
  ${paymentHistory.failureReason} IS DISTINCT FROM 'legacy_duplicate_quarantined'
  AND NOT (
    ${paymentHistory.status} = 'failed'
    AND ${paymentHistory.stripeInvoiceId} IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM payment_history settled
      WHERE settled.stripe_invoice_id = ${paymentHistory.stripeInvoiceId}
        AND settled.status = 'succeeded'
    )
  )
`;

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
    const limit = parseNonNegativeIntegerParam(
      searchParams.get("limit"),
      10
    );
    const offset = parseNonNegativeIntegerParam(
      searchParams.get("offset"),
      0
    );

    if (limit === null || offset === null || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error:
            "Limit must be between 1 and 100 and offset must be non-negative",
        },
        { status: 400 }
      );
    }

    // Fetch total count
    const totalCountResult = await db
      .select({ count: count() })
      .from(paymentHistory)
      .where(
        and(eq(paymentHistory.userId, user.id), VISIBLE_PAYMENT_PREDICATE)
      );

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
      .where(and(eq(paymentHistory.userId, user.id), VISIBLE_PAYMENT_PREDICATE))
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
  } catch {
    reportOperationalFailure({
      operation: "billing_read",
      errorCode: "billing_payment_history_read_failed",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to fetch payment history" },
      { status: 500 }
    );
  }
}
