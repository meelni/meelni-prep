import { NextResponse } from "next/server";

/**
 * Retired synchronous evaluation endpoint.
 *
 * Feedback generation is owned by the idempotent interview-completion outbox
 * and background worker. Keeping a second synchronous writer produced
 * incompatible fresh-versus-cached response shapes and bypassed committed
 * completion evidence. Clients should end the interview and poll
 * GET /api/feedback/:sessionId.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Synchronous evaluation is no longer supported",
      code: "EVALUATION_ENDPOINT_RETIRED",
      next: "End the interview and poll /api/feedback/:sessionId",
    },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
