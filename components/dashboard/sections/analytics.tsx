"use client";

import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Clock,
  Award,
  Zap,
  Sparkles,
  Loader2,
  Calendar,
  Filter,
} from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import {
  PerformanceTrend,
  CompetencyBreakdown,
  TypeDistribution,
  TimeInvestment,
  ScoreByType,
} from "@/components/dashboard/charts";
import {
  aggregatePerformanceTrend,
  aggregateCompetencyScores,
  aggregateTypeDistribution,
  aggregateTimeInvestment,
  aggregateScoreByType,
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
      className="p-6 space-y-6"
    >
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-12 text-center space-y-6">
          <div className="space-y-3">
            <Sparkles className="w-16 h-16 mx-auto text-primary" />
            <h2 className="text-3xl font-display font-light text-foreground">
              Building Your Analytics
            </h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              You've completed {sessionsCompleted} {sessionsCompleted === 1 ? "session" : "sessions"}. Complete{" "}
              {3 - sessionsCompleted} more to unlock detailed analytics and performance insights.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i <= sessionsCompleted
                    ? "bg-primary"
                    : "bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto pt-6">
            <div className="p-4 bg-card rounded-lg border border-border">
              <Target className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">
                Performance trends
              </div>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border">
              <Award className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">
                Competency breakdown
              </div>
            </div>
            <div className="p-4 bg-card rounded-lg border border-border">
              <TrendingUp className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-sm text-muted-foreground">
                Improvement insights
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Loading State Component (Skeleton UI)
 */
function LoadingState() {
  return (
    <div className="p-6 space-y-6">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-6">
              <div className="space-y-2">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-[400px] bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-[400px] bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center py-8">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
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
  icon: any;
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
        ? "text-green-500"
        : change < 0
          ? "text-red-500"
          : "text-muted-foreground"
      : "";

  const ChangeIcon = changeIcon;

  return (
    <motion.div variants={fadeInUp}>
      <Card className="bg-card border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <Icon className="w-5 h-5 text-primary" />
            {ChangeIcon && change !== undefined && (
              <div className={`flex items-center gap-1 text-xs ${changeColor}`}>
                <ChangeIcon className="w-3 h-3" />
                {Math.abs(change)}%
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-mono font-bold text-foreground">
              {value}
              {suffix}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Filters Bar Component
 */
function FiltersBar() {
  return (
    <motion.div variants={fadeInUp}>
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters:</span>
            </div>

            {/* Date Range Filter (Coming Soon) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-sm text-muted-foreground border border-border">
              <Calendar className="w-4 h-4" />
              <span>All Time</span>
            </div>

            {/* Interview Type Filters (Coming Soon) */}
            <div className="flex items-center gap-2">
              {["Product Sense", "Analytical", "Leadership", "Strategy"].map((type) => (
                <button
                  key={type}
                  className="px-3 py-1.5 rounded-md bg-muted/50 text-sm text-muted-foreground border border-border hover:border-primary/30 transition-colors"
                  disabled
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs text-muted-foreground">
              Coming soon: Filter by date range and interview type
            </div>
          </div>
        </CardContent>
      </Card>
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
        const sessionsWithFeedback = sessionsData.sessions.filter(
          (s: any) => s.feedback !== null
        );
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
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-8 text-center">
            <p className="text-destructive">Failed to load analytics. Please try again later.</p>
          </CardContent>
        </Card>
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

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-light text-foreground">Analytics</h2>
        <p className="text-muted-foreground font-sans">
          Deep dive into your performance metrics and identify areas for improvement.
        </p>
      </div>

      {/* Stats Cards */}
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
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
        <StatCard
          icon={Zap}
          label="Current Streak"
          value={insights.overall.current_streak}
          suffix=" days"
        />
      </motion.div>

      {/* Filters Bar */}
      <FiltersBar />

      {/* Charts Grid - 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    </motion.div>
  );
});
