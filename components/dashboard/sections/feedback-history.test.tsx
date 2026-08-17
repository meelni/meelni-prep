// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";

import { HistorySection } from "./history";
import { OverviewSection } from "./overview";

const evidenceLimitedSession: Session = {
  id: "evidence-limited-session",
  userId: "fixture-user",
  role: "pm",
  roundType: "product_sense",
  mode: "voice_video",
  startedAt: "2026-08-12T12:00:00.000Z",
  endedAt: "2026-08-12T12:06:00.000Z",
  feedback: {
    status: "completed",
    presentationKind: "coaching_review",
    overallScore: null,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
  },
};

const corruptCompletedSession: Session = {
  ...evidenceLimitedSession,
  id: "corrupt-completed-session",
  roundType: "execution",
  feedback: {
    ...evidenceLimitedSession.feedback!,
    presentationKind: "unavailable",
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("scoreless feedback history", () => {
  it("keeps evidence-limited feedback reachable in Overview without a score", () => {
    render(
      <OverviewSection
        sessions={[evidenceLimitedSession]}
        loadingSessions={false}
        totalSessions={1}
        totalMinutes={6}
        completionRate={100}
      />
    );

    expect(
      screen.getByRole("link", { name: "Review latest feedback" })
    ).toHaveAttribute("href", "/feedback/evidence-limited-session");
    expect(screen.getByText("Coaching review ready")).toBeVisible();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("renders review links in desktop and compact History layouts", async () => {
    const track = vi.spyOn(analytics, "track");

    render(
      <HistorySection
        sessions={[evidenceLimitedSession]}
        loadingSessions={false}
        pagination={{ total: 1, limit: 20, offset: 0, hasMore: false }}
        onPageChange={() => undefined}
      />
    );

    const reviewLinks = screen.getAllByRole("link", { name: "Review" });
    expect(reviewLinks).toHaveLength(2);
    for (const link of reviewLinks) {
      expect(link).toHaveAttribute(
        "href",
        "/feedback/evidence-limited-session"
      );
    }
    expect(screen.getAllByText("Coaching review ready")).toHaveLength(2);
    expect(
      screen.getAllByText("Grounded observations from your recorded answers")
    ).toHaveLength(2);

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("session_history_viewed", {
        section: "history",
        total_sessions: 1,
        has_feedback: true,
      })
    );
  });

  it("does not link or label an invalid completed row as ready", () => {
    render(
      <HistorySection
        sessions={[corruptCompletedSession]}
        loadingSessions={false}
        pagination={{ total: 1, limit: 20, offset: 0, hasMore: false }}
        onPageChange={() => undefined}
      />
    );

    expect(
      screen.queryByRole("link", { name: "Review" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Coaching review ready")).not.toBeInTheDocument();
    expect(screen.getAllByText("Feedback unavailable")).toHaveLength(2);
  });
});
