"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionList } from "@/components/dashboard/session-list";

interface Session {
  id: string;
  roundType: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  config?: any;
}

interface HistorySectionProps {
  sessions: Session[];
  loadingSessions: boolean;
}

export function HistorySection({ sessions, loadingSessions }: HistorySectionProps) {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Interview History</h2>
        <p className="text-muted-foreground">
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
}
