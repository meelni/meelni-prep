"use client";

import { memo, useEffect } from "react";
import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-surface";
import { SessionList } from "@/components/dashboard/session-list";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";

interface HistorySectionProps {
  sessions: Session[];
  loadingSessions: boolean;
}

export const HistorySection = memo(function HistorySection({
  sessions,
  loadingSessions,
}: HistorySectionProps) {
  // Track when history section is viewed
  useEffect(() => {
    if (!loadingSessions) {
      // Check if any sessions have feedback by checking if overallScore exists
      const hasFeedback = sessions.some((s) => {
        return (
          s.feedback?.overallScore !== null &&
          s.feedback?.overallScore !== undefined
        );
      });

      analytics.track("session_history_viewed", {
        section: "history",
        total_sessions: sessions.length,
        has_feedback: hasFeedback,
      });
    }
  }, [loadingSessions, sessions]);

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h2 className="font-display text-foreground text-2xl font-light">
          Interview History
        </h2>
        <p className="text-muted-foreground font-sans">
          View all your past mock interviews and track your progress over time.
        </p>
      </div>

      {loadingSessions ? (
        <DashboardSkeletonCard className="flex min-h-48 items-center justify-center">
          <div className="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </DashboardSkeletonCard>
      ) : (
        <SessionList sessions={sessions} />
      )}
    </div>
  );
});
