"use client";

import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ScoreDataPoint {
  date: string;
  score: number;
  roundType: string;
}

interface ScoreChartProps {
  data: ScoreDataPoint[];
}

export function ScoreChart({ data }: ScoreChartProps) {
  if (data.length === 0) {
    return (
      <Card className="p-8 bg-surface/30 border-border/30">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            No score data yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Complete interviews to see your progress over time
          </p>
        </div>
      </Card>
    );
  }

  // Show line only when we have 2+ data points
  const showLine = data.length >= 2;

  return (
    <Card className="p-6 bg-surface/50 border-border/50">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Score Trends</h3>
          <p className="text-sm text-muted-foreground">
            {data.length === 1
              ? 'Your latest session score'
              : `Your performance over the last ${data.length} ${data.length === 1 ? 'session' : 'sessions'}`}
          </p>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.3}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                fontSize={12}
                tickLine={false}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.5}
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                fontSize={12}
                tickLine={false}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.5}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  padding: "12px",
                  color: "hsl(var(--foreground))",
                }}
                labelStyle={{ color: "hsl(var(--foreground))", marginBottom: "4px" }}
                itemStyle={{ color: "hsl(var(--primary))" }}
              />
              {showLine ? (
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{
                    fill: "hsl(var(--primary))",
                    r: 5,
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))"
                  }}
                  activeDot={{
                    r: 7,
                    strokeWidth: 2,
                    stroke: "hsl(var(--background))"
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
                    fill: "hsl(var(--primary))",
                    r: 8,
                    strokeWidth: 3,
                    stroke: "hsl(var(--background))"
                  }}
                  activeDot={{
                    r: 10,
                    strokeWidth: 3,
                    stroke: "hsl(var(--background))"
                  }}
                  connectNulls={false}
                  isAnimationActive={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
