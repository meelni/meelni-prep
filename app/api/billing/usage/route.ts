import { NextResponse } from "next/server";

import { getCreditBalanceReadModel } from "@/lib/billing/credit-balance-read-model";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { createClient } from "@/lib/supabase/server";

/**
 * Deprecated compatibility read for pre-credit clients.
 *
 * Monthly quota and `-1` unlimited semantics are retired. New clients should
 * use `/api/billing/credits`; this endpoint intentionally returns the same
 * authoritative credit read model during the compatibility window.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const credits = await getCreditBalanceReadModel({
      store: createDrizzleCreditLedgerStore(),
      userId: user.id,
    });
    return NextResponse.json(
      {
        deprecated: true,
        replacement: "/api/billing/credits",
        ...credits,
      },
      {
        headers: {
          Deprecation: "true",
          Link: '</api/billing/credits>; rel="successor-version"',
        },
      }
    );
  } catch {
    reportOperationalFailure({
      operation: "billing_read",
      errorCode: "billing_usage_read_failed",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
