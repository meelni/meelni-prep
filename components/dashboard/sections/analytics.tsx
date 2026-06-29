"use client";

import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Clock,
  Award,
  Sparkles,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import {
  DashboardMetricCard,
  DashboardSkeletonCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import {
  PerformanceTrend,
  CompetencyBreakdown,
  TypeDistribution,
  TimeInvestment,
  ScoreByType,
} from "@/components/dashboard/charts";
import { ScoreByDifficulty } from "@/components/dashboard/charts/score-by-difficulty";
import { WeakestAreaCard } from "@/components/dashboard/weakest-area-card";
import {
  aggregatePerformanceTrend,
  aggregateCompetencyScores,
  aggregateTypeDistribution,
  aggregateTimeInvestment,
  aggregateScoreByType,
  aggregateScoreByDifficulty,
  calculateRecommendedDifficulty,
} from "@/lib/analytics/aggregations";
import type { SessionWithFeedback } from "@/lib/analytics/aggregations";

/**
 * User insights data structure (from /api/insights)
 */
interface UserInsights {
  overall: {
    total_sessions: number;
    completed_sessions: number;
    total_minutes: number;
    avg_score: number;
    median_score: number;
    percentile_25: number;
    percentile_75: number;
    percentile_90: number;
    current_streak: number;
    longest_streak: number;
  };
  byType: {
    product_sense: { count: number; avg_score: number; last_5_avg: number };
    analytical: { count: number; avg_score: number; last_5_avg: number };
    leadership: { count: number; avg_score: number; last_5_avg: number };
    strategy: { count: number; avg_score: number; last_5_avg: number };
  };
  byDifficulty: {
    junior: { count: number; avg_score: number };
    intermediate: { count: number; avg_score: number };
    senior: { count: number; avg_score: number };
  };
  trends: {
    last_5_sessions_avg: number;
    all_time_avg: number;
    improvement_trend: "improving" | "stable" | "declining";
    velocity: number;
  };
  competencies: {
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  };
  lastUpdated?: string;
}

/**
 * Empty State Component
 */
function EmptyState({ sessionsCompleted }: { sessionsCompleted: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className="space-y-6 p-6"
    >
      <DashboardStateCard
        icon={<Sparkles className="h-8 w-8" />}
        title="Building Your Analytics"
        description={
          <>
            You've completed {sessionsCompleted}{" "}
            {sessionsCompleted === 1 ? "session" : "sessions"}. Complete{" "}
            {3 - sessionsCompleted} more to unlock detailed analytics and
            performance insights.
          </>
        }
      >
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-3 w-3 rounded-full ${
                i <= sessionsCompleted ? "bg-primary" : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 pt-6 md:grid-cols-3">
          <div className="border-border bg-card rounded-lg border p-4">
            <Target className="text-primary mx-auto mb-2 h-6 w-6" />
            <div className="text-muted-foreground text-sm">
              Performance trends
            </div>
          </div>
          <div className="border-border bg-card rounded-lg border p-4">
            <Award className="text-primary mx-auto mb-2 h-6 w-6" />
            <div className="text-muted-foreground text-sm">
              Competency breakdown
            </div>
          </div>
          <div className="border-border bg-card rounded-lg border p-4">
            <TrendingUp className="text-primary mx-auto mb-2 h-6 w-6" />
            <div className="text-muted-foreground text-sm">
              Improvement insights
            </div>
          </div>
        </div>
      </DashboardStateCard>
    </motion.div>
  );
}

/**
 * Loading State Component (Skeleton UI)
 */
function LoadingState() {
  return (
    <div className="space-y-6 p-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <DashboardSkeletonCard key={i} />
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardSkeletonCard variant="chart" />
        <DashboardSkeletonCard variant="chart" />
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center py-8">
        <div className="space-y-3 text-center">
          <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">Loading analytics...</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Stats Card Component
 */
function StatCard({
  icon: Icon,
  label,
  value,
  change,
  suffix = "",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  change?: number;
  suffix?: string;
}) {
  const changeIcon =
    change !== undefined
      ? change > 0
        ? TrendingUp
        : change < 0
          ? TrendingDown
          : Minus
      : null;

  const changeColor =
    change !== undefined
      ? change > 0
        ? "text-success"
        : change < 0
          ? "text-destructive"
          : "text-muted-foreground"
      : "";

  const ChangeIcon = changeIcon;

  return (
    <motion.div variants={fadeInUp}>
      <DashboardMetricCard
        icon={Icon}
        label={label}
        value={
          <>
            {value}
            {suffix}
          </>
        }
        indicator={
          ChangeIcon && change !== undefined ? (
            <div className={`flex items-center gap-1 text-xs ${changeColor}`}>
              <ChangeIcon className="h-3 w-3" />
              {Math.abs(change)}%
            </div>
          ) : null
        }
        valueClassName="text-2xl"
      />
    </motion.div>
  );
}

/**
 * Main Analytics Section Component
 */
export const AnalyticsSection = memo(function AnalyticsSection() {
  const [insights, setInsights] = useState<UserInsights | null>(null);
  const [sessions, setSessions] = useState<SessionWithFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch insights and sessions on mount
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch insights
        const insightsResponse = await fetch("/api/insights");
        if (!insightsResponse.ok) {
          throw new Error("Failed to fetch insights");
        }
        const insightsData = await insightsResponse.json();
        setInsights(insightsData);

        // Fetch sessions with feedback for charts
        const sessionsResponse = await fetch("/api/sessions?limit=30");
        if (!sessionsResponse.ok) {
          throw new Error("Failed to fetch sessions");
        }
        const sessionsData = await sessionsResponse.json();

        // Transform sessions to include feedback (filter out sessions without feedback)
        // Convert date strings to Date objects for aggregation functions
        const sessionsWithFeedback = (
          sessionsData.sessions as Array<
            SessionWithFeedback & {
              startedAt: string | Date | null;
              endedAt: string | Date | null;
            }
          >
        )
          .filter(
            (
              s
            ): s is SessionWithFeedback & {
              startedAt: string | Date;
              endedAt: string | Date | null;
            } => s.feedback !== null && s.startedAt !== null
          )
          .map((s) => ({
            ...s,
            startedAt: new Date(s.startedAt),
            endedAt: s.endedAt ? new Date(s.endedAt) : null,
          }));
        setSessions(sessionsWithFeedback);
      } catch (err) {
        console.error("Error fetching analytics data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Loading state
  if (loading) {
    return <LoadingState />;
  }

  // Error state
  if (error || !insights) {
    return (
      <div className="p-6">
        <DashboardStateCard
          title="Failed to load analytics"
          description="Please try again later."
          tone="danger"
        />
      </div>
    );
  }

  // Empty state (<3 sessions)
  if (insights.overall.total_sessions < 3) {
    return <EmptyState sessionsCompleted={insights.overall.total_sessions} />;
  }

  // Prepare chart data using aggregation utilities
  const performanceTrendData = aggregatePerformanceTrend(sessions);
  const competencyData = aggregateCompetencyScores(sessions);
  const typeDistributionData = aggregateTypeDistribution(sessions);
  const timeInvestmentData = aggregateTimeInvestment(sessions, "week");
  const scoreByTypeData = aggregateScoreByType(sessions);
  const scoreByDifficultyData = aggregateScoreByDifficulty(sessions);
  const recommendedDifficulty = calculateRecommendedDifficulty(sessions);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6 p-6"
    >
      {/* Stats Cards */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <StatCard
          icon={Target}
          label="Total Sessions"
          value={insights.overall.total_sessions}
        />
        <StatCard
          icon={Award}
          label="Avg Score"
          value={insights.overall.avg_score}
          suffix="/10"
          change={
            insights.trends.improvement_trend === "improving"
              ? 5
              : insights.trends.improvement_trend === "declining"
                ? -5
                : 0
          }
        />
        <StatCard
          icon={Clock}
          label="Total Time"
          value={insights.overall.total_minutes}
          suffix="m"
        />
      </motion.div>

      {/* Charts Grid - 2 Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Performance Trend - Uses ClippedAreaChart */}
        <motion.div variants={fadeInUp}>
          <PerformanceTrend
            data={performanceTrendData}
            onSessionClick={(sessionId) => {
              // TODO: Navigate to session detail page
              console.log("Navigate to session:", sessionId);
            }}
          />
        </motion.div>

        {/* Competency Breakdown - Uses GlowingStrokeRadarChart */}
        <motion.div variants={fadeInUp}>
          <CompetencyBreakdown
            data={competencyData}
            onCompetencyClick={(competency) => {
              // TODO: Filter sessions by competency
              console.log("Filter by competency:", competency);
            }}
          />
        </motion.div>
      </div>

      {/* Interview Type Distribution - Full Width - Uses RoundedPieChart */}
      <motion.div variants={fadeInUp}>
        <TypeDistribution
          data={typeDistributionData}
          onTypeClick={(type) => {
            // TODO: Navigate to filtered history
            console.log("Filter by type:", type);
          }}
        />
      </motion.div>

      {/* Additional Charts Grid - 2 Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time Investment - Uses GradientBarChart */}
        <motion.div variants={fadeInUp}>
          <TimeInvestment data={timeInvestmentData} groupBy="week" />
        </motion.div>

        {/* Score by Type Comparison - Uses DefaultMultipleBarChart */}
        <motion.div variants={fadeInUp}>
          <ScoreByType
            data={scoreByTypeData}
            onTypeClick={(type) => {
              // TODO: Navigate to filtered history
              console.log("Filter by type:", type);
            }}
          />
        </motion.div>
      </div>

      {/* PRAC-003: Score by Difficulty - Full Width */}
      <motion.div variants={fadeInUp}>
        <ScoreByDifficulty
          data={scoreByDifficultyData}
          recommendedDifficulty={recommendedDifficulty}
        />
      </motion.div>

      {/* PRAC-004: Weakest Area Card - Full Width */}
      <motion.div variants={fadeInUp}>
        <WeakestAreaCard sessions={sessions} />
      </motion.div>
    </motion.div>
  );
});
