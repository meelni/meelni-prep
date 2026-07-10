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
          fetch("/api/insights"),
          fetch("/api/sessions?limit=30"),
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
        <section className="border-dashboard-panel-border grid gap-6 border-b pb-6 lg:grid-cols-[150px_1fr_auto] lg:items-center">
          <div>
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              {practiceSummary.progress.label}
            </p>
            <p className="text-dashboard-foreground font-mono text-5xl font-semibold">
              {practiceSummary.progress.score?.toFixed(1) ?? "—"}
              <span className="text-dashboard-muted text-xl">/10</span>
            </p>
          </div>
          <div className="max-w-3xl">
            <h2 className="text-dashboard-foreground text-xl font-semibold">
              {getDiagnosis(practiceSummary.focusArea?.label)}
            </h2>
            <p className="text-dashboard-muted mt-2 text-sm leading-6">
              {practiceSummary.focusArea?.description ||
                "Review completed feedback and choose one concrete improvement before the next interview."}
            </p>
          </div>
          <Button asChild>
            <Link href={practiceSummary.recommendation.href}>Practice</Link>
          </Button>
        </section>

        <div className="grid gap-8 py-6 lg:grid-cols-[1fr_330px]">
          <section className="min-w-0 space-y-8">
            <div>
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Competencies
              </p>
              <div className="mt-5 space-y-4">
                {competencies.map((competency) => (
                  <div
                    key={competency.label}
                    className="grid grid-cols-[130px_minmax(0,1fr)_88px] items-center gap-4"
                  >
                    <span className="text-dashboard-foreground text-sm font-semibold">
                      {competency.label}
                    </span>
                    <span className="bg-dashboard-muted/15 h-2 overflow-hidden rounded-full">
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
                    <span className="text-dashboard-foreground text-right font-mono text-sm font-semibold">
                      {competency.value === null
                        ? "Needs data"
                        : competency.value.toFixed(1)}
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
                className="mt-16 h-32 gap-4"
                showLabels
              />
            </div>
          </section>

          <aside className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div>
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Next target
              </p>
              <h3 className="text-dashboard-foreground mt-4 text-xl font-semibold">
                {practiceSummary.focusArea
                  ? `Practice ${practiceSummary.focusArea.label.toLowerCase()}`
                  : "Review completed feedback"}
              </h3>
              <p className="text-dashboard-muted mt-3 text-sm leading-6">
                {practiceSummary.focusArea?.description ||
                  "No dimension-level practice target is available yet."}
              </p>
            </div>

            <div className="mt-8">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Evidence
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

function getDiagnosis(focusLabel: string | undefined) {
  return focusLabel
    ? `${focusLabel} is the lowest scored dimension in recent completed feedback.`
    : "Recent feedback does not include a dimension-level practice target yet.";
}
