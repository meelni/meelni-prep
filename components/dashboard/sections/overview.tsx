"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardFeedbackStatus } from "@/components/dashboard/dashboard-feedback-status";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import {
  buildDashboardPracticeSummary,
  type DashboardPracticeSummary,
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
  return (
    <DashboardPage label="Overview">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col">
        <section className="min-w-0 overflow-hidden">
          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5 py-6 pr-0 sm:py-8 lg:pr-8">
              <div className="text-dashboard-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-dashboard-accent font-semibold">
                  {summary.recommendation.eyebrow}
                </span>
                <span aria-hidden="true">·</span>
                <span>{summary.recommendation.experienceLevel}</span>
                <span aria-hidden="true">·</span>
                <span>{summary.recommendation.creditLabel}</span>
              </div>
              <div className="max-w-3xl space-y-3">
                <h2 className="font-display text-dashboard-foreground text-2xl leading-tight font-semibold sm:text-3xl">
                  {summary.recommendation.title}
                </h2>
                <p className="text-dashboard-muted text-base leading-7">
                  {summary.recommendation.description}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
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

            <aside className="border-dashboard-panel-border min-w-0 border-t py-6 sm:py-8 lg:border-t-0 lg:border-l lg:pl-8">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                {summary.progress.label}
              </p>
              <div className="text-dashboard-foreground mt-4 font-mono text-5xl leading-none font-semibold sm:text-6xl">
                {summary.progress.score?.toFixed(1) ?? "—"}
                <span className="text-dashboard-muted">/10</span>
              </div>
              {summary.progress.state === "trend" &&
                summary.progress.score !== null && (
                  <div
                    className="bg-dashboard-muted/15 mt-5 h-2 overflow-hidden rounded-full"
                    role="meter"
                    aria-label="Recent interview average"
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={summary.progress.score}
                  >
                    <div
                      className="bg-dashboard-accent h-full rounded-full"
                      style={{ width: `${summary.progress.score * 10}%` }}
                    />
                  </div>
                )}
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

        <section className="border-dashboard-panel-border mt-2 border-t py-6 sm:py-8">
          <div className="flex items-center justify-between gap-4 pb-3">
            <h2 className="text-dashboard-foreground text-base font-semibold">
              Recent interviews
            </h2>
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
                <RecentInterviewRow key={interview.id} interview={interview} />
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

function RecentInterviewRow({
  interview,
}: {
  interview: DashboardPracticeSummary["recentInterviews"][number];
}) {
  const content = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-dashboard-foreground font-semibold">
            {interview.roundLabel}
          </span>
          <span className="text-dashboard-muted">{interview.dateLabel}</span>
        </div>
        <p className="text-dashboard-muted mt-1 leading-6 break-words">
          {interview.focusLabel}
        </p>
      </div>
      {interview.feedbackKind === "scored" ? (
        <span className="text-dashboard-foreground shrink-0 font-mono font-semibold sm:text-right">
          {interview.scoreLabel}
        </span>
      ) : (
        <DashboardFeedbackStatus
          state={interview.feedbackState}
          label={
            interview.feedbackKind === "evidence_limited"
              ? interview.statusLabel
              : interview.scoreLabel
          }
          className="justify-self-start sm:justify-self-end"
        />
      )}
    </>
  );
  const className =
    "grid min-w-0 gap-3 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center";

  if (!interview.feedbackHref) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link
      href={interview.feedbackHref}
      className={`${className} hover:text-primary transition-colors`}
    >
      {content}
    </Link>
  );
}
