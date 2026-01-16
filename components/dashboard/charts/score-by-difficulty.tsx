"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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

export function ScoreByDifficulty({ data, recommendedDifficulty }: ScoreByDifficultyProps) {
  // Empty state
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Performance by Difficulty
          </CardTitle>
          <CardDescription>Track your progress across difficulty levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <Trophy className="w-12 h-12 mb-4 opacity-20" />
            <p>Complete more interviews to see your performance by difficulty</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine recommendation icon and color
  const { recommended, currentDifficulty, reason } = recommendedDifficulty;
  let recommendationIcon = <Minus className="w-4 h-4" />;
  let recommendationColor = "text-blue-500";

  if (currentDifficulty) {
    const difficultyOrder = ["beginner", "intermediate", "advanced"];
    const currentIndex = difficultyOrder.indexOf(currentDifficulty);
    const recommendedIndex = difficultyOrder.indexOf(recommended);

    if (recommendedIndex > currentIndex) {
      recommendationIcon = <TrendingUp className="w-4 h-4" />;
      recommendationColor = "text-green-500";
    } else if (recommendedIndex < currentIndex) {
      recommendationIcon = <TrendingDown className="w-4 h-4" />;
      recommendationColor = "text-orange-500";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Performance by Difficulty
        </CardTitle>
        <CardDescription>Track your progress across difficulty levels</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="difficulty"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                label={{
                  value: "Average Score (%)",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number, name: string, props: any) => {
                  const sessionCount = props.payload.sessionCount;
                  return [
                    `${Math.round(value)}% (${sessionCount} session${sessionCount === 1 ? "" : "s"})`,
                    "Avg Score",
                  ];
                }}
              />
              <Bar
                dataKey="avgScore"
                fill="hsl(var(--primary))"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          {/* Recommendation Card */}
          <div className={`flex items-start gap-3 p-4 rounded-lg border ${recommendationColor === "text-green-500" ? "bg-green-500/5 border-green-500/20" : recommendationColor === "text-orange-500" ? "bg-orange-500/5 border-orange-500/20" : "bg-blue-500/5 border-blue-500/20"}`}>
            <div className={`mt-0.5 ${recommendationColor}`}>
              {recommendationIcon}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">
                Recommended: {data.find((d) => d.difficultyKey === recommended)?.difficulty || recommended}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{reason}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
