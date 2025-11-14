/**
 * Unit tests for LiveKit token API quota enforcement
 *
 * Tests the integration of usage quota checking and atomic increment
 * in the token generation endpoint.
 */

import { NextRequest } from "next/server";
import { POST } from "../route";
import { checkUsageQuota, incrementUsage } from "@/lib/services/usage-service";
import { createClient } from "@/lib/supabase/server";

// Mock dependencies
jest.mock("@/lib/services/usage-service");
jest.mock("@/lib/supabase/server");
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

const mockCheckUsageQuota = checkUsageQuota as jest.MockedFunction<typeof checkUsageQuota>;
const mockIncrementUsage = incrementUsage as jest.MockedFunction<typeof incrementUsage>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("POST /api/livekit/token - Quota Enforcement", () => {
  const validRequestBody = {
    roomName: "test-room",
    participantName: "Test User",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock environment variables
    process.env.LIVEKIT_API_KEY = "test-api-key";
    process.env.LIVEKIT_API_SECRET = "test-api-secret";
    process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://test.livekit.cloud";
  });

  describe("Authenticated Users", () => {
    const mockUser = { id: "user-123" };

    beforeEach(() => {
      // Mock authenticated user
      mockCreateClient.mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: mockUser } }),
        },
      } as any);
    });

    it("should allow token generation when quota is available", async () => {
      mockCheckUsageQuota.mockResolvedValue({
        allowed: true,
        currentUsage: 2,
        limit: 3,
      });

      mockIncrementUsage.mockResolvedValue({ success: true });

      const request = new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-token");
      expect(data.url).toBe("wss://test.livekit.cloud");
      expect(mockCheckUsageQuota).toHaveBeenCalledWith("user-123");
      expect(mockIncrementUsage).toHaveBeenCalledWith("user-123");
    });

    it("should block token generation when quota is exceeded (check phase)", async () => {
      mockCheckUsageQuota.mockResolvedValue({
        allowed: false,
        currentUsage: 3,
        limit: 3,
        reason: "Monthly quota exceeded",
      });

      const request = new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data).toEqual({
        error: "quota_exceeded",
        message: "Monthly quota exceeded",
        currentUsage: 3,
        limit: 3,
        upgradeUrl: "/pricing",
      });
      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });

    it("should block token generation when quota is exceeded (increment phase)", async () => {
      // Quota check passes
      mockCheckUsageQuota.mockResolvedValue({
        allowed: true,
        currentUsage: 2,
        limit: 3,
      });

      // But atomic increment fails (race condition)
      mockIncrementUsage.mockResolvedValue({
        success: false,
        reason: "Monthly quota exceeded (3/3)",
      });

      const request = new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data).toEqual({
        error: "quota_exceeded",
        message: "Monthly quota exceeded (3/3)",
        currentUsage: 2,
        limit: 3,
        upgradeUrl: "/pricing",
      });
    });

    it("should fail open (allow) when quota service throws an error", async () => {
      mockCheckUsageQuota.mockRejectedValue(new Error("Database connection failed"));

      const request = new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should allow token generation despite error
      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-token");
      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });
  });

  describe("Anonymous Users (Demo Mode)", () => {
    beforeEach(() => {
      // Mock no authenticated user
      mockCreateClient.mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any);
    });

    it("should allow token generation without quota check", async () => {
      const request = new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify(validRequestBody),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-token");
      expect(data.url).toBe("wss://test.livekit.cloud");
      expect(mockCheckUsageQuota).not.toHaveBeenCalled();
      expect(mockIncrementUsage).not.toHaveBeenCalled();
    });
  });

  describe("Input Validation", () => {
    it("should return 400 when roomName is missing", async () => {
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

    it("should return 400 when participantName is missing", async () => {
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
});
