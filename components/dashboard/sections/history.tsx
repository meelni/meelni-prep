"use client";

import { memo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionList } from "@/components/dashboard/session-list";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";

interface HistorySectionProps {
  sessions: Session[];
  loadingSessions: boolean;
}

export const HistorySection = memo(function HistorySection({ sessions, loadingSessions }: HistorySectionProps) {
  // Track when history section is viewed
  useEffect(() => {
    if (!loadingSessions) {
      // Check if any sessions have feedback by checking if overallScore exists
      const hasFeedback = sessions.some((s) => {
        return s.feedback?.overallScore !== null && s.feedback?.overallScore !== undefined;
      });

      analytics.track("session_history_viewed", {
        section: "history",
        total_sessions: sessions.length,
        has_feedback: hasFeedback,
      });
    }
  }, [loadingSessions, sessions]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Interview History</h2>
        <p className="text-muted-foreground font-sans">
          View all your past mock interviews and track your progress over time.
        </p>
      </div>

      {loadingSessions ? (
        <Card className="p-12 bg-card border-border text-center">
          <div className="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </Card>
      ) : (
        <SessionList sessions={sessions} />
      )}
    </div>
  );
});
