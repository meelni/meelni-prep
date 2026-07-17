import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const liveKitMocks = vi.hoisted(() => ({
  addGrant: vi.fn(),
  createDispatch: vi.fn(),
  createRoom: vi.fn(),
  toJwt: vi.fn(),
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
    liveKitMocks.toJwt.mockResolvedValue("token-fixture");
    vi.spyOn(Date, "now").mockReturnValue(1_782_600_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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
});
