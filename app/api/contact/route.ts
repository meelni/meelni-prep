import { NextResponse } from "next/server";

/**
 * Contact delivery remains unavailable until SAV-182 provides durable storage,
 * notification, and delivery observability. Do not accept or log message data.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "contact_unavailable",
      message:
        "The contact form is temporarily unavailable. Please manage account and billing settings from your dashboard.",
    },
    {
      status: 503,
      headers: { "Retry-After": "86400" },
    }
  );
}
