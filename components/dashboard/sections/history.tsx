"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-surface";
import {
  buildHistorySummary,
  type DashboardSessionInput,
} from "@/lib/dashboard/contracts";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";
import { cn } from "@/lib/utils";

interface HistorySectionProps {
  sessions: Session[];
  loadingSessions: boolean;
}

export const HistorySection = memo(function HistorySection({
  sessions,
  loadingSessions,
}: HistorySectionProps) {
  const [activeFilter, setActiveFilter] = useState("All reps");
  const summary = useMemo(
    () => buildHistorySummary(sessions as DashboardSessionInput[]),
    [sessions]
  );

  useEffect(() => {
    if (!loadingSessions) {
      analytics.track("session_history_viewed", {
        section: "history",
        total_sessions: sessions.length,
        has_feedback: summary.rows.some((row) => row.feedbackHref),
      });
    }
  }, [loadingSessions, sessions.length, summary.rows]);

  const rows = summary.rows.filter(
    (row) => activeFilter === "All reps" || row.roundLabel === activeFilter
  );

  if (loadingSessions) {
    return (
      <DashboardPage label="Interview History">
        <DashboardSkeletonCard className="flex min-h-[520px] items-center justify-center">
          <div className="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </DashboardSkeletonCard>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage label="Interview History">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
      <section className="grid gap-6 border-b border-dashboard-panel-border pb-5 lg:grid-cols-[140px_1fr_auto] lg:items-center">
        <div>
          <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
            Next review
          </p>
          <p className="font-mono text-4xl font-semibold text-dashboard-foreground">
            {summary.nextReview.countLabel}
          </p>
        </div>
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-dashboard-foreground">
            {summary.nextReview.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-dashboard-muted">
            {summary.nextReview.description}
          </p>
        </div>
        <div className="flex gap-2">
          {summary.nextReview.feedbackHref && (
            <Button asChild>
              <Link href={summary.nextReview.feedbackHref}>Open feedback</Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            className="border-dashboard-panel-border bg-transparent text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground"
          >
            <Link href={summary.nextReview.repeatHref}>Repeat</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-8 py-5 lg:grid-cols-[1fr_300px]">
        <section className="min-w-0">
          <div className="flex flex-wrap gap-2 pb-6">
            {summary.filters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  activeFilter === filter
                    ? "border-dashboard-panel-border bg-dashboard-muted/15 text-dashboard-foreground"
                    : "border-dashboard-panel-border text-dashboard-muted hover:text-dashboard-foreground"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[90px_150px_1fr_140px_80px_104px] gap-4 border-b border-dashboard-panel-border py-3 text-xs font-bold tracking-[0.2em] text-dashboard-muted uppercase">
                <span>Date</span>
                <span>Round</span>
                <span>Question</span>
                <span>Focus</span>
                <span className="text-right">Score</span>
                <span className="text-right">Action</span>
              </div>
              <div className="divide-y divide-dashboard-panel-border">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[90px_150px_1fr_140px_80px_104px] gap-4 py-5 text-sm"
                  >
                    <span className="text-dashboard-muted">{row.dateLabel}</span>
                    <span className="font-semibold text-dashboard-foreground">
                      {row.roundLabel}
                    </span>
                    <span className="text-dashboard-foreground">
                      {row.questionLabel}
                    </span>
                    <span className="text-dashboard-muted">{row.focusLabel}</span>
                    <span className="text-right font-mono font-semibold text-dashboard-foreground">
                      {row.scoreLabel}
                    </span>
                    <span className="text-right">
                      {row.feedbackHref ? (
                        <Link
                          href={row.feedbackHref}
                          className="font-semibold text-primary hover:underline"
                        >
                          Review
                        </Link>
                      ) : (
                        <span className="text-dashboard-muted">Pending</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {rows.length === 0 && (
            <div className="py-16 text-center text-sm text-dashboard-muted">
              No reps match this filter yet.
            </div>
          )}
        </section>

        <aside className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
            Patterns
          </p>
          <div className="mt-6 space-y-6">
            {summary.patterns.map((pattern) => (
              <div key={pattern.label}>
                <h3 className="text-xl font-semibold text-dashboard-foreground">
                  {pattern.label} {pattern.count > 1 ? pattern.count : ""}
                </h3>
                <p className="mt-1 text-sm leading-6 text-dashboard-muted">
                  {pattern.description}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
      </div>
    </DashboardPage>
  );
});
