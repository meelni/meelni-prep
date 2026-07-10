import { NextResponse } from "next/server";

import { getCreditBalanceReadModel } from "@/lib/billing/credit-balance-read-model";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  getLocalDevCreditBalanceResponse,
  isLocalDevCreditBypassEnabled,
} from "@/lib/billing/local-dev-bypass";
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

    if (isLocalDevCreditBypassEnabled()) {
      return NextResponse.json(getLocalDevCreditBalanceResponse());
    }

    const store = createDrizzleCreditLedgerStore();
    return NextResponse.json(
      await getCreditBalanceReadModel({ store, userId: user.id })
    );
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance" },
      { status: 500 }
    );
  }
}
