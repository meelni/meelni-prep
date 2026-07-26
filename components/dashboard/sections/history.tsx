"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DashboardFeedbackStatus } from "@/components/dashboard/dashboard-feedback-status";
import { FilterPill } from "@/components/ui/filter-pill";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-surface";
import {
  buildHistorySummary,
  type DashboardSessionInput,
  type HistorySummary,
} from "@/lib/dashboard/contracts";
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
  const [activeFilter, setActiveFilter] = useState("All interviews");
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
    (row) =>
      activeFilter === "All interviews" || row.roundLabel === activeFilter
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
        <section className="border-dashboard-panel-border grid min-w-0 gap-6 border-b pb-5 xl:grid-cols-[140px_minmax(0,1fr)_auto] xl:items-center">
          <div>
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Next review
            </p>
            <p className="text-dashboard-foreground font-mono text-4xl font-semibold">
              {summary.nextReview.countLabel}
            </p>
          </div>
          <div className="max-w-2xl">
            <h2 className="text-dashboard-foreground text-xl font-semibold">
              {summary.nextReview.title}
            </h2>
            <p className="text-dashboard-muted mt-2 text-sm leading-6">
              {summary.nextReview.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.nextReview.feedbackHref && (
              <Button asChild>
                <Link href={summary.nextReview.feedbackHref}>
                  Open feedback
                </Link>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground bg-transparent"
            >
              <Link href={summary.nextReview.repeatHref}>
                {summary.nextReview.feedbackHref
                  ? "Repeat interview"
                  : "Start mock interview"}
              </Link>
            </Button>
          </div>
        </section>

        <div className="grid min-w-0 gap-8 py-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <div className="flex flex-wrap gap-2 pb-6">
              {summary.filters.map((filter) => (
                <FilterPill
                  key={filter}
                  type="button"
                  active={activeFilter === filter}
                  size="lg"
                  onClick={() => setActiveFilter(filter)}
                  className="border-dashboard-panel-border text-dashboard-muted hover:text-dashboard-foreground data-[active=true]:bg-dashboard-muted/15 data-[active=true]:text-dashboard-foreground bg-transparent"
                >
                  {filter}
                </FilterPill>
              ))}
            </div>

            <div className="hidden xl:block">
              <div className="min-w-0">
                <div className="border-dashboard-panel-border text-dashboard-muted grid grid-cols-[80px_130px_minmax(160px,1fr)_minmax(130px,180px)_80px_112px] gap-4 border-b py-3 text-xs font-bold tracking-[0.2em] uppercase">
                  <span>Date</span>
                  <span>Round</span>
                  <span>Question</span>
                  <span>Focus</span>
                  <span className="text-right">Score</span>
                  <span className="text-right">Action</span>
                </div>
                <div className="divide-dashboard-panel-border divide-y">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid min-w-0 grid-cols-[80px_130px_minmax(160px,1fr)_minmax(130px,180px)_80px_112px] gap-4 py-5 text-sm"
                    >
                      <span className="text-dashboard-muted">
                        {row.dateLabel}
                      </span>
                      <span className="text-dashboard-foreground min-w-0 font-semibold break-words">
                        {row.roundLabel}
                      </span>
                      <span className="text-dashboard-foreground min-w-0 break-words">
                        {row.questionLabel}
                      </span>
                      <span className="text-dashboard-muted min-w-0 break-words">
                        {row.focusLabel}
                      </span>
                      <span className="text-dashboard-foreground text-right font-mono font-semibold">
                        {row.feedbackHref ? row.scoreLabel : "—"}
                      </span>
                      <span className="min-w-0 text-right">
                        {row.feedbackHref ? (
                          <Link
                            href={row.feedbackHref}
                            className="text-primary font-semibold hover:underline"
                          >
                            Review
                          </Link>
                        ) : (
                          <DashboardFeedbackStatus
                            state={row.feedbackState}
                            label={row.statusLabel}
                            className="justify-center px-2"
                          />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-dashboard-panel-border divide-y xl:hidden">
              {rows.map((row) => (
                <CompactHistoryRow key={row.id} row={row} />
              ))}
            </div>

            {rows.length === 0 && (
              <div className="text-dashboard-muted py-16 text-center text-sm">
                No interviews match this filter yet.
              </div>
            )}
          </section>

          <aside className="border-dashboard-panel-border border-t pt-7 2xl:border-t-0 2xl:border-l 2xl:pt-0 2xl:pl-8">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Patterns
            </p>
            <div className="mt-6 space-y-6">
              {summary.patterns.map((pattern) => (
                <div key={pattern.label}>
                  <h3 className="text-dashboard-foreground text-xl font-semibold">
                    {pattern.label} {pattern.count > 1 ? pattern.count : ""}
                  </h3>
                  <p className="text-dashboard-muted mt-1 text-sm leading-6">
                    {pattern.description}
                  </p>
                </div>
              ))}
              {summary.patterns.length === 0 && (
                <p className="text-dashboard-muted text-sm leading-6">
                  Patterns appear only after completed feedback includes valid
                  dimension scores.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </DashboardPage>
  );
});

function CompactHistoryRow({ row }: { row: HistorySummary["rows"][number] }) {
  return (
    <div className="grid min-w-0 gap-3 py-5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-dashboard-foreground font-semibold">
            {row.roundLabel}
          </span>
          <span className="text-dashboard-muted">{row.dateLabel}</span>
        </div>
        <p className="text-dashboard-foreground mt-2 leading-6 break-words">
          {row.questionLabel}
        </p>
        <p className="text-dashboard-muted mt-1 leading-6 break-words">
          {row.focusLabel}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-end">
        {row.feedbackHref ? (
          <>
            <span className="text-dashboard-foreground font-mono font-semibold">
              {row.scoreLabel}
            </span>
            <Link
              href={row.feedbackHref}
              className="text-primary font-semibold hover:underline"
            >
              Review
            </Link>
          </>
        ) : (
          <DashboardFeedbackStatus
            state={row.feedbackState}
            label={row.statusLabel}
          />
        )}
      </div>
    </div>
  );
}
