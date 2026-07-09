"use client";

import { memo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";
import { ProgressSignalBars } from "@/components/dashboard/charts/progress-signal-bars";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import {
  buildDashboardPracticeSummary,
  type DashboardSessionInput,
} from "@/lib/dashboard/contracts";
import type { Session } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

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
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <section className="max-w-3xl space-y-3">
          <div className="space-y-3">
            <h2 className="font-display text-dashboard-foreground text-3xl leading-[1.08] font-semibold sm:text-4xl">
              {summary.isNewUser
                ? "Your first PM mock interview starts here."
                : "Today's highest-leverage interview"}
            </h2>
            <p className="text-dashboard-muted max-w-2xl text-base leading-7">
              {summary.isNewUser
                ? "Start with one real Product Sense answer out loud. Meelni will turn the result into your next practice plan."
                : "A focused next action based on your recent PM interview feedback, not a dashboard you have to interpret."}
            </p>
          </div>
        </section>

        <section className="border-dashboard-panel-border mt-5 overflow-hidden border-y">
          <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
            <div className="space-y-5 py-6 pr-0 sm:py-7 lg:pr-8">
              <div className="flex flex-wrap gap-2">
                <Pill tone="primary">{summary.recommendation.eyebrow}</Pill>
                <Pill>{summary.recommendation.roundType}</Pill>
                <Pill>{summary.recommendation.difficulty}</Pill>
                <Pill>{summary.recommendation.creditLabel}</Pill>
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
                    <Link href={summary.lastFeedback.href}>Feedback</Link>
                  </Button>
                )}
              </div>
            </div>

            <aside className="border-dashboard-panel-border border-t py-6 sm:py-7 lg:border-t-0 lg:border-l lg:pl-8">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Recent practice score
              </p>
              <div className="text-dashboard-muted mt-5 font-mono text-5xl leading-none font-semibold sm:text-6xl">
                {summary.progress.score}
                <span className="text-dashboard-muted/60">/100</span>
              </div>
              <div className="bg-dashboard-muted/15 mt-5 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${summary.progress.score}%` }}
                />
              </div>
              <p className="text-dashboard-muted mt-5 text-sm leading-6">
                {summary.progress.description}
              </p>
            </aside>
          </div>
        </section>

        <section className="border-dashboard-panel-border grid border-b py-6 md:grid-cols-3">
          <InfoPanel
            eyebrow="Progress signal"
            title={String(summary.progress.score)}
            meta={summary.progress.deltaLabel}
            rows={[
              [
                "Best signal",
                summary.lastFeedback ? "Structure" : "First interview",
              ],
              ["Focus area", summary.focusArea.label],
            ]}
          />
          <div className="border-dashboard-panel-border mt-7 border-t pt-7 md:mt-0 md:border-t-0 md:border-l md:px-7 md:pt-0">
            <div className="flex items-center justify-between gap-4">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Last feedback
              </p>
              <span className="text-dashboard-muted text-xs">
                {summary.lastFeedback ? "Latest" : "Pending"}
              </span>
            </div>
            <p className="text-dashboard-foreground mt-5 min-h-16 text-base leading-7">
              {summary.lastFeedback?.summary ||
                "Complete an interview to unlock a calibrated feedback summary."}
            </p>
            {summary.lastFeedback && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-dashboard-panel-border text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground mt-5 bg-transparent"
              >
                <Link href={summary.lastFeedback.href}>Feedback</Link>
              </Button>
            )}
          </div>
          <div className="border-dashboard-panel-border mt-7 border-t pt-7 md:mt-0 md:border-t-0 md:border-l md:px-7 md:pt-0">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Prep plan
            </p>
            <div className="mt-5 space-y-4">
              {summary.prepPlan.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-1 h-4 w-4 shrink-0 rounded-full",
                      item.active ? "bg-primary" : "bg-dashboard-muted/15"
                    )}
                  />
                  <div>
                    <p className="text-dashboard-foreground text-sm font-semibold">
                      {item.label}
                    </p>
                    <p className="text-dashboard-muted text-sm">{item.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="border-dashboard-panel-border flex items-center justify-between gap-4 border-b pb-4">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Recent interviews
              </p>
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href="/dashboard/history">All</Link>
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
          </div>

          <div className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Progress signal
            </p>
            <ProgressSignalBars
              bars={summary.progressSignal.bars}
              className="mt-8 h-28"
            />
            <p className="text-dashboard-muted mt-6 text-sm leading-6">
              {summary.progressSignal.description}
            </p>
          </div>
        </section>
      </div>
    </DashboardPage>
  );
});

function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-bold",
        tone === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-dashboard-muted/15 text-dashboard-foreground"
      )}
    >
      {children}
    </span>
  );
}

function InfoPanel({
  eyebrow,
  title,
  meta,
  rows,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="md:pr-7">
      <div className="flex items-center justify-between gap-4">
        <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
          {eyebrow}
        </p>
        <span className="text-primary text-xs font-semibold">{meta}</span>
      </div>
      <div className="mt-5 flex items-end gap-4">
        <span className="text-dashboard-foreground font-mono text-5xl leading-none font-semibold">
          {title}
        </span>
        <CheckCircle2
          className="text-primary mb-2 h-5 w-5"
          aria-hidden="true"
        />
      </div>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="text-dashboard-muted text-sm">{label}</span>
            <span className="text-dashboard-foreground text-sm font-semibold">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
