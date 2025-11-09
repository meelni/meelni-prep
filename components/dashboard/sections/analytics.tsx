"use client";

import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
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
} from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted animate-pulse rounded" />
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
 * Custom Tooltip for Charts
 */
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-foreground">
              {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

/**
 * Main Analytics Section Component
 */
export const AnalyticsSection = memo(function AnalyticsSection() {
  const [insights, setInsights] = useState<UserInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch insights on mount
  useEffect(() => {
    async function fetchInsights() {
      try {
        const response = await fetch("/api/insights");
        if (!response.ok) {
          throw new Error("Failed to fetch insights");
        }
        const data = await response.json();
        setInsights(data);
      } catch (err) {
        console.error("Error fetching insights:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchInsights();
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

  // Prepare chart data
  const progressData = insights.trends.last_5_sessions_avg
    ? [
        { session: "S1", score: insights.trends.last_5_sessions_avg },
        { session: "S2", score: insights.trends.last_5_sessions_avg + (insights.trends.velocity * 1) },
        { session: "S3", score: insights.trends.last_5_sessions_avg + (insights.trends.velocity * 2) },
        { session: "S4", score: insights.trends.last_5_sessions_avg + (insights.trends.velocity * 3) },
        { session: "S5", score: insights.trends.last_5_sessions_avg + (insights.trends.velocity * 4) },
      ]
    : [];

  const competencyData = [
    { competency: "Structure", score: insights.competencies.structure || 0, fullMark: 10 },
    { competency: "Clarity", score: insights.competencies.clarity || 0, fullMark: 10 },
    { competency: "Insight", score: insights.competencies.insight || 0, fullMark: 10 },
    { competency: "Communication", score: insights.competencies.communication || 0, fullMark: 10 },
    { competency: "Leadership", score: insights.competencies.leadership || 0, fullMark: 10 },
  ];

  const interviewTypeData = [
    { type: "Product Sense", score: insights.byType.product_sense.avg_score || 0 },
    { type: "Analytical", score: insights.byType.analytical.avg_score || 0 },
    { type: "Leadership", score: insights.byType.leadership.avg_score || 0 },
    { type: "Strategy", score: insights.byType.strategy.avg_score || 0 },
  ].filter((item) => item.score > 0);

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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Trends Chart */}
        <motion.div variants={fadeInUp} className="lg:col-span-2">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                Progress Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="session"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    domain={[0, 10]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Competency Radar Chart */}
        <motion.div variants={fadeInUp}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                Competency Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={competencyData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="competency"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                  />
                  <PolarRadiusAxis
                    domain={[0, 10]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Interview Type Performance */}
      {interviewTypeData.length > 0 && (
        <motion.div variants={fadeInUp}>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
                Performance by Interview Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={interviewTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    domain={[0, 10]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    dataKey="type"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={120}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="score"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
});
