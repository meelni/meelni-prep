"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { StatusPill } from "@/components/ui/app-surface";
import {
  buildDashboardPracticeSummary,
  type DashboardSessionInput,
} from "@/lib/dashboard/contracts";
import type { Session } from "@/lib/api/queries";

interface OverviewSectionProps {
  sessions: Session[];
  loadingSessions: boolean;
  totalSessions: number;
  avgScore?: number;
  totalMinutes: number;
  completionRate: number;
}

export const OverviewSection = memo(function OverviewSection({
  sessions,
  loadingSessions,
}: OverviewSectionProps) {
  if (loadingSessions) {
    return (
      <DashboardPage label="Overview">
        <DashboardLoadingState
          className="min-h-[420px]"
          label="Loading overview..."
        />
      </DashboardPage>
    );
  }

  const summary = buildDashboardPracticeSummary(
    sessions as DashboardSessionInput[]
  );
  const recommendationMetadata = [
    summary.recommendation.roundType,
    summary.recommendation.difficulty,
    summary.recommendation.creditLabel,
  ];

  return (
    <DashboardPage label="Overview">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <section className="border-dashboard-panel-border overflow-hidden border-y">
          <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
            <div className="space-y-5 py-6 pr-0 sm:py-8 lg:pr-8">
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  tone="primary"
                  className="border-primary/30 bg-primary text-primary-foreground font-bold"
                >
                  {summary.recommendation.eyebrow}
                </StatusPill>
                {recommendationMetadata.map((label) => (
                  <StatusPill
                    key={label}
                    className="border-dashboard-panel-border bg-dashboard-muted/15 text-dashboard-foreground font-bold"
                  >
                    {label}
                  </StatusPill>
                ))}
              </div>
              <div className="max-w-3xl space-y-3">
                <h2 className="font-display text-dashboard-foreground text-2xl leading-tight font-semibold sm:text-3xl">
                  {summary.recommendation.title}
                </h2>
                <p className="text-dashboard-muted text-base leading-7">
                  {summary.recommendation.description}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link href={summary.recommendation.href}>
                    Start mock interview
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                {summary.lastFeedback && (
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground bg-transparent"
                  >
                    <Link href={summary.lastFeedback.href}>
                      Review latest feedback
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <aside className="border-dashboard-panel-border border-t py-6 sm:py-8 lg:border-t-0 lg:border-l lg:pl-8">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                {summary.progress.label}
              </p>
              <div className="text-dashboard-muted mt-5 font-mono text-5xl leading-none font-semibold sm:text-6xl">
                {summary.progress.score?.toFixed(1) ?? "—"}
                <span className="text-dashboard-muted">/10</span>
              </div>
              <div className="bg-dashboard-muted/15 mt-5 h-2 overflow-hidden rounded-full">
                {summary.progress.score !== null && (
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${summary.progress.score * 10}%` }}
                  />
                )}
              </div>
              <p className="text-dashboard-muted mt-5 text-sm leading-6">
                {summary.progress.description}
              </p>
              <dl className="border-dashboard-panel-border mt-5 space-y-3 border-t pt-5">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-dashboard-muted text-sm">
                    Scored interviews
                  </dt>
                  <dd className="text-dashboard-foreground text-sm font-semibold">
                    {summary.progress.scoredInterviewCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-dashboard-muted text-sm">Focus area</dt>
                  <dd className="text-dashboard-foreground text-sm font-semibold">
                    {summary.focusArea?.label || "Pending feedback"}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section className="py-6 sm:py-8">
          <div className="border-dashboard-panel-border flex items-center justify-between gap-4 border-b pb-4">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Recent interviews
            </p>
            <Button
              asChild
              variant="link"
              size="sm"
              className="text-dashboard-foreground h-auto p-0 hover:text-white"
            >
              <Link href="/dashboard/history">View history</Link>
            </Button>
          </div>
          {summary.recentInterviews.length > 0 ? (
            <div className="divide-dashboard-panel-border divide-y">
              {summary.recentInterviews.map((interview) => (
                <Link
                  key={interview.id}
                  href={interview.feedbackHref || "/dashboard/history"}
                  className="hover:text-primary grid gap-3 py-4 text-sm transition-colors sm:grid-cols-[88px_150px_1fr_56px]"
                >
                  <span className="text-dashboard-muted">
                    {interview.dateLabel}
                  </span>
                  <span className="text-dashboard-foreground font-semibold">
                    {interview.roundLabel}
                  </span>
                  <span className="text-dashboard-muted">
                    {interview.focusLabel}
                  </span>
                  <span className="text-dashboard-foreground font-mono font-semibold sm:text-right">
                    {interview.scoreLabel}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-dashboard-muted py-10 text-sm">
              Your interviews will appear here after your first session.
            </div>
          )}
        </section>
      </div>
    </DashboardPage>
  );
});
