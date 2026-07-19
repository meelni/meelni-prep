import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFeatureFlagBootstrap: vi.fn(),
  getLiveKitAgentName: vi.fn(),
  getLiveKitEnvironment: vi.fn(),
  resolvePublicDemoIdentity: vi.fn(),
  startPublicDemoWorkflow: vi.fn(),
}));

vi.mock("@/lib/feature-flags/server-bootstrap", () => ({
  getFeatureFlagBootstrap: mocks.getFeatureFlagBootstrap,
}));

vi.mock("@/lib/feature-flags/gates", () => ({
  FEATURE_GATES: { meelniReactivationAccess: "meelni_reactivation_access" },
}));

vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitAgentName: mocks.getLiveKitAgentName,
  getLiveKitEnvironment: mocks.getLiveKitEnvironment,
}));

vi.mock("@/lib/security/public-demo-identity", () => ({
  PUBLIC_DEMO_DEVICE_COOKIE: "meelni_demo_device",
  PUBLIC_DEMO_DEVICE_MAX_AGE_SECONDS: 2592000,
  PUBLIC_DEMO_SESSION_COOKIE: "meelni_demo_session",
  PUBLIC_DEMO_SESSION_MAX_AGE_SECONDS: 900,
  PublicDemoClientIpUnavailableError: class extends Error {},
  resolvePublicDemoIdentity: mocks.resolvePublicDemoIdentity,
}));

vi.mock("@/lib/workflows/start-public-demo", () => ({
  getPublicDemoDeploymentScope: () => "preview",
  startPublicDemoWorkflow: mocks.startPublicDemoWorkflow,
}));

import { POST } from "./route";

const originalSecret = process.env.DEMO_ABUSE_HMAC_SECRET;

describe("POST /api/livekit/demo-token", () => {
  afterAll(() => {
    process.env.DEMO_ABUSE_HMAC_SECRET = originalSecret;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_ABUSE_HMAC_SECRET = "s".repeat(43);
    mocks.getFeatureFlagBootstrap.mockResolvedValue({
      values: { meelni_reactivation_access: true },
    });
    mocks.getLiveKitEnvironment.mockReturnValue({
      ok: true,
      data: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    });
    mocks.getLiveKitAgentName.mockImplementation((kind: string) => ({
      ok: true,
      data: kind === "demo" ? "demo-agent" : "interview-agent",
    }));
    mocks.resolvePublicDemoIdentity.mockReturnValue({
      established: true,
      sessionId: "22222222-2222-4222-8222-222222222222",
      participantIdentity: "demo-opaque",
      deviceCookie: "signed-device",
      sessionCookie: "signed-session",
      identifiers: { ipHash: "a".repeat(64), deviceHash: "b".repeat(64) },
    });
  });

  it("fails closed on the server launch gate before configuration or workflow work", async () => {
    mocks.getFeatureFlagBootstrap.mockResolvedValue({
      values: { meelni_reactivation_access: false },
    });

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "demo_unavailable" });
    expect(mocks.getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(mocks.getLiveKitAgentName).not.toHaveBeenCalled();
    expect(mocks.resolvePublicDemoIdentity).not.toHaveBeenCalled();
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed when server launch-gate resolution throws", async () => {
    mocks.getFeatureFlagBootstrap.mockRejectedValue(new Error("unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("rejects cross-site and non-JSON requests before demo configuration", async () => {
    const crossSite = await POST(
      request(
        {},
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }
      )
    );
    expect(crossSite.status).toBe(403);

    const formPost = await POST(
      request({}, { "content-type": "application/x-www-form-urlencoded" })
    );
    expect(formPost.status).toBe(415);
    expect(mocks.getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(mocks.resolvePublicDemoIdentity).not.toHaveBeenCalled();
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("rejects malformed or caller-populated JSON before demo configuration", async () => {
    const callerFields = await POST(
      request({ participantName: "attacker-controlled", roomName: "attacker" })
    );
    expect(callerFields.status).toBe(400);
    expect(await callerFields.json()).toEqual({
      error: "demo_empty_json_required",
    });

    const malformed = await POST(
      new NextRequest("http://localhost:3000/api/livekit/demo-token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
        },
        body: "{",
      })
    );
    expect(malformed.status).toBe(400);
    expect(mocks.getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed when abuse-control configuration is unavailable", async () => {
    delete process.env.DEMO_ABUSE_HMAC_SECRET;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed when demo and interview dispatch names match", async () => {
    mocks.getLiveKitAgentName.mockReturnValue({
      ok: true,
      data: "shared-agent",
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.resolvePublicDemoIdentity).not.toHaveBeenCalled();
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed when the abuse-control secret has a non-canonical format", async () => {
    process.env.DEMO_ABUSE_HMAC_SECRET = "s".repeat(44);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
  });

  it("establishes identity without DB/provider work before a retry can start", async () => {
    mocks.resolvePublicDemoIdentity
      .mockReturnValueOnce({
        established: false,
        sessionId: "22222222-2222-4222-8222-222222222222",
        participantIdentity: "demo-opaque",
        deviceCookie: "signed-device",
        sessionCookie: "signed-session",
        identifiers: { ipHash: "a".repeat(64), deviceHash: "b".repeat(64) },
      })
      .mockReturnValueOnce({
        established: true,
        sessionId: "22222222-2222-4222-8222-222222222222",
        participantIdentity: "demo-opaque",
        deviceCookie: "signed-device",
        sessionCookie: "signed-session",
        identifiers: { ipHash: "a".repeat(64), deviceHash: "b".repeat(64) },
      });
    mocks.startPublicDemoWorkflow.mockResolvedValue({
      ok: true,
      body: {
        token: "signed-token",
        url: "wss://test.livekit.cloud",
        durationSeconds: 120,
      },
    });
    const bootstrap = await POST(request());
    expect(bootstrap.status).toBe(409);
    expect(await bootstrap.json()).toEqual({
      error: "demo_identity_initialized",
    });
    expect(mocks.startPublicDemoWorkflow).not.toHaveBeenCalled();
    expect(bootstrap.headers.getSetCookie().join(";")).toContain(
      "meelni_demo_device=signed-device"
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.getSetCookie().join(";")).toContain(
      "meelni_demo_device=signed-device"
    );
    expect(mocks.startPublicDemoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        participantIdentity: "demo-opaque",
        deploymentScope: "preview",
      })
    );
    expect(mocks.startPublicDemoWorkflow).toHaveBeenCalledTimes(1);
  });

  it("returns a typed 429 with Retry-After", async () => {
    mocks.startPublicDemoWorkflow.mockResolvedValue({
      ok: false,
      status: 429,
      body: {
        error: "demo_rate_limited",
        retryAfterSeconds: 42,
        retryAt: "2026-07-09T12:00:42.000Z",
      },
      retryAfterSeconds: 42,
    });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({
      error: "demo_rate_limited",
      retryAfterSeconds: 42,
      retryAt: "2026-07-09T12:00:42.000Z",
    });
  });
});

function request(
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost:3000/api/livekit/demo-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": "203.0.113.20",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
