/**
 * Tests for Feedback Polling API Endpoint
 *
 * Verifies:
 * - Status tracking (pending, processing, completed, failed, skipped)
 * - Estimated time remaining calculations
 * - Cache header configuration
 * - Authentication and authorization
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/db/sessions", () => ({
  isSessionOwnedByUser: vi.fn(),
}));

vi.mock("@/lib/db/feedback", () => ({
  getFeedbackBySessionId: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";

describe("GET /api/feedback/[sessionId]", () => {
  const mockSessionId = "550e8400-e29b-41d4-a716-446655440000";
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = () => {
    return new NextRequest(
      `http://localhost:3000/api/feedback/${mockSessionId}`
    );
  };

  const createMockParams = () => {
    return Promise.resolve({ sessionId: mockSessionId });
  };

  describe("Authentication", () => {
    it("should return 401 if user is not authenticated", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error("Not authenticated"),
          }),
        },
      };

      (createClient as any).mockResolvedValue(mockSupabase);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Authorization", () => {
    it("should return 404 if user doesn't own the session", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(false);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Session not found or access denied");
    });

    it("should return 404 if feedback doesn't exist", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(null);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Feedback not found for this session");
    });
  });

  describe("Status: Pending", () => {
    it("should return pending status with estimated time", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "pending",
        createdAt: new Date(),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("pending");
      expect(data.estimatedTimeRemaining).toBe(45);
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
    });
  });

  describe("Status: Processing", () => {
    it("should return processing status with calculated time remaining", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      // Started 20 seconds ago
      const processingStartedAt = new Date(Date.now() - 20000);

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "processing",
        processingStartedAt,
        createdAt: new Date(),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("processing");
      expect(data.estimatedTimeRemaining).toBeLessThanOrEqual(25);
      expect(data.estimatedTimeRemaining).toBeGreaterThanOrEqual(24);
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
    });

    it("should return 0 time remaining if processing took longer than estimated", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      // Started 60 seconds ago (longer than 45s estimate)
      const processingStartedAt = new Date(Date.now() - 60000);

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "processing",
        processingStartedAt,
        createdAt: new Date(),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("processing");
      expect(data.estimatedTimeRemaining).toBe(0);
    });
  });

  describe("Status: Completed", () => {
    it("should return completed status with full feedback data", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "completed",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "7.8",
        strengths: ["Strong framework use", "Clear articulation"],
        improvements: ["Deeper analysis needed"],
        drills: ["Practice CIRCLES method"],
        summary: "Strong performance",
        rubricVersion: "1.0.0",
        createdAt: new Date("2025-11-05T11:20:00Z"),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("completed");
      expect(data.feedback).toBeDefined();
      expect(data.feedback.structureScore).toBe(8);
      expect(data.feedback.overallScore).toBe(7.8);
      expect(data.feedback.strengths).toHaveLength(2);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    });
  });

  describe("Status: Skipped", () => {
    it("should return skipped status with reason", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "skipped",
        statusReason: "Session too short: 2 minutes < 5 minutes minimum",
        createdAt: new Date(),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("skipped");
      expect(data.skipReason).toBe("Session too short: 2 minutes < 5 minutes minimum");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    });
  });

  describe("Status: Failed", () => {
    it("should return failed status with error message", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      const mockFeedback = {
        id: "feedback-123",
        sessionId: mockSessionId,
        status: "failed",
        statusReason: "GPT-4 API timeout",
        createdAt: new Date(),
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockResolvedValue(mockFeedback);

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("failed");
      expect(data.error).toBe("GPT-4 API timeout");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      };

      (createClient as any).mockResolvedValue(mockSupabase);
      (isSessionOwnedByUser as any).mockResolvedValue(true);
      (getFeedbackBySessionId as any).mockRejectedValue(new Error("Database error"));

      const request = createMockRequest();
      const params = createMockParams();

      const response = await GET(request, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch feedback");
    });
  });
});
