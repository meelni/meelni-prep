"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { RubricScores } from "@/lib/types/feedback";

interface ScoreBreakdownProps {
  scores: RubricScores;
}

const chartConfig = {
  score: {
    label: "Score",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function ScoreBreakdown({ scores }: ScoreBreakdownProps) {
  // Convert rubric scores to radar chart format
  const radarData = [
    { competency: "Structure", score: scores.structure, fullMark: 10 },
    { competency: "Clarity", score: scores.clarity, fullMark: 10 },
    { competency: "Insight", score: scores.insight, fullMark: 10 },
    { competency: "Communication", score: scores.communication, fullMark: 10 },
    { competency: "Leadership", score: scores.leadership, fullMark: 10 },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Performance Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Your scores across key competencies
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-display font-light text-primary">
              {scores.overall.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Overall
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <PolarAngleAxis dataKey="competency" />
            <PolarGrid strokeDasharray="3 3" />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tickCount={6}
              axisLine={false}
              tick={false}
            />
            <Radar
              stroke="var(--color-score)"
              strokeWidth={2}
              dataKey="score"
              fill="var(--color-score)"
              fillOpacity={0.3}
              filter="url(#stroke-line-glow)"
            />
            <defs>
              <filter
                id="stroke-line-glow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
