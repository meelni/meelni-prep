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
      <DashboardPage label="Practice Home">
        <DashboardLoadingState
          className="min-h-[420px]"
          label="Loading practice home..."
        />
      </DashboardPage>
    );
  }

  const summary = buildDashboardPracticeSummary(
    sessions as DashboardSessionInput[]
  );

  return (
    <DashboardPage label="Practice Home">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <section className="max-w-3xl space-y-3">
          <div className="space-y-3">
            <h2 className="font-display text-3xl leading-[1.08] font-semibold text-dashboard-foreground sm:text-4xl">
              {summary.isNewUser
                ? "Your first PM interview rep starts here."
                : "Today's highest-leverage rep"}
            </h2>
            <p className="max-w-2xl text-base leading-7 text-dashboard-muted">
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
                <h2 className="font-display text-2xl leading-tight font-semibold text-dashboard-foreground sm:text-3xl">
                  {summary.recommendation.title}
                </h2>
                <p className="text-base leading-7 text-dashboard-muted">
                  {summary.recommendation.description}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link href={summary.recommendation.href}>
                    Start rep
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                {summary.lastFeedback && (
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="border-dashboard-panel-border bg-transparent text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground"
                  >
                    <Link href={summary.lastFeedback.href}>Feedback</Link>
                  </Button>
                )}
              </div>
            </div>

            <aside className="border-dashboard-panel-border border-t py-6 sm:py-7 lg:border-t-0 lg:border-l lg:pl-8">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Readiness
              </p>
              <div className="mt-5 font-mono text-5xl leading-none font-semibold text-dashboard-muted sm:text-6xl">
                {summary.readiness.score}
                <span className="text-dashboard-muted/60">/100</span>
              </div>
              <div className="bg-dashboard-muted/15 mt-5 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${summary.readiness.score}%` }}
                />
              </div>
              <p className="mt-5 text-sm leading-6 text-dashboard-muted">
                {summary.readiness.description}
              </p>
            </aside>
          </div>
        </section>

        <section className="border-dashboard-panel-border grid border-b py-6 md:grid-cols-3">
        <InfoPanel
          eyebrow="Readiness snapshot"
          title={String(summary.readiness.score)}
          meta={summary.readiness.deltaLabel}
          rows={[
            ["Best signal", summary.lastFeedback ? "Structure" : "First rep"],
            ["Focus area", summary.focusArea.label],
          ]}
        />
        <div className="border-dashboard-panel-border mt-7 border-t pt-7 md:mt-0 md:border-t-0 md:border-l md:px-7 md:pt-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Last feedback
            </p>
            <span className="text-xs text-dashboard-muted">
              {summary.lastFeedback ? "Latest" : "Pending"}
            </span>
          </div>
          <p className="mt-5 min-h-16 text-base leading-7 text-dashboard-foreground">
            {summary.lastFeedback?.summary ||
              "Complete a rep to unlock a calibrated feedback summary."}
          </p>
          {summary.lastFeedback && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-dashboard-panel-border mt-5 bg-transparent text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground"
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
                  <p className="text-sm font-semibold text-dashboard-foreground">
                    {item.label}
                  </p>
                  <p className="text-sm text-dashboard-muted">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </section>

        <section className="grid gap-8 py-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center justify-between gap-4 border-b border-dashboard-panel-border pb-4">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Recent reps
            </p>
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link href="/dashboard/history">All</Link>
            </Button>
          </div>
          {summary.recentReps.length > 0 ? (
            <div className="divide-y divide-dashboard-panel-border">
              {summary.recentReps.map((rep) => (
                <Link
                  key={rep.id}
                  href={rep.feedbackHref || "/dashboard/history"}
                  className="grid gap-3 py-4 text-sm transition-colors hover:text-primary sm:grid-cols-[88px_150px_1fr_56px]"
                >
                  <span className="text-dashboard-muted">{rep.dateLabel}</span>
                  <span className="font-semibold text-dashboard-foreground">
                    {rep.roundLabel}
                  </span>
                  <span className="text-dashboard-muted">{rep.focusLabel}</span>
                  <span className="font-mono font-semibold text-dashboard-foreground sm:text-right">
                    {rep.scoreLabel}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-10 text-sm text-dashboard-muted">
              Your reps will appear here after your first interview.
            </div>
          )}
        </div>

        <div className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
            Progress signal
          </p>
          <ProgressSignalBars
            bars={summary.progressSignal.bars}
            className="mt-8 h-28"
          />
          <p className="mt-6 text-sm leading-6 text-dashboard-muted">
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
        <span className="font-mono text-5xl leading-none font-semibold text-dashboard-foreground">
          {title}
        </span>
        <CheckCircle2 className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-5 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-dashboard-muted">{label}</span>
            <span className="text-sm font-semibold text-dashboard-foreground">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
