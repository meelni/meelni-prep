/**
 * Unit Tests for Session Validation
 * P1-002: Tests for session-validator.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateSessionCompleteness,
  calculateSessionStats,
  isSessionValid,
  getValidationSummary,
  SessionTier,
} from "../session-validator";
import { db } from "@/lib/db";

// Mock the database
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      transcriptTurn: {
        findMany: vi.fn(),
      },
    },
  },
}));

describe("Session Validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateSessionStats", () => {
    it("should calculate stats for a normal session", async () => {
      // Mock transcript turns
      const mockTurns = [
        {
          speaker: "interviewer",
          text: "Hello, let's start the interview",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:05Z"),
        },
        {
          speaker: "user",
          text: "I would prioritize daily listeners because discovery quality determines whether new music becomes a lasting weekly habit.",
          startedAt: new Date("2024-01-01T10:00:10Z"),
          endedAt: new Date("2024-01-01T10:00:25Z"),
        },
        {
          speaker: "interviewer",
          text: "Great. Tell me about a product you use.",
          startedAt: new Date("2024-01-01T10:00:30Z"),
          endedAt: new Date("2024-01-01T10:00:35Z"),
        },
        {
          speaker: "user",
          text: "I use Spotify daily. It helps me discover new music and create playlists for different moods and activities.",
          startedAt: new Date("2024-01-01T10:00:40Z"),
          endedAt: new Date("2024-01-01T10:00:55Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const stats = await calculateSessionStats("test-session-id");

      expect(stats.totalTurns).toBe(4);
      expect(stats.userTurns).toBe(2);
      expect(stats.totalWords).toBeGreaterThan(30); // Approx word count
      expect(stats.durationSeconds).toBe(55); // 10:00:00 to 10:00:55
      expect(stats.substantiveResponses).toBe(2); // Both user responses >10 words
    });

    it("should handle empty session (0 turns)", async () => {
      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue([]);

      const stats = await calculateSessionStats("empty-session");

      expect(stats.totalTurns).toBe(0);
      expect(stats.userTurns).toBe(0);
      expect(stats.totalWords).toBe(0);
      expect(stats.durationSeconds).toBe(0);
      expect(stats.substantiveResponses).toBe(0);
    });

    it("should count only coherent responses with substantive PM signal", async () => {
      const mockTurns = [
        {
          speaker: "user",
          text: "Yes", // 1 word - not substantive
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:01Z"),
        },
        {
          speaker: "user",
          text: "I would prioritize new users because setup completion reveals whether the onboarding workflow solves their initial product problem.",
          startedAt: new Date("2024-01-01T10:00:05Z"),
          endedAt: new Date("2024-01-01T10:00:10Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const stats = await calculateSessionStats("test-session");

      expect(stats.substantiveResponses).toBe(1);
    });
  });

  describe("validateSessionCompleteness", () => {
    it("should mark session as ABANDONED with 0 turns", async () => {
      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue([]);

      const validation = await validateSessionCompleteness("abandoned-session");

      expect(validation.tier).toBe(SessionTier.ABANDONED);
      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain(
        "Session abandoned: No conversation turns recorded"
      );
      expect(validation.recommendations).toHaveLength(3);
    });

    it("should mark session as INSUFFICIENT with too few turns", async () => {
      const mockTurns = [
        {
          speaker: "interviewer",
          text: "Hello",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:02Z"),
        },
        {
          speaker: "user",
          text: "Hi there, nice to meet you",
          startedAt: new Date("2024-01-01T10:00:03Z"),
          endedAt: new Date("2024-01-01T10:00:05Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("short-session");

      expect(validation.tier).toBe(SessionTier.INSUFFICIENT);
      expect(validation.isValid).toBe(false);
      expect(validation.reasons[0]).toContain("Too few turns");
    });

    it("should mark session as INSUFFICIENT with too short duration", async () => {
      // Create 10 turns but very short duration (2 minutes)
      const mockTurns = Array.from({ length: 10 }, (_, i) => ({
        speaker: i % 2 === 0 ? "interviewer" : "user",
        text:
          i % 2 === 0
            ? "Question here?"
            : "This is my answer with enough words to be substantive and detailed.",
        startedAt: new Date(Date.UTC(2024, 0, 1, 10, 0, i * 10)),
        endedAt: new Date(Date.UTC(2024, 0, 1, 10, 0, i * 10 + 5)),
      }));

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("short-duration");

      expect(validation.tier).toBe(SessionTier.INSUFFICIENT);
      expect(validation.isValid).toBe(false);
      expect(validation.reasons.some((r) => r.includes("Too short"))).toBe(
        true
      );
    });

    it("should mark session as INSUFFICIENT when user never spoke", async () => {
      const mockTurns = Array.from({ length: 10 }, (_, i) => ({
        speaker: "interviewer",
        text: "Question " + i,
        startedAt: new Date(Date.UTC(2024, 0, 1, 10, i, 0)),
        endedAt: new Date(Date.UTC(2024, 0, 1, 10, i, 30)),
      }));

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("no-user-turns");

      expect(validation.tier).toBe(SessionTier.INSUFFICIENT);
      expect(validation.isValid).toBe(false);
      expect(validation.reasons).toContain("User never spoke during session");
    });

    it("should mark session as PARTIAL with minimum requirements", async () => {
      // 8 turns, 12 minutes, 3 substantive responses
      const mockTurns = [
        // Start
        {
          speaker: "interviewer",
          text: "Let's begin",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:05Z"),
        },
        {
          speaker: "user",
          text: "I would prioritize daily listeners because repeated discovery helps establish a durable weekly music habit.",
          startedAt: new Date("2024-01-01T10:01:00Z"),
          endedAt: new Date("2024-01-01T10:02:00Z"),
        },
        {
          speaker: "interviewer",
          text: "Tell me about a product",
          startedAt: new Date("2024-01-01T10:03:00Z"),
          endedAt: new Date("2024-01-01T10:03:30Z"),
        },
        {
          speaker: "user",
          text: "I would measure weekly playlist creation because retained discovery shows whether listeners receive lasting value.",
          startedAt: new Date("2024-01-01T10:04:00Z"),
          endedAt: new Date("2024-01-01T10:05:00Z"),
        },
        {
          speaker: "interviewer",
          text: "What would you improve?",
          startedAt: new Date("2024-01-01T10:06:00Z"),
          endedAt: new Date("2024-01-01T10:06:20Z"),
        },
        {
          speaker: "user",
          text: "I would prioritize collaborative playlists because shared discovery helps friends coordinate music choices.",
          startedAt: new Date("2024-01-01T10:07:00Z"),
          endedAt: new Date("2024-01-01T10:08:00Z"),
        },
        {
          speaker: "interviewer",
          text: "Good point",
          startedAt: new Date("2024-01-01T10:09:00Z"),
          endedAt: new Date("2024-01-01T10:09:10Z"),
        },
        // End
        {
          speaker: "user",
          text: "Thanks",
          startedAt: new Date("2024-01-01T10:11:00Z"),
          endedAt: new Date("2024-01-01T10:12:00Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("partial-session");

      expect(validation.tier).toBe(SessionTier.PARTIAL);
      expect(validation.isValid).toBe(true);
      expect(validation.reasons).toHaveLength(0);
      expect(validation.recommendations[0]).toContain("comprehensive feedback");
    });

    it("qualifies three ordinary PM answers in a five-turn canonical session", async () => {
      const mockTurns = [
        {
          contractVersion: 2,
          eventId: "writer:ordinary-partial:question:1",
          speaker: "interviewer",
          text: "What should the first release solve?",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:15Z"),
        },
        {
          contractVersion: 2,
          eventId: "writer:ordinary-partial:answer:1",
          speaker: "user",
          text: "The first release solves missed appointment coordination for working parents while preserving manual confirmation for clinics.",
          startedAt: new Date("2024-01-01T10:00:30Z"),
          endedAt: new Date("2024-01-01T10:01:30Z"),
        },
        {
          contractVersion: 2,
          eventId: "writer:ordinary-partial:question:2",
          speaker: "interviewer",
          text: "How would you measure success and decide whether to expand?",
          startedAt: new Date("2024-01-01T10:02:00Z"),
          endedAt: new Date("2024-01-01T10:02:15Z"),
        },
        {
          contractVersion: 2,
          eventId: "writer:ordinary-partial:answer:2",
          speaker: "user",
          text: "Success means fewer missed appointments and faster scheduling for patients across the local pilot.",
          startedAt: new Date("2024-01-01T10:03:00Z"),
          endedAt: new Date("2024-01-01T10:04:00Z"),
        },
        {
          contractVersion: 2,
          eventId: "writer:ordinary-partial:answer:3",
          speaker: "user",
          text: "We should not launch nationally until the local pilot shows reliable completion and demonstrates acceptable support demand.",
          startedAt: new Date("2024-01-01T10:05:30Z"),
          endedAt: new Date("2024-01-01T10:06:30Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness(
        "ordinary-five-turn-partial"
      );

      expect(validation.tier).toBe(SessionTier.PARTIAL);
      expect(validation.isValid).toBe(true);
      expect(validation.stats).toMatchObject({
        totalTurns: 5,
        userTurns: 3,
        durationSeconds: 390,
        substantiveResponses: 3,
      });
      expect(validation.reasons).toHaveLength(0);
    });

    it("should mark session as FULL with excellent engagement", async () => {
      // 25 turns, 30 minutes, 10 substantive responses
      const mockTurns = Array.from({ length: 25 }, (_, i) => ({
        speaker: i % 2 === 0 ? "interviewer" : "user",
        text:
          i % 2 === 0
            ? `Question ${i}: Tell me more about your experience`
            : `Response ${i}: I have extensive experience in product management, working on features that impact millions of users. I focus on user research, data analysis, and cross-functional collaboration.`,
        startedAt: new Date(Date.UTC(2024, 0, 1, 10, 0, i * 75)),
        endedAt: new Date(Date.UTC(2024, 0, 1, 10, 0, i * 75 + 30)),
      }));

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("full-session");

      expect(validation.tier).toBe(SessionTier.FULL);
      expect(validation.isValid).toBe(true);
      expect(validation.reasons).toHaveLength(0);
      expect(validation.recommendations[0]).toContain(
        "Excellent session length"
      );
    });

    it("should handle session with network disconnect mid-interview", async () => {
      // Session starts well then abruptly ends (simulating disconnect)
      const mockTurns = [
        {
          speaker: "interviewer",
          text: "Let's begin",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:05Z"),
        },
        {
          speaker: "user",
          text: "Sure, I'm ready with detailed thoughts on product management",
          startedAt: new Date("2024-01-01T10:00:10Z"),
          endedAt: new Date("2024-01-01T10:00:20Z"),
        },
        // Disconnect happens - no more turns
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("disconnect");

      expect(validation.tier).toBe(SessionTier.INSUFFICIENT);
      expect(validation.isValid).toBe(false);
    });

    it("should handle session with very long duration but few turns (user AFK)", async () => {
      // Only 3 turns but spread over 15 minutes (user went AFK)
      const mockTurns = [
        {
          speaker: "interviewer",
          text: "Let's start",
          startedAt: new Date("2024-01-01T10:00:00Z"),
          endedAt: new Date("2024-01-01T10:00:05Z"),
        },
        {
          speaker: "user",
          text: "Okay, just give me a second to gather my thoughts here",
          startedAt: new Date("2024-01-01T10:05:00Z"),
          endedAt: new Date("2024-01-01T10:05:15Z"),
        },
        {
          speaker: "interviewer",
          text: "Are you still there?",
          startedAt: new Date("2024-01-01T10:14:00Z"),
          endedAt: new Date("2024-01-01T10:15:00Z"),
        },
      ];

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const validation = await validateSessionCompleteness("afk-session");

      expect(validation.tier).toBe(SessionTier.INSUFFICIENT);
      expect(validation.isValid).toBe(false);
      expect(validation.reasons[0]).toContain("Too few turns");
    });
  });

  describe("isSessionValid", () => {
    it("should return true for valid session", async () => {
      const mockTurns = Array.from({ length: 10 }, (_, i) => ({
        speaker: i % 2 === 0 ? "interviewer" : "user",
        text:
          i % 2 === 0
            ? "Question"
            : "I would prioritize new users because setup completion reveals whether onboarding solves their initial product problem.",
        startedAt: new Date(Date.UTC(2024, 0, 1, 10, i, 0)),
        endedAt: new Date(Date.UTC(2024, 0, 1, 10, i, 30)),
      }));

      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue(
        mockTurns as any
      );

      const isValid = await isSessionValid("valid-session");

      expect(isValid).toBe(true);
    });

    it("should return false for invalid session", async () => {
      vi.mocked(db.query.transcriptTurn.findMany).mockResolvedValue([]);

      const isValid = await isSessionValid("invalid-session");

      expect(isValid).toBe(false);
    });
  });

  describe("getValidationSummary", () => {
    it("should format summary for valid full session", () => {
      const validation = {
        tier: SessionTier.FULL,
        isValid: true,
        stats: {
          totalTurns: 25,
          userTurns: 12,
          totalWords: 500,
          durationSeconds: 1380, // 23 minutes
          substantiveResponses: 10,
        },
        reasons: [],
        recommendations: ["Excellent session length"],
      };

      const summary = getValidationSummary(validation);

      expect(summary).toBe(
        "Session qualifies for full feedback (25 turns, 23 min)"
      );
    });

    it("should format summary for insufficient session", () => {
      const validation = {
        tier: SessionTier.INSUFFICIENT,
        isValid: false,
        stats: {
          totalTurns: 2,
          userTurns: 1,
          totalWords: 20,
          durationSeconds: 120,
          substantiveResponses: 0,
        },
        reasons: ["Too few turns: 2 < 5 required"],
        recommendations: [],
      };

      const summary = getValidationSummary(validation);

      expect(summary).toContain("insufficient");
      expect(summary).toContain("Too few turns");
      expect(summary).toContain("2 turns, 2 min");
    });
  });
});
