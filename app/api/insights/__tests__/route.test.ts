/**
 * Tests for GET /api/insights endpoint
 *
 * Covers:
 * - Authentication
 * - Response format
 * - Cache headers
 * - Error handling
 * - Performance
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/evaluation/insights-aggregator", () => ({
  aggregateUserInsights: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { aggregateUserInsights } from "@/lib/evaluation/insights-aggregator";

describe("GET /api/insights", () => {
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 when user is not authenticated", async () => {
      // Mock no user session
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error("No session"),
          }),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 401 when auth error occurs", async () => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "Invalid token" },
          }),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      expect(response.status).toBe(401);
    });
  });

  describe("Success cases", () => {
    beforeEach(() => {
      // Mock authenticated user
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: mockUserId, email: "test@example.com" },
            },
            error: null,
          }),
        },
      });
    });

    it("returns insights for authenticated user", async () => {
      const mockInsights = {
        userId: mockUserId,
        overallStats: {
          totalSessions: 5,
          completedSessions: 5,
          totalMinutes: 120,
          avgScore: 7.5,
          medianScore: 7.6,
          percentile25: 7.0,
          percentile75: 8.0,
          percentile90: 8.5,
          currentStreak: 3,
          longestStreak: 5,
        },
        byInterviewType: {
          product_sense: { count: 2, avgScore: 7.8, last5Avg: 7.9 },
          analytical: { count: 2, avgScore: 7.2, last5Avg: 7.3 },
          leadership: { count: 1, avgScore: 7.5, last5Avg: 7.5 },
          strategy: { count: 0, avgScore: 0, last5Avg: 0 },
        },
        byDifficulty: {
          junior: { count: 1, avgScore: 6.5 },
          intermediate: { count: 3, avgScore: 7.5 },
          senior: { count: 1, avgScore: 8.2 },
        },
        trends: {
          last5SessionsAvg: 7.7,
          allTimeAvg: 7.5,
          improvementTrend: "improving" as const,
          velocity: 0.12,
        },
        competencyBreakdown: {
          structure: 75,
          clarity: 72,
          insight: 78,
          communication: 80,
          leadership: 70,
        },
      };

      (aggregateUserInsights as any).mockResolvedValue(mockInsights);

      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("overall");
      expect(body).toHaveProperty("byType");
      expect(body).toHaveProperty("byDifficulty");
      expect(body).toHaveProperty("trends");
      expect(body).toHaveProperty("competencies");
      expect(body).toHaveProperty("lastUpdated");

      expect(body.overall.totalSessions).toBe(5);
      expect(body.trends.improvementTrend).toBe("improving");
    });

    it("returns empty state for user with no sessions", async () => {
      const emptyInsights = {
        userId: mockUserId,
        overallStats: {
          totalSessions: 0,
          completedSessions: 0,
          totalMinutes: 0,
          avgScore: 0,
          medianScore: 0,
          percentile25: 0,
          percentile75: 0,
          percentile90: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
        byInterviewType: {
          product_sense: { count: 0, avgScore: 0, last5Avg: 0 },
          analytical: { count: 0, avgScore: 0, last5Avg: 0 },
          leadership: { count: 0, avgScore: 0, last5Avg: 0 },
          strategy: { count: 0, avgScore: 0, last5Avg: 0 },
        },
        byDifficulty: {
          junior: { count: 0, avgScore: 0 },
          intermediate: { count: 0, avgScore: 0 },
          senior: { count: 0, avgScore: 0 },
        },
        trends: {
          last5SessionsAvg: 0,
          allTimeAvg: 0,
          improvementTrend: "stable" as const,
          velocity: 0,
        },
        competencyBreakdown: {
          structure: 0,
          clarity: 0,
          insight: 0,
          communication: 0,
          leadership: 0,
        },
      };

      (aggregateUserInsights as any).mockResolvedValue(emptyInsights);

      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.overall.totalSessions).toBe(0);
    });
  });

  describe("Caching", () => {
    beforeEach(() => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      });

      (aggregateUserInsights as any).mockResolvedValue({
        userId: mockUserId,
        overallStats: { totalSessions: 0, completedSessions: 0, totalMinutes: 0, avgScore: 0, medianScore: 0, percentile25: 0, percentile75: 0, percentile90: 0, currentStreak: 0, longestStreak: 0 },
        byInterviewType: { product_sense: { count: 0, avgScore: 0, last5Avg: 0 }, analytical: { count: 0, avgScore: 0, last5Avg: 0 }, leadership: { count: 0, avgScore: 0, last5Avg: 0 }, strategy: { count: 0, avgScore: 0, last5Avg: 0 } },
        byDifficulty: { junior: { count: 0, avgScore: 0 }, intermediate: { count: 0, avgScore: 0 }, senior: { count: 0, avgScore: 0 } },
        trends: { last5SessionsAvg: 0, allTimeAvg: 0, improvementTrend: "stable" as const, velocity: 0 },
        competencyBreakdown: { structure: 0, clarity: 0, insight: 0, communication: 0, leadership: 0 },
      });
    });

    it("includes cache-control headers", async () => {
      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toContain("max-age=3600");
      expect(cacheControl).toContain("stale-while-revalidate=7200");
    });

    it("includes response time header", async () => {
      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      const responseTime = response.headers.get("X-Response-Time");
      expect(responseTime).toMatch(/\d+ms/);
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      });
    });

    it("returns 500 when aggregation fails", async () => {
      (aggregateUserInsights as any).mockRejectedValue(new Error("Database error"));

      const req = new NextRequest("http://localhost:3000/api/insights");
      const response = await GET(req);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe("Failed to fetch insights");
      expect(body.ref).toBeDefined();
    });

    it("logs error with correlation ID", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      (aggregateUserInsights as any).mockRejectedValue(new Error("Test error"));

      const req = new NextRequest("http://localhost:3000/api/insights");
      await GET(req);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/\[insights\] Error/);
    });
  });

  describe("Performance monitoring", () => {
    beforeEach(() => {
      (createClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: mockUserId } },
            error: null,
          }),
        },
      });
    });

    it("logs warning for slow queries (>500ms)", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock slow aggregation
      (aggregateUserInsights as any).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return {
          userId: mockUserId,
          overallStats: { totalSessions: 0, completedSessions: 0, totalMinutes: 0, avgScore: 0, medianScore: 0, percentile25: 0, percentile75: 0, percentile90: 0, currentStreak: 0, longestStreak: 0 },
          byInterviewType: { product_sense: { count: 0, avgScore: 0, last5Avg: 0 }, analytical: { count: 0, avgScore: 0, last5Avg: 0 }, leadership: { count: 0, avgScore: 0, last5Avg: 0 }, strategy: { count: 0, avgScore: 0, last5Avg: 0 } },
          byDifficulty: { junior: { count: 0, avgScore: 0 }, intermediate: { count: 0, avgScore: 0 }, senior: { count: 0, avgScore: 0 } },
          trends: { last5SessionsAvg: 0, allTimeAvg: 0, improvementTrend: "stable" as const, velocity: 0 },
          competencyBreakdown: { structure: 0, clarity: 0, insight: 0, communication: 0, leadership: 0 },
        };
      });

      const req = new NextRequest("http://localhost:3000/api/insights");
      await GET(req);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Slow query/)
      );
    });
  });
});
