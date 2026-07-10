import { NextRequest, NextResponse } from "next/server";

import { finalizePublicDemoRecoveryToken } from "@/lib/db/demo-rate-limits";
import { isPublicDemoEnabled } from "@/lib/feature-flags/public-demo-gate";
import {
  PUBLIC_DEMO_SESSION_COOKIE,
  readPublicDemoSessionId,
} from "@/lib/security/public-demo-identity";
import { getPublicDemoRequestPolicyError } from "@/lib/security/public-demo-request-policy";
import { isValidPublicDemoSecret } from "@/lib/security/public-demo-secret";

export async function POST(req: NextRequest) {
  if (!(await isPublicDemoEnabled())) {
    return noStore(new NextResponse(null, { status: 404 }));
  }

  const requestPolicyError = getPublicDemoRequestPolicyError(req);
  if (requestPolicyError) {
    return noStore(
      NextResponse.json(
        { error: requestPolicyError.error },
        { status: requestPolicyError.status }
      )
    );
  }

  const secret = process.env.DEMO_ABUSE_HMAC_SECRET;
  if (!isValidPublicDemoSecret(secret)) {
    return noStore(new NextResponse(null, { status: 503 }));
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const receipt = readReceipt(body);
  if (!receipt) {
    return noStore(new NextResponse(null, { status: 400 }));
  }

  const sessionId = readPublicDemoSessionId({
    sessionCookie: req.cookies.get(PUBLIC_DEMO_SESSION_COOKIE)?.value,
    secret,
  });
  if (!sessionId) {
    return noStore(new NextResponse(null, { status: 204 }));
  }

  try {
    await finalizePublicDemoRecoveryToken(sessionId, receipt);
    return noStore(new NextResponse(null, { status: 204 }));
  } catch {
    return noStore(new NextResponse(null, { status: 503 }));
  }
}

function readReceipt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = (value as { receipt?: unknown }).receipt;
  return typeof receipt === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      receipt
    )
    ? receipt
    : null;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
