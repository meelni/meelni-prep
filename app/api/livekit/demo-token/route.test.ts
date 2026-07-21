import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const liveKitMocks = vi.hoisted(() => ({
  addGrant: vi.fn(),
  createDispatch: vi.fn(),
  createRoom: vi.fn(),
  resolveReactivationAccess: vi.fn(),
  toJwt: vi.fn(),
}));

vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess: liveKitMocks.resolveReactivationAccess,
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: class {
    addGrant(grant: unknown) {
      liveKitMocks.addGrant(grant);
    }

    async toJwt() {
      return liveKitMocks.toJwt();
    }
  },
  AgentDispatchClient: class {
    async createDispatch(roomName: string, agentName: string) {
      return liveKitMocks.createDispatch(roomName, agentName);
    }
  },
  RoomServiceClient: class {
    async createRoom(input: unknown) {
      return liveKitMocks.createRoom(input);
    }
  },
}));

import { POST } from "./route";

describe("POST /api/livekit/demo-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIVEKIT_API_KEY", "fixture-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "fixture-secret");
    vi.stubEnv("LIVEKIT_DEMO_AGENT_NAME", "meelni-preview-demo");
    vi.stubEnv("LIVEKIT_INTERVIEW_AGENT_NAME", "meelni-preview-interview");
    vi.stubEnv("LIVEKIT_URL", "wss://fixture-preview.livekit.cloud");
    liveKitMocks.createDispatch.mockResolvedValue({ id: "dispatch-fixture" });
    liveKitMocks.createRoom.mockResolvedValue({ name: "room-fixture" });
    liveKitMocks.resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: true,
    });
    liveKitMocks.toJwt.mockResolvedValue("token-fixture");
    vi.spyOn(Date, "now").mockReturnValue(1_782_600_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a disabled relaunch before any LiveKit provider work", async () => {
    liveKitMocks.resolveReactivationAccess.mockResolvedValue({
      source: "configured-default",
      value: false,
    });

    const response = await POST(
      new NextRequest("http://localhost/api/livekit/demo-token", {
        method: "POST",
        body: JSON.stringify({ participantName: "Preview Guest" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "interview_practice_unavailable",
      message: "Interview practice is not open yet.",
      retryable: false,
    });
    expect(liveKitMocks.resolveReactivationAccess).toHaveBeenCalledWith({
      localOverride: undefined,
    });
    expect(liveKitMocks.createRoom).not.toHaveBeenCalled();
    expect(liveKitMocks.createDispatch).not.toHaveBeenCalled();
    expect(liveKitMocks.toJwt).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards the configured non-CA demo dispatch name exactly", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/livekit/demo-token", {
        method: "POST",
        body: JSON.stringify({ participantName: "Preview Guest" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.roomName).toBe("demo-1782600000000-i");
    expect(liveKitMocks.createDispatch).toHaveBeenCalledTimes(1);
    expect(liveKitMocks.createDispatch).toHaveBeenCalledWith(
      "demo-1782600000000-i",
      "meelni-preview-demo"
    );
    expect(console.log).not.toHaveBeenCalled();
  });

  it("fails closed when demo and interview share one dispatch name", async () => {
    vi.stubEnv("LIVEKIT_DEMO_AGENT_NAME", "shared-preview-agent");
    vi.stubEnv("LIVEKIT_INTERVIEW_AGENT_NAME", "shared-preview-agent");

    const response = await POST(
      new NextRequest("http://localhost/api/livekit/demo-token", {
        method: "POST",
        body: JSON.stringify({ participantName: "Preview Guest" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "LiveKit credentials not configured",
    });
    expect(liveKitMocks.createRoom).not.toHaveBeenCalled();
    expect(liveKitMocks.createDispatch).not.toHaveBeenCalled();
  });

  it("fails closed when no demo dispatch is configured", async () => {
    vi.stubEnv("LIVEKIT_DEMO_AGENT_NAME", "");

    const response = await POST(
      new NextRequest("http://localhost/api/livekit/demo-token", {
        method: "POST",
        body: JSON.stringify({ participantName: "Preview Guest" }),
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "LiveKit credentials not configured",
    });
    expect(liveKitMocks.createRoom).not.toHaveBeenCalled();
    expect(liveKitMocks.createDispatch).not.toHaveBeenCalled();
  });

  it("keeps LiveKit provider failures out of server logs", async () => {
    const secret = "provider-secret-customer@example.com";
    liveKitMocks.createRoom.mockRejectedValueOnce(new Error(secret));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Failed to create demo room",
    });
    expect(console.error).toHaveBeenCalledWith(
      "livekit_demo_room_creation_failed"
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret
    );
  });

  it("keeps dispatch failures out of server logs", async () => {
    const secret = "dispatch-secret-customer@example.com";
    liveKitMocks.createDispatch.mockRejectedValueOnce(new Error(secret));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Failed to dispatch demo agent",
    });
    expect(console.error).toHaveBeenCalledWith(
      "livekit_demo_agent_dispatch_failed"
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret
    );
  });

  it("keeps token-generation failures out of server logs", async () => {
    const secret = "token-secret-customer@example.com";
    liveKitMocks.toJwt.mockRejectedValueOnce(new Error(secret));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to generate demo token",
    });
    expect(console.error).toHaveBeenCalledWith(
      "livekit_demo_token_generation_failed"
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret
    );
  });
});

function request() {
  return new NextRequest("http://localhost/api/livekit/demo-token", {
    method: "POST",
    body: JSON.stringify({ participantName: "Preview Guest" }),
    headers: { "content-type": "application/json" },
  });
}
