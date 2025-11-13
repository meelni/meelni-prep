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
            {data.length > 0
              ? `Your performance over the last ${data.length} ${data.length === 1 ? 'session' : 'sessions'}`
              : 'Your performance over recent sessions'}
          </p>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" />
              <XAxis
                dataKey="date"
                className="text-muted-foreground"
                fontSize={12}
                tickLine={false}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                domain={[0, 10]}
                className="text-muted-foreground"
                fontSize={12}
                tickLine={false}
                stroke="hsl(var(--muted-foreground))"
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
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: "hsl(var(--primary))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                activeDot={{ r: 7, strokeWidth: 2, stroke: "hsl(var(--background))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
