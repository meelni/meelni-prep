import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { loadAccountExportSource } from "@/lib/db/account-export";
import { createClient } from "@/lib/supabase/server";
import { createAccountDataExport } from "@/lib/workflows/export-account-data";

export async function GET() {
  let user: User | null = null;
  let authError: unknown;
  try {
    const supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
    authError = authResult.error;
  } catch {
    console.error("Account export authentication check failed");
    return NextResponse.json(
      {
        error: "authentication_check_failed",
        message: "We could not verify your session. Please try again.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }

  if (authError || !user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in to export account data." },
      { status: 401 }
    );
  }

  try {
    const source = await loadAccountExportSource(user.id);
    const accountExport = createAccountDataExport({
      authenticatedUser: {
        id: user.id,
        email: user.email,
        name:
          stringValue(user.user_metadata?.full_name) ??
          stringValue(user.user_metadata?.name),
      },
      source,
    });
    const date = accountExport.exportedAt.slice(0, 10);

    return new NextResponse(JSON.stringify(accountExport, null, 2), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="meelni-account-data-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Account export generation failed");
    return NextResponse.json(
      {
        error: "account_export_failed",
        message: "We could not generate your export. Please try again.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
