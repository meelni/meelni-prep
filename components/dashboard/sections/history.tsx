"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DashboardFeedbackStatus } from "@/components/dashboard/dashboard-feedback-status";
import { FilterPill } from "@/components/ui/filter-pill";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { DashboardSkeletonCard } from "@/components/dashboard/dashboard-surface";
import {
  buildHistorySummary,
  type DashboardSessionInput,
  type HistorySummary,
} from "@/lib/dashboard/contracts";
import type { Session } from "@/lib/api/queries";
import { analytics } from "@/lib/analytics/analytics-service";
import {
  buildHistoryPaginationView,
  type HistoryPaginationInput,
} from "@/lib/dashboard/history-pagination";
import { cn } from "@/lib/utils";

interface HistorySectionProps {
  sessions: Session[];
  loadingSessions: boolean;
  pagination: HistoryPaginationInput;
  onPageChange: (offset: number) => void;
}

export const HistorySection = memo(function HistorySection({
  sessions,
  loadingSessions,
  pagination,
  onPageChange,
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

  const selectedFilter = summary.filters.includes(activeFilter)
    ? activeFilter
    : "All interviews";
  const rows = summary.rows.filter(
    (row) =>
      selectedFilter === "All interviews" || row.roundLabel === selectedFilter
  );
  const showQuestionColumn = summary.rows.some(
    (row) => row.questionLabel !== "—"
  );
  const paginationView = buildHistoryPaginationView({
    pagination,
    pageRowCount: summary.rows.length,
    filteredRowCount: rows.length,
    filterActive: selectedFilter !== "All interviews",
  });

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
        <section className="min-w-0" aria-labelledby="interview-log-title">
          <div className="border-dashboard-panel-border border-b pb-5">
            <div className="max-w-2xl">
              <h2
                id="interview-log-title"
                className="text-dashboard-foreground text-xl font-semibold"
              >
                Past interviews
              </h2>
              <p className="text-dashboard-muted mt-1 text-sm leading-6">
                Review completed feedback or check what happened when feedback
                is unavailable.
              </p>
            </div>

            <div className="mt-4 lg:hidden">
              <Select value={selectedFilter} onValueChange={setActiveFilter}>
                <SelectTrigger
                  aria-label="Filter interviews by round"
                  className="border-dashboard-panel-border text-dashboard-foreground min-h-11 w-full bg-transparent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {summary.filters.map((filter) => (
                    <SelectItem key={filter} value={filter}>
                      {filter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              className="mt-4 hidden flex-wrap gap-2 lg:flex"
              role="group"
              aria-label="Filter interviews by round"
            >
              {summary.filters.map((filter) => (
                <FilterPill
                  key={filter}
                  type="button"
                  active={selectedFilter === filter}
                  size="md"
                  onClick={() => setActiveFilter(filter)}
                  className="border-dashboard-panel-border text-dashboard-muted hover:text-dashboard-foreground data-[active=true]:bg-dashboard-muted/15 data-[active=true]:text-dashboard-foreground bg-transparent"
                >
                  {filter}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-dashboard-muted text-sm" aria-live="polite">
              {paginationView.rangeLabel}
            </p>
            {(paginationView.hasPrevious || paginationView.hasNext) && (
              <nav
                className="flex items-center gap-2"
                aria-label="Interview history pages"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!paginationView.hasPrevious}
                  onClick={() => onPageChange(paginationView.previousOffset)}
                >
                  Previous
                </Button>
                <span className="text-dashboard-muted min-w-20 text-center text-sm">
                  {paginationView.pageLabel}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!paginationView.hasNext}
                  onClick={() => onPageChange(paginationView.nextOffset)}
                >
                  Next
                </Button>
              </nav>
            )}
          </div>

          <div className="hidden xl:block">
            <div className="min-w-0">
              <div
                className={cn(
                  "border-dashboard-panel-border text-dashboard-muted grid gap-4 border-b py-3 text-xs font-bold tracking-[0.2em] uppercase",
                  showQuestionColumn
                    ? "grid-cols-[76px_124px_minmax(220px,1fr)_minmax(190px,0.8fr)_160px]"
                    : "grid-cols-[76px_140px_minmax(0,1fr)_160px]"
                )}
              >
                <span>Date</span>
                <span>Round</span>
                {showQuestionColumn && <span>Question</span>}
                <span>Feedback</span>
                <span className="text-right">Result</span>
              </div>
              <div className="divide-dashboard-panel-border divide-y">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      "grid min-w-0 items-center gap-4 py-5 text-sm",
                      showQuestionColumn
                        ? "grid-cols-[76px_124px_minmax(220px,1fr)_minmax(190px,0.8fr)_160px]"
                        : "grid-cols-[76px_140px_minmax(0,1fr)_160px]"
                    )}
                  >
                    <span className="text-dashboard-muted">
                      {row.dateLabel}
                    </span>
                    <span className="text-dashboard-foreground min-w-0 font-semibold break-words">
                      {row.roundLabel}
                    </span>
                    {showQuestionColumn && (
                      <span className="text-dashboard-foreground min-w-0 break-words">
                        {row.questionLabel}
                      </span>
                    )}
                    <span className="min-w-0">
                      {row.feedbackHref ? (
                        <div className="space-y-2">
                          <DashboardFeedbackStatus
                            state={row.feedbackState}
                            label={row.statusLabel}
                          />
                          <span className="text-dashboard-muted block break-words">
                            {row.feedbackKind === "scorecard" ? "Focus: " : ""}
                            {row.focusLabel}
                          </span>
                        </div>
                      ) : (
                        <DashboardFeedbackStatus
                          state={row.feedbackState}
                          label={row.statusLabel}
                        />
                      )}
                    </span>
                    <span className="min-w-0 text-right">
                      {row.feedbackHref ? (
                        <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-3">
                          <span className="text-dashboard-foreground font-mono font-semibold">
                            {row.scoreLabel}
                          </span>
                          <Link
                            href={row.feedbackHref}
                            className="text-primary font-semibold hover:underline"
                          >
                            Review
                          </Link>
                        </span>
                      ) : (
                        <span className="text-dashboard-muted text-sm">
                          {row.scoreLabel}
                        </span>
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

        <section
          className="border-dashboard-panel-border mt-3 border-t pt-7"
          aria-labelledby="history-patterns-title"
        >
          <div className="max-w-xl">
            <h2
              id="history-patterns-title"
              className="text-dashboard-foreground text-lg font-semibold"
            >
              {summary.patterns.some((pattern) => pattern.count > 1)
                ? "Patterns worth revisiting"
                : "Latest scored feedback"}
            </h2>
            <p className="text-dashboard-muted mt-1 text-sm leading-6">
              Repeated signals become patterns only after they appear across
              multiple scored interviews.
            </p>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.patterns.length > 0 ? (
              summary.patterns.map((pattern) => (
                <div key={pattern.label} className="min-w-0">
                  <h3 className="text-dashboard-foreground text-base font-semibold">
                    {pattern.label} {pattern.count > 1 ? pattern.count : ""}
                  </h3>
                  <p className="text-dashboard-muted mt-1 text-sm leading-6">
                    {pattern.description}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-dashboard-muted text-sm leading-6 sm:col-span-2 lg:col-span-3">
                Patterns appear after completed feedback includes scored
                dimensions.
              </p>
            )}
          </div>
        </section>
      </div>
    </DashboardPage>
  );
});

function CompactHistoryRow({ row }: { row: HistorySummary["rows"][number] }) {
  const showQuestion = row.questionLabel !== "—";

  return (
    <div className="grid min-w-0 gap-3 py-5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-dashboard-foreground font-semibold">
            {row.roundLabel}
          </span>
          <span className="text-dashboard-muted">{row.dateLabel}</span>
        </div>
        {showQuestion && (
          <p className="text-dashboard-foreground mt-2 leading-6 break-words">
            {row.questionLabel}
          </p>
        )}
        <div className="mt-3">
          <DashboardFeedbackStatus
            state={row.feedbackState}
            label={row.statusLabel}
          />
        </div>
        <p className="text-dashboard-muted mt-2 leading-6 break-words">
          {row.feedbackKind === "scorecard" ? "Focus: " : ""}
          {row.focusLabel}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-end">
        {row.feedbackHref ? (
          <div className="flex items-center gap-3">
            <span className="text-dashboard-foreground font-mono font-semibold">
              {row.scoreLabel}
            </span>
            <Link
              href={row.feedbackHref}
              className="text-primary font-semibold hover:underline"
            >
              Review
            </Link>
          </div>
        ) : (
          <span className="text-dashboard-muted text-sm">{row.scoreLabel}</span>
        )}
      </div>
    </div>
  );
}
