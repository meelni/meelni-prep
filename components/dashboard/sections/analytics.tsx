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
  const completedSessions =
    insights?.overall?.completedSessions ??
    insights?.overall?.completed_sessions ??
    sessions.filter((session) => session.feedback?.overallScore).length;
  const trend =
    insights?.trends?.improvementTrend ||
    insights?.trends?.improvement_trend ||
    "stable";
  const competencies = buildAnalyticsCompetencies(insights);
  const evidence = buildAnalyticsEvidence({
    completedSessions,
    focusAreaLabel: practiceSummary.focusArea.label,
    focusAreaScore: practiceSummary.focusArea.score,
    focusAreaDescription: practiceSummary.focusArea.description,
    readinessDeltaLabel: practiceSummary.readiness.deltaLabel,
  });

  if (loading) {
    return (
      <DashboardPage label="Analytics">
        <DashboardLoadingState
          className="min-h-[420px]"
          label="Loading readiness analytics..."
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

  if (completedSessions < 3) {
    return (
      <DashboardPage label="Analytics">
        <EmptyAnalyticsState
          title="Readiness needs a few more reps"
          description={`Complete ${Math.max(1, 3 - completedSessions)} more PM interview rep${3 - completedSessions === 1 ? "" : "s"} to unlock a reliable trend and bottleneck diagnosis.`}
          action={
            <Button asChild>
              <Link href="/dashboard/new-rep">Practice</Link>
            </Button>
          }
        />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage label="Analytics">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
      <section className="grid gap-6 border-b border-dashboard-panel-border pb-6 lg:grid-cols-[150px_1fr_auto] lg:items-center">
        <div>
          <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
            Readiness
          </p>
          <p className="font-mono text-5xl font-semibold text-dashboard-foreground">
            {practiceSummary.readiness.score}
          </p>
        </div>
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-dashboard-foreground">
            {getDiagnosis(practiceSummary.focusArea.label)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-dashboard-muted">
            Your next rep should force user outcome, business outcome,
            guardrail, and time horizon before solution ideas.
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
                  <span className="text-sm font-semibold text-dashboard-foreground">
                    {competency.label}
                  </span>
                  <span className="bg-dashboard-muted/15 h-2 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width:
                          competency.value === null
                            ? "0%"
                            : `${competency.value * 10}%`,
                      }}
                    />
                  </span>
                  <span className="text-right font-mono text-sm font-semibold text-dashboard-foreground">
                    {competency.value === null
                      ? "Needs data"
                      : competency.value.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-dashboard-panel-border pt-7">
            <div className="flex items-center justify-between gap-4">
              <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
                Readiness trend
              </p>
              <span className="text-sm font-semibold text-primary">
                {trend === "improving"
                  ? "Improving"
                  : trend === "declining"
                    ? "Needs attention"
                    : "Stable"}{" "}
                {practiceSummary.readiness.deltaLabel}
              </span>
            </div>
            <ProgressSignalBars
              bars={practiceSummary.progressSignal.bars}
              className="mt-16 h-32 gap-4"
              showLabels
            />
          </div>
        </section>

        <aside className="border-dashboard-panel-border border-t pt-7 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <div>
            <p className="text-dashboard-muted text-xs font-bold tracking-[0.3em] uppercase">
              Next target
            </p>
            <h3 className="mt-4 text-xl font-semibold text-dashboard-foreground">
              Open with {practiceSummary.focusArea.label.toLowerCase()}
            </h3>
            <p className="mt-3 text-sm leading-6 text-dashboard-muted">
              {practiceSummary.focusArea.description}
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
                <p className="text-sm leading-6 text-dashboard-muted">
                  Evidence appears once recent scored reps include dimension
                  feedback.
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
      <h2 className="font-display text-3xl leading-tight font-semibold text-dashboard-foreground">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-dashboard-muted">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function Evidence({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-lg font-semibold text-dashboard-foreground">{title}</h4>
      <p className="mt-1 text-sm leading-6 text-dashboard-muted">{children}</p>
    </div>
  );
}

function getDiagnosis(focusLabel: string) {
  if (focusLabel === "Metrics depth") {
    return "Structure is strong. Metrics depth is still blocking readiness.";
  }
  return `${focusLabel} is the current bottleneck before interview readiness.`;
}
