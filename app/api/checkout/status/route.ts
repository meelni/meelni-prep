import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  handleCheckoutStatus,
  resolveCheckoutStatusAuthentication,
  type CheckoutStatusDependencies,
} from "@/lib/billing/checkout-success-status-route";
import { db } from "@/lib/db";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { creditGrant, paymentHistory } from "@/lib/db/schema";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleCheckoutStatus(request, defaultDependencies);
}

const defaultDependencies: CheckoutStatusDependencies = {
  async authenticate() {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return resolveCheckoutStatusAuthentication({ user, error });
  },
  hasDeletionTombstone: hasAccountDeletionTombstone,
  async findSettlementEvidence({ userId, sessionIds }) {
    return db
      .select({
        checkoutSessionId: paymentHistory.stripeCheckoutSessionId,
        invoiceId: paymentHistory.stripeInvoiceId,
        paymentUserId: paymentHistory.userId,
        status: paymentHistory.status,
        creditGrantId: paymentHistory.creditGrantId,
        catalogId: paymentHistory.catalogId,
        grantId: creditGrant.id,
        grantUserId: creditGrant.userId,
        grantCatalogId: creditGrant.catalogId,
        grantSource: creditGrant.source,
        grantSourceId: creditGrant.sourceId,
        grantOriginalCredits: creditGrant.originalCredits,
      })
      .from(paymentHistory)
      .leftJoin(creditGrant, eq(paymentHistory.creditGrantId, creditGrant.id))
      .where(
        and(
          eq(paymentHistory.userId, userId),
          inArray(paymentHistory.stripeCheckoutSessionId, sessionIds)
        )
      )
      .limit(10);
  },
  reportFailure(errorCode) {
    reportOperationalFailure({
      operation: "checkout_confirmation",
      errorCode,
      retryable: true,
    });
  },
};
