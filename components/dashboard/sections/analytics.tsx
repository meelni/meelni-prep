"use client";

import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";
import { ProgressSignalBars } from "@/components/dashboard/charts/progress-signal-bars";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import {
  buildDashboardPracticeSummary,
  type DashboardSessionInput,
} from "@/lib/dashboard/contracts";
import {
  buildAnalyticsCompetencies,
  buildAnalyticsEvidence,
  type AnalyticsInsightsResponse,
} from "@/lib/dashboard/analytics-contracts";
import type { Session } from "@/lib/api/queries";

export const AnalyticsSection = memo(function AnalyticsSection() {
  const [insights, setInsights] = useState<AnalyticsInsightsResponse | null>(
    null
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [insightsResponse, sessionsResponse] = await Promise.all([
          fetch("/api/insights", { cache: "no-store" }),
          fetch("/api/sessions?limit=30", { cache: "no-store" }),
        ]);

        if (!insightsResponse.ok) {
          throw new Error("Failed to fetch insights");
        }
        if (!sessionsResponse.ok) {
          throw new Error("Failed to fetch sessions");
        }

        const insightsData = await insightsResponse.json();
        const sessionsData = await sessionsResponse.json();
        setInsights(insightsData);
        setSessions(sessionsData.sessions || []);
      } catch (err) {
        console.error("Error fetching analytics data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const practiceSummary = useMemo(
    () => buildDashboardPracticeSummary(sessions as DashboardSessionInput[]),
    [sessions]
  );
  const completedSessions = practiceSummary.progress.scoredInterviewCount;
  const competencies = buildAnalyticsCompetencies(insights);
  const evidence = practiceSummary.focusArea
    ? buildAnalyticsEvidence({
        focusAreaLabel: practiceSummary.focusArea.label,
        focusAreaScore: practiceSummary.focusArea.score,
        focusAreaDescription: practiceSummary.focusArea.description,
        progressDeltaLabel: practiceSummary.progress.deltaLabel,
      })
    : [];

  if (loading) {
    return (
      <DashboardPage label="Analytics">
        <DashboardLoadingState
          className="min-h-[420px]"
          label="Loading practice analytics..."
        />
      </DashboardPage>
    );
  }

  if (error) {
    return (
      <DashboardPage label="Analytics">
        <EmptyAnalyticsState
          title="Failed to load analytics"
          description="Please try again later."
        />
      </DashboardPage>
    );
  }

  if (completedSessions < 2) {
    const remainingInterviews = 2 - completedSessions;
    return (
      <DashboardPage label="Analytics">
        <EmptyAnalyticsState
          title="Complete more scored interviews to compare progress"
          description={`Complete ${remainingInterviews} more PM mock interview${remainingInterviews === 1 ? "" : "s"} to compare observed scores and show dimension summaries here.`}
          action={
            <Button asChild>
              <Link href="/dashboard/new-interview">Start mock interview</Link>
            </Button>
          }
        />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage label="Analytics">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <section className="border-dashboard-panel-border grid gap-5 border-b pb-5 lg:grid-cols-[160px_minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Recent average
            </p>
            <p className="text-dashboard-foreground mt-1 font-mono text-4xl font-semibold">
              {practiceSummary.progress.score?.toFixed(1) ?? "—"}
              <span className="text-dashboard-muted text-base">/10</span>
            </p>
            <p className="text-dashboard-muted mt-1 text-xs">
              {completedSessions} scored interviews
            </p>
          </div>
          <div className="max-w-3xl">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Next focus
            </p>
            <h2 className="text-dashboard-foreground mt-2 text-xl font-semibold">
              {getFocusTitle(practiceSummary.focusArea?.label)}
            </h2>
            <p className="text-dashboard-muted mt-1 text-sm leading-6">
              {practiceSummary.focusArea?.description ||
                "Review completed feedback and choose one concrete improvement before the next interview."}
            </p>
          </div>
          <Button asChild className="lg:mb-0.5">
            <Link href={practiceSummary.recommendation.href}>
              {practiceSummary.focusArea
                ? `Practice ${practiceSummary.focusArea.label.toLowerCase()}`
                : "Start mock interview"}
            </Link>
          </Button>
        </section>

        <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-7">
            <div>
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Observed dimensions
              </p>
              <p className="text-dashboard-muted mt-2 text-sm leading-6">
                Scores appear only where completed feedback includes that
                dimension.
              </p>
              <div className="mt-5 space-y-4">
                {competencies.map((competency) => (
                  <div key={competency.label} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-dashboard-foreground text-sm font-semibold">
                        {competency.label}
                      </span>
                      <span className="text-dashboard-foreground shrink-0 font-mono text-sm font-semibold">
                        {competency.value === null
                          ? "Needs data"
                          : competency.value.toFixed(1)}
                      </span>
                    </div>
                    <span className="bg-dashboard-muted/15 mt-2 block h-2 overflow-hidden rounded-full">
                      <span
                        className="bg-primary block h-full rounded-full"
                        style={{
                          width:
                            competency.value === null
                              ? "0%"
                              : `${competency.value * 10}%`,
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-dashboard-panel-border border-t pt-7">
              <div className="flex items-center justify-between gap-4">
                <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                  Score trend
                </p>
                <span className="text-primary text-sm font-semibold">
                  {practiceSummary.progress.deltaLabel}
                </span>
              </div>
              <ProgressSignalBars
                bars={practiceSummary.progressSignal.bars}
                className="mt-6 h-40 gap-4"
                showLabels
              />
            </div>
          </section>

          <aside className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Why this focus
            </p>
            <div className="mt-5 space-y-5">
              {evidence.length > 0 ? (
                evidence.map((item) => (
                  <Evidence key={item.title} title={item.title}>
                    {item.description}
                  </Evidence>
                ))
              ) : (
                <p className="text-dashboard-muted text-sm leading-6">
                  Evidence appears once recent scored interviews include
                  dimension feedback.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </DashboardPage>
  );
});

function EmptyAnalyticsState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-xl flex-col items-center justify-center text-center">
      <h2 className="font-display text-dashboard-foreground text-3xl leading-tight font-semibold">
        {title}
      </h2>
      <p className="text-dashboard-muted mt-4 text-base leading-7">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function Evidence({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-dashboard-foreground text-lg font-semibold">
        {title}
      </h4>
      <p className="text-dashboard-muted mt-1 text-sm leading-6">{children}</p>
    </div>
  );
}

function getFocusTitle(focusLabel: string | undefined) {
  return focusLabel
    ? `Focus next on ${focusLabel.toLowerCase()}`
    : "Choose one improvement from recent feedback";
}
