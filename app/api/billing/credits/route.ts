import { NextResponse } from "next/server";

import { getCreditBalanceReadModel } from "@/lib/billing/credit-ledger-reporting";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  getLocalDevCreditBalanceResponse,
  isLocalDevCreditBypassEnabled,
} from "@/lib/billing/local-dev-bypass";
import { upsertUser } from "@/lib/db/users";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { createClient } from "@/lib/supabase/server";

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

    await upsertUser({
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name || user.user_metadata?.full_name || null,
    });

    if (isLocalDevCreditBypassEnabled()) {
      return NextResponse.json(getLocalDevCreditBalanceResponse());
    }

    const store = createDrizzleCreditLedgerStore();
    return NextResponse.json(
      await getCreditBalanceReadModel({ store, userId: user.id })
    );
  } catch {
    reportOperationalFailure({
      operation: "billing_read",
      errorCode: "billing_credit_read_failed",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to fetch credit balance" },
      { status: 500 }
    );
  }
}
