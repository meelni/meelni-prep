import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  gate: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock("@/lib/db/demo-rate-limits", () => ({
  finalizePublicDemoRecoveryToken: mocks.finalize,
}));
vi.mock("@/lib/feature-flags/public-demo-gate", () => ({
  isPublicDemoEnabled: mocks.gate,
}));
vi.mock("@/lib/security/public-demo-identity", () => ({
  PUBLIC_DEMO_SESSION_COOKIE: "meelni_demo_session",
  readPublicDemoSessionId: mocks.readSession,
}));

import { POST } from "./route";

const RECEIPT = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

describe("POST /api/livekit/demo-token/ack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_ABUSE_HMAC_SECRET = "s".repeat(43);
    mocks.gate.mockResolvedValue(true);
    mocks.readSession.mockReturnValue(SESSION_ID);
    mocks.finalize.mockResolvedValue(true);
  });

  it("finalizes only the signed browser session and returns no identifiers", async () => {
    const response = await POST(request({ receipt: RECEIPT }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.finalize).toHaveBeenCalledWith(SESSION_ID, RECEIPT);
  });

  it("is an idempotent safe no-op for a missing or invalid session cookie", async () => {
    mocks.readSession.mockReturnValue(null);

    const response = await POST(request({ receipt: RECEIPT }));

    expect(response.status).toBe(204);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("rejects cross-site and malformed receipts before persistence", async () => {
    const crossSite = await POST(
      request(
        { receipt: RECEIPT },
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }
      )
    );
    const malformed = await POST(request({ receipt: "not-a-receipt" }));

    expect(crossSite.status).toBe(403);
    expect(malformed.status).toBe(400);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("fails closed when the launch gate or database is unavailable", async () => {
    mocks.gate.mockResolvedValueOnce(false);
    expect((await POST(request({ receipt: RECEIPT }))).status).toBe(404);

    mocks.finalize.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await POST(request({ receipt: RECEIPT }))).status).toBe(503);
  });

  it("fails closed when the abuse-control secret is not 32-byte base64url", async () => {
    process.env.DEMO_ABUSE_HMAC_SECRET = "s".repeat(42);

    const response = await POST(request({ receipt: RECEIPT }));

    expect(response.status).toBe(503);
    expect(mocks.readSession).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});

function request(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost:3000/api/livekit/demo-token/ack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      cookie: "meelni_demo_session=signed-session",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
