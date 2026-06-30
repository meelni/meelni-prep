import { NextResponse } from "next/server";

import { createCreditLedgerService } from "@/lib/billing/credits";
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
    const ledger = createCreditLedgerService({ store });
    const balance = await ledger.getCreditBalance(user.id);
    const now = new Date();
    const grants = (await store.listUserGrants(user.id))
      .filter((grant) => {
        const hasCredits =
          grant.remainingCredits > 0 || grant.reservedCredits > 0;
        const isActive = !grant.expiresAt || grant.expiresAt > now;
        return hasCredits && isActive;
      })
      .map((grant) => ({
        id: grant.id,
        catalogId: grant.catalogId,
        source: grant.source,
        originalCredits: grant.originalCredits,
        remainingCredits: grant.remainingCredits,
        reservedCredits: grant.reservedCredits,
        expiresAt: grant.expiresAt?.toISOString() ?? null,
        rolloverEligible: grant.rolloverEligible,
        rolloverSourceGrantId: grant.rolloverSourceGrantId,
        createdAt: grant.createdAt.toISOString(),
      }));

    return NextResponse.json({
      availableCredits: balance.availableCredits,
      reservedCredits: balance.reservedCredits,
      expiringCredits: balance.expiringCredits,
      nextCreditExpiresAt: balance.nextCreditExpiresAt?.toISOString() ?? null,
      grants,
    });
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance" },
      { status: 500 }
    );
  }
}
