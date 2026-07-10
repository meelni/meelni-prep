import { NextResponse } from "next/server";

/**
 * Retired synchronous feedback writer.
 *
 * Interview completion atomically creates the feedback row and durable outbox
 * identity. The background worker is the only feedback-v2 writer.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Direct feedback generation is no longer supported",
      code: "FEEDBACK_GENERATION_ENDPOINT_RETIRED",
      next: "End the interview and poll /api/feedback/:sessionId",
    },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
