"use client";

import {
  DashboardChartCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import { TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { analytics } from "@/lib/analytics/analytics-service";
import { useEffect, useRef, useState } from "react";

interface ScoreDataPoint {
  date: string;
  score: number;
  roundType: string;
}

interface ScoreChartProps {
  data: ScoreDataPoint[];
}

export function ScoreChart({ data }: ScoreChartProps) {
  const [isHovered, setIsHovered] = useState(false);
  const chartViewStartTime = useRef<number>(Date.now());
  const hasTrackedView = useRef(false);

  // Track chart view and analyze trend
  useEffect(() => {
    if (data.length > 0 && !hasTrackedView.current) {
      hasTrackedView.current = true;

      // Calculate trend direction
      let trendDirection: "improving" | "declining" | "stable" = "stable";
      if (data.length >= 2) {
        const recentScores = data.slice(-3);
        const avgRecent =
          recentScores.reduce((sum, d) => sum + d.score, 0) /
          recentScores.length;
        const olderScores =
          data.length > 3 ? data.slice(0, -3) : data.slice(0, 1);
        const avgOlder =
          olderScores.reduce((sum, d) => sum + d.score, 0) / olderScores.length;

        if (avgRecent > avgOlder + 0.5) trendDirection = "improving";
        else if (avgRecent < avgOlder - 0.5) trendDirection = "declining";
      }

      analytics.track("score_trend_analyzed", {
        time_range: "all_time",
        sessions_in_range: data.length,
        trend_direction: trendDirection,
      });
    }

    // Track time spent on chart when user leaves
    return () => {
      if (isHovered) {
        const timeSpent = (Date.now() - chartViewStartTime.current) / 1000;
        analytics.track("chart_interacted", {
          chart_type: "score_chart",
          interaction_type: "hover",
          time_spent_seconds: Math.round(timeSpent),
        });
      }
    };
  }, [data, isHovered]);

  const handleChartClick = (dataPoint: {
    activePayload?: Array<{ payload?: ScoreDataPoint }>;
  }) => {
    if (dataPoint && dataPoint.activePayload) {
      analytics.track("chart_interacted", {
        chart_type: "score_chart",
        interaction_type: "click",
      });
    }
  };

  if (data.length === 0) {
    return (
      <DashboardStateCard
        icon={<TrendingUp className="h-8 w-8" />}
        title="No score data yet"
        description="Complete interviews to see your progress over time."
        className="py-8"
      />
    );
  }

  // Show line only when we have 2+ data points
  const showLine = data.length >= 2;

  return (
    <DashboardChartCard
      title="Score Trends"
      description={
        data.length === 1
          ? "Your latest session score"
          : `Your performance over the last ${data.length} ${
              data.length === 1 ? "session" : "sessions"
            }`
      }
    >
      <div
        className="h-chart-md w-full"
        onMouseEnter={() => {
          setIsHovered(true);
          chartViewStartTime.current = Date.now();
        }}
        onMouseLeave={() => setIsHovered(false)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            onClick={handleChartClick}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.3}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--muted-foreground)" }}
              fontSize={12}
              tickLine={false}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fill: "var(--muted-foreground)" }}
              fontSize={12}
              tickLine={false}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "12px",
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--foreground)", marginBottom: "4px" }}
              itemStyle={{ color: "var(--primary)" }}
            />
            {showLine ? (
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--primary)"
                strokeWidth={3}
                dot={{
                  fill: "var(--primary)",
                  r: 5,
                  strokeWidth: 2,
                  stroke: "var(--background)",
                }}
                activeDot={{
                  r: 7,
                  strokeWidth: 2,
                  stroke: "var(--background)",
                }}
                connectNulls={false}
                isAnimationActive={true}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="score"
                stroke="transparent"
                strokeWidth={0}
                dot={{
                  fill: "var(--primary)",
                  r: 8,
                  strokeWidth: 3,
                  stroke: "var(--background)",
                }}
                activeDot={{
                  r: 10,
                  strokeWidth: 3,
                  stroke: "var(--background)",
                }}
                connectNulls={false}
                isAnimationActive={true}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
