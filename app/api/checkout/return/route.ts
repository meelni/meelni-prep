import { NextRequest, NextResponse } from "next/server";

const RETURN_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const destination = new URL("/pricing/success", request.nextUrl.origin);
  const response = NextResponse.redirect(destination, 303);
  for (const [name, value] of Object.entries(RETURN_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}
