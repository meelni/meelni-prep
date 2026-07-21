import { NextRequest, NextResponse } from "next/server";

import { isPublicDemoEnabled } from "@/lib/feature-flags/public-demo-gate";
import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import {
  PUBLIC_DEMO_DEVICE_COOKIE,
  PUBLIC_DEMO_DEVICE_MAX_AGE_SECONDS,
  PUBLIC_DEMO_SESSION_COOKIE,
  PUBLIC_DEMO_SESSION_MAX_AGE_SECONDS,
  PublicDemoClientIpUnavailableError,
  resolvePublicDemoIdentity,
} from "@/lib/security/public-demo-identity";
import {
  getPublicDemoRequestPolicyError,
  isTrustedPublicDemoLocalDevelopment,
} from "@/lib/security/public-demo-request-policy";
import { isValidPublicDemoSecret } from "@/lib/security/public-demo-secret";
import {
  getPublicDemoDeploymentScope,
  startPublicDemoWorkflow,
} from "@/lib/workflows/start-public-demo";

export async function POST(req: NextRequest) {
  if (!(await isPublicDemoEnabled())) {
    return noStore(
      NextResponse.json({ error: "demo_unavailable" }, { status: 404 })
    );
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

  try {
    const body: unknown = await req.json();
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    ) {
      return noStore(
        NextResponse.json(
          { error: "demo_empty_json_required" },
          { status: 400 }
        )
      );
    }
  } catch {
    return noStore(
      NextResponse.json({ error: "demo_empty_json_required" }, { status: 400 })
    );
  }

  const livekitEnv = getLiveKitEnvironment(process.env);
  const agentName = getLiveKitAgentName("demo", process.env);
  const interviewAgentName = getLiveKitAgentName("interview", process.env);
  const abuseSecret = process.env.DEMO_ABUSE_HMAC_SECRET;
  if (
    !livekitEnv.ok ||
    !agentName.ok ||
    !interviewAgentName.ok ||
    agentName.data === interviewAgentName.data ||
    !isValidPublicDemoSecret(abuseSecret)
  ) {
    console.error("[PublicDemoAudit]", {
      outcome: "failed",
      reason: "configuration_unavailable",
    });
    return noStore(
      NextResponse.json(
        { error: "demo_temporarily_unavailable" },
        { status: 503 }
      )
    );
  }

  let identity;
  try {
    identity = resolvePublicDemoIdentity({
      headers: req.headers,
      deviceCookie: req.cookies.get(PUBLIC_DEMO_DEVICE_COOKIE)?.value,
      sessionCookie: req.cookies.get(PUBLIC_DEMO_SESSION_COOKIE)?.value,
      secret: abuseSecret,
      trustedLocalDevelopment: isTrustedPublicDemoLocalDevelopment(req),
      trustedVercelDeployment: process.env.VERCEL === "1",
    });
  } catch (error) {
    if (error instanceof PublicDemoClientIpUnavailableError) {
      console.error("[PublicDemoAudit]", {
        outcome: "failed",
        reason: "trusted_ip_unavailable",
      });
    } else {
      console.error("[PublicDemoAudit]", {
        outcome: "failed",
        reason: "identity_unavailable",
      });
    }
    return noStore(
      NextResponse.json(
        { error: "demo_temporarily_unavailable" },
        { status: 503 }
      )
    );
  }

  if (!identity.established) {
    const response = noStore(
      NextResponse.json({ error: "demo_identity_initialized" }, { status: 409 })
    );
    setIdentityCookies(response, identity.deviceCookie, identity.sessionCookie);
    return response;
  }

  const result = await startPublicDemoWorkflow({
    sessionId: identity.sessionId,
    participantIdentity: identity.participantIdentity,
    ipHash: identity.identifiers.ipHash,
    deviceHash: identity.identifiers.deviceHash,
    deploymentScope: getPublicDemoDeploymentScope(),
    agentName: agentName.data,
    env: livekitEnv.data,
  });

  const response = noStore(
    NextResponse.json(result.body, { status: result.ok ? 200 : result.status })
  );
  if (!result.ok && result.retryAfterSeconds) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  setIdentityCookies(response, identity.deviceCookie, identity.sessionCookie);
  if (!result.ok && result.resetSessionCookie) {
    response.cookies.delete(PUBLIC_DEMO_SESSION_COOKIE);
  }
  return response;
}

function setIdentityCookies(
  response: NextResponse,
  deviceCookie: string,
  sessionCookie: string
): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(PUBLIC_DEMO_DEVICE_COOKIE, deviceCookie, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_DEMO_DEVICE_MAX_AGE_SECONDS,
  });
  response.cookies.set(PUBLIC_DEMO_SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_DEMO_SESSION_MAX_AGE_SECONDS,
  });
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
