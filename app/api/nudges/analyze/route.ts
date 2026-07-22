/**
 * Retired real-time coaching endpoint.
 *
 * Authenticated full mock interviews are realistic PM interviews with feedback
 * after the session. No accepted guided-practice surface currently owns live
 * hint analysis, so caller-provided modes or transcript text cannot reactivate
 * this compatibility route.
 */

import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const RETIRED_RESPONSE = {
  error: "live_interview_hints_retired",
  message: "Live hints are not available during full mock interviews.",
} as const;

export async function POST(_request: NextRequest) {
  void _request;
  return retiredResponseForAuthenticatedUser();
}

export async function GET() {
  return retiredResponseForAuthenticatedUser();
}

async function retiredResponseForAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return noStore(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  return noStore(NextResponse.json(RETIRED_RESPONSE, { status: 410 }));
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
