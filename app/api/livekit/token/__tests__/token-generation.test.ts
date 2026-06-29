/**
 * Unit tests for LiveKit token generation.
 *
 * Full authenticated interview credit enforcement lives in /api/session/start.
 */

import { NextRequest } from "next/server";

import { POST } from "../route";

jest.mock("livekit-server-sdk", () => ({
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: jest.fn(),
    toJwt: jest.fn().mockResolvedValue("mock-token"),
  })),
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    createRoom: jest.fn().mockResolvedValue({}),
    updateRoomMetadata: jest.fn().mockResolvedValue({}),
  })),
}));

describe("POST /api/livekit/token", () => {
  const validRequestBody = {
    roomName: "test-room",
    participantName: "Test User",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.LIVEKIT_API_KEY = "test-api-key";
    process.env.LIVEKIT_API_SECRET = "test-api-secret";
    process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud";
  });

  it("allows token generation without billing checks", async () => {
    const request = new NextRequest("http://localhost:3000/api/livekit/token", {
      method: "POST",
      body: JSON.stringify(validRequestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe("mock-token");
    expect(data.url).toBe("wss://test.livekit.cloud");
  });

  it("returns 400 when roomName is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/livekit/token", {
      method: "POST",
      body: JSON.stringify({ participantName: "Test User" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "Missing roomName or participantName",
    });
  });

  it("returns 400 when participantName is missing", async () => {
    const request = new NextRequest("http://localhost:3000/api/livekit/token", {
      method: "POST",
      body: JSON.stringify({ roomName: "test-room" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      error: "Missing roomName or participantName",
    });
  });
});
