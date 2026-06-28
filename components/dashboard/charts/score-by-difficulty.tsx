"use client";

import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";

interface ScoreByDifficultyProps {
  data: Array<{
    difficulty: string;
    difficultyKey: string;
    avgScore: number;
    sessionCount: number;
  }>;
  recommendedDifficulty: {
    recommended: string;
    currentDifficulty: string | null;
    avgScore: number | null;
    reason: string;
  };
}

export function ScoreByDifficulty({
  data,
  recommendedDifficulty,
}: ScoreByDifficultyProps) {
  // Empty state
  if (data.length === 0) {
    return (
      <DashboardChartCard
        title={
          <span className="flex items-center gap-2">
            <Trophy className="text-primary h-5 w-5" />
            Performance by Difficulty
          </span>
        }
        description="Track your progress across difficulty levels"
      >
        <div className="text-muted-foreground flex h-64 flex-col items-center justify-center text-center">
          <Trophy className="mb-4 h-12 w-12 opacity-20" />
          <p>Complete more interviews to see your performance by difficulty</p>
        </div>
      </DashboardChartCard>
    );
  }

  // Determine recommendation icon and color
  const { recommended, currentDifficulty, reason } = recommendedDifficulty;
  let recommendationIcon = <Minus className="h-4 w-4" />;
  let recommendationTone: "info" | "success" | "warning" = "info";

  if (currentDifficulty) {
    const difficultyOrder = ["beginner", "intermediate", "advanced"];
    const currentIndex = difficultyOrder.indexOf(currentDifficulty);
    const recommendedIndex = difficultyOrder.indexOf(recommended);

    if (recommendedIndex > currentIndex) {
      recommendationIcon = <TrendingUp className="h-4 w-4" />;
      recommendationTone = "success";
    } else if (recommendedIndex < currentIndex) {
      recommendationIcon = <TrendingDown className="h-4 w-4" />;
      recommendationTone = "warning";
    }
  }

  const recommendationToneClass = {
    info: "border-info/20 bg-info/5 text-info",
    success: "border-success/20 bg-success/5 text-success",
    warning: "border-warning/20 bg-warning/5 text-warning",
  }[recommendationTone];

  return (
    <DashboardChartCard
      title={
        <span className="flex items-center gap-2">
          <Trophy className="text-primary h-5 w-5" />
          Performance by Difficulty
        </span>
      }
      description="Track your progress across difficulty levels"
    >
      <div className="space-y-6">
        {/* Chart */}
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="difficulty"
              tick={{ fill: "var(--muted-foreground)" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "var(--muted-foreground)" }}
              label={{
                value: "Average Score (%)",
                angle: -90,
                position: "insideLeft",
                style: { fill: "var(--muted-foreground)" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
              formatter={(
                value: number,
                _name: string,
                props: { payload?: { sessionCount?: number } }
              ) => {
                const sessionCount = props.payload?.sessionCount ?? 0;
                return [
                  `${Math.round(value)}% (${sessionCount} session${sessionCount === 1 ? "" : "s"})`,
                  "Avg Score",
                ];
              }}
            />
            <Bar
              dataKey="avgScore"
              fill="var(--primary)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Recommendation Card */}
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${recommendationToneClass}`}
        >
          <div className="mt-0.5">{recommendationIcon}</div>
          <div className="flex-1">
            <p className="text-foreground text-sm font-medium">
              Recommended:{" "}
              {data.find((d) => d.difficultyKey === recommended)?.difficulty ||
                recommended}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{reason}</p>
          </div>
        </div>
      </div>
    </DashboardChartCard>
  );
}
