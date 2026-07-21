import { NextRequest, NextResponse } from "next/server";

import { getTrustedClientIp } from "@/lib/security/public-demo-identity";
import { submitContactRequest } from "@/lib/workflows/contact-submission";

export async function POST(req: NextRequest) {
  const requestPolicyError = getContactRequestPolicyError(req);
  if (requestPolicyError) {
    return noStore(
      NextResponse.json(
        { error: requestPolicyError.error },
        { status: requestPolicyError.status }
      )
    );
  }

  const ipAddress = getTrustedClientIp(req.headers, {
    trustedLocalDevelopment: isTrustedContactLocalDevelopment(req),
    trustedVercelDeployment: process.env.VERCEL === "1",
  });
  if (!ipAddress) {
    return noStore(
      NextResponse.json({ error: "trusted_ip_unavailable" }, { status: 503 })
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(
      NextResponse.json({ error: "invalid_contact_request" }, { status: 400 })
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return noStore(
      NextResponse.json({ error: "invalid_contact_request" }, { status: 400 })
    );
  }

  const result = await submitContactRequest({
    name: Reflect.get(body, "name"),
    email: Reflect.get(body, "email"),
    reason: Reflect.get(body, "reason"),
    message: Reflect.get(body, "message"),
    idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
    ipAddress,
    secret: process.env.DEMO_ABUSE_HMAC_SECRET,
  });
  const response = noStore(
    NextResponse.json(result.body, { status: result.status })
  );
  if (!result.ok && result.retryAfterSeconds) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}

function getContactRequestPolicyError(
  req: NextRequest
): { status: number; error: string } | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { status: 415, error: "contact_json_required" };
  }

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return { status: 403, error: "contact_same_origin_required" };
  }

  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return { status: 403, error: "contact_same_origin_required" };
  }

  return null;
}

function isTrustedContactLocalDevelopment(req: NextRequest): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(req.nextUrl.hostname)
  );
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
