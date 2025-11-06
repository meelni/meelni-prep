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

  return (
    <Card className="p-6 bg-surface/50 border-border/50">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Score Trends</h3>
          <p className="text-sm text-muted-foreground">
            Your performance over the last {data.length} sessions
          </p>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.1)" />
              <XAxis
                dataKey="date"
                stroke="rgba(128, 128, 128, 0.5)"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                domain={[0, 10]}
                stroke="rgba(128, 128, 128, 0.5)"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(128, 128, 128, 0.2)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
                labelStyle={{ color: "rgba(255, 255, 255, 0.9)", marginBottom: "4px" }}
                itemStyle={{ color: "rgba(168, 85, 247, 1)" }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="rgba(168, 85, 247, 1)"
                strokeWidth={2}
                dot={{ fill: "rgba(168, 85, 247, 1)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
