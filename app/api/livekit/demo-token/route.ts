import { NextRequest, NextResponse } from "next/server";

/**
 * The public voice demo is intentionally de-scoped from the relaunch.
 * Keep this compatibility endpoint provider-free until a separate product and
 * operational decision restores the complete UI, agent, and health contract.
 */
export function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "voice_demo_unavailable",
      message: "The public voice demo is not part of the current experience.",
      retryable: false,
    },
    {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
