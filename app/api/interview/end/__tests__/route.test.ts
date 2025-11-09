/**
 * API Tests for End Interview Endpoint
 * P1-004: Tests for /api/interview/end
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import * as sessionValidator from "@/lib/evaluation/session-validator";
import * as sessions from "@/lib/db/sessions";

// Mock dependencies
vi.mock("@/lib/supabase/server");
vi.mock("@/lib/db");
vi.mock("@/lib/inngest/client");
vi.mock("@/lib/evaluation/session-validator");
vi.mock("@/lib/db/sessions");

// Helper to create mock request
function createMockRequest(body: any): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

// Helper to create mock Supabase client
function mockSupabaseClient(user: any = null, error: any = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error,
      }),
    },
  };
}

describe("POST /api/interview/end", () => {
  const mockUserId = "user-123";
  const mockSessionId = "session-456";
  const mockFeedbackId = "feedback-789";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 if user is not authenticated", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient(null, new Error("Unauthorized")) as any
      );

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 401 if auth error occurs", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient(null, new Error("Token expired")) as any
      );

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow up to 10 requests per minute", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);
      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 10,
        userTurns: 5,
        totalWords: 200,
        durationSeconds: 600,
        substantiveResponses: 5,
      });
      vi.mocked(sessionValidator.validateSessionCompleteness).mockResolvedValue(
        {
          tier: sessionValidator.SessionTier.PARTIAL,
          isValid: true,
          stats: {} as any,
          reasons: [],
          recommendations: [],
        }
      );

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      vi.mocked(inngest.send).mockResolvedValue({ ids: ["event-1"] } as any);

      // Make 10 requests (should succeed)
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest({ sessionId: `session-${i}` });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 11th request should be rate limited
      const req = createMockRequest({ sessionId: "session-11" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toBe("Rate limit exceeded");
    });
  });

  describe("Request Validation", () => {
    it("should return 400 if sessionId is missing", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );

      const req = createMockRequest({});
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("sessionId is required");
    });
  });

  describe("Authorization", () => {
    it("should return 403 if user does not own the session", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(false);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toBe("Session not found or access denied");
    });

    it("should return 404 if session does not exist", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue(null);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe("Session not found");
    });
  });

  describe("Idempotency", () => {
    it("should return existing feedback if session already ended", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: new Date("2024-01-01T10:30:00Z"),
      } as any);

      const mockDb = {
        query: {
          feedback: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockFeedbackId,
              sessionId: mockSessionId,
              status: "completed",
            }),
          },
        },
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe("Session was already ended");
      expect(data.feedbackId).toBe(mockFeedbackId);
    });

    it("should handle duplicate requests gracefully", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: new Date("2024-01-01T10:30:00Z"),
      } as any);

      const mockDb = {
        query: {
          feedback: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockFeedbackId,
              sessionId: mockSessionId,
              status: "skipped",
              statusReason: "Session too short",
            }),
          },
        },
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("skipped");
      expect(data.reason).toBe("Session too short");
    });
  });

  describe("Session Validation - Valid Sessions", () => {
    it("should queue feedback for valid full session (25 min, 20+ turns)", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 28,
        userTurns: 14,
        totalWords: 1200,
        durationSeconds: 1500, // 25 minutes
        substantiveResponses: 12,
      });

      vi.mocked(
        sessionValidator.validateSessionCompleteness
      ).mockResolvedValue({
        tier: sessionValidator.SessionTier.FULL,
        isValid: true,
        stats: {
          totalTurns: 28,
          userTurns: 14,
          totalWords: 1200,
          durationSeconds: 1500,
          substantiveResponses: 12,
        },
        reasons: [],
        recommendations: ["Excellent session length - you'll receive detailed feedback"],
      });

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      vi.mocked(inngest.send).mockResolvedValue({ ids: ["event-1"] } as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("queued");
      expect(data.estimatedTime).toBe(60); // 60 seconds for full session
      expect(data.feedbackId).toBe(mockFeedbackId);
      expect(data.tier).toBe(sessionValidator.SessionTier.FULL);
      expect(data.stats.totalTurns).toBe(28);

      // Verify Inngest job was triggered
      expect(inngest.send).toHaveBeenCalledWith({
        name: "feedback/generate.requested",
        data: {
          sessionId: mockSessionId,
          userId: mockUserId,
          tier: sessionValidator.SessionTier.FULL,
        },
      });
    });

    it("should queue feedback for valid partial session (10 min, 8 turns)", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 8,
        userTurns: 4,
        totalWords: 350,
        durationSeconds: 600, // 10 minutes
        substantiveResponses: 3,
      });

      vi.mocked(
        sessionValidator.validateSessionCompleteness
      ).mockResolvedValue({
        tier: sessionValidator.SessionTier.PARTIAL,
        isValid: true,
        stats: {
          totalTurns: 8,
          userTurns: 4,
          totalWords: 350,
          durationSeconds: 600,
          substantiveResponses: 3,
        },
        reasons: [],
        recommendations: [
          "For comprehensive feedback, aim for 20+ minutes and 20+ exchanges",
        ],
      });

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      vi.mocked(inngest.send).mockResolvedValue({ ids: ["event-1"] } as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("queued");
      expect(data.estimatedTime).toBe(45); // 45 seconds for partial session
      expect(data.tier).toBe(sessionValidator.SessionTier.PARTIAL);
    });
  });

  describe("Session Validation - Invalid Sessions", () => {
    it("should skip feedback for too-short session (2 min)", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 2,
        userTurns: 1,
        totalWords: 25,
        durationSeconds: 120, // 2 minutes
        substantiveResponses: 0,
      });

      vi.mocked(
        sessionValidator.validateSessionCompleteness
      ).mockResolvedValue({
        tier: sessionValidator.SessionTier.INSUFFICIENT,
        isValid: false,
        stats: {
          totalTurns: 2,
          userTurns: 1,
          totalWords: 25,
          durationSeconds: 120,
          substantiveResponses: 0,
        },
        reasons: [
          "Too few turns: 2 < 5 required",
          "Too short: 2 min < 5 min required",
        ],
        recommendations: [
          "Aim for at least 10 minutes and 5 substantive exchanges for feedback",
        ],
      });

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200); // 200 OK, not 422
      expect(data.status).toBe("skipped");
      expect(data.reason).toContain("Too few turns");
      expect(data.tier).toBe(sessionValidator.SessionTier.INSUFFICIENT);
      expect(data.feedbackId).toBe(mockFeedbackId);

      // Verify Inngest job was NOT triggered
      expect(inngest.send).not.toHaveBeenCalled();
    });

    it("should skip feedback for abandoned session (0 turns)", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 0,
        userTurns: 0,
        totalWords: 0,
        durationSeconds: 0,
        substantiveResponses: 0,
      });

      vi.mocked(
        sessionValidator.validateSessionCompleteness
      ).mockResolvedValue({
        tier: sessionValidator.SessionTier.ABANDONED,
        isValid: false,
        stats: {
          totalTurns: 0,
          userTurns: 0,
          totalWords: 0,
          durationSeconds: 0,
          substantiveResponses: 0,
        },
        reasons: ["Session abandoned: No conversation turns recorded"],
        recommendations: [
          "Start a new interview session",
          "Ensure your microphone is working",
        ],
      });

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("skipped");
      expect(data.reason).toContain("abandoned");
      expect(data.tier).toBe(sessionValidator.SessionTier.ABANDONED);
    });
  });

  describe("Error Handling", () => {
    it("should return 500 if Inngest job fails to queue", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockResolvedValue({
        totalTurns: 10,
        userTurns: 5,
        totalWords: 200,
        durationSeconds: 600,
        substantiveResponses: 5,
      });

      vi.mocked(
        sessionValidator.validateSessionCompleteness
      ).mockResolvedValue({
        tier: sessionValidator.SessionTier.PARTIAL,
        isValid: true,
        stats: {} as any,
        reasons: [],
        recommendations: [],
      });

      const mockDb = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: mockFeedbackId }]),
          }),
        }),
      };
      vi.mocked(db).mockReturnValue(mockDb as any);

      // Inngest fails
      vi.mocked(inngest.send).mockRejectedValue(
        new Error("Inngest service unavailable")
      );

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("Failed to queue feedback generation");
      expect(data.feedbackId).toBe(mockFeedbackId);
    });

    it("should return 500 if database error occurs", async () => {
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ id: mockUserId }) as any
      );
      vi.mocked(sessions.isSessionOwnedByUser).mockResolvedValue(true);
      vi.mocked(sessions.getSessionById).mockResolvedValue({
        id: mockSessionId,
        userId: mockUserId,
        endedAt: null,
      } as any);

      vi.mocked(sessionValidator.calculateSessionStats).mockRejectedValue(
        new Error("Database connection failed")
      );

      const req = createMockRequest({ sessionId: mockSessionId });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("Internal server error");
    });
  });
});
