"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface CompetencyData {
  competency: string;
  score: number;
}

interface CompetencyBreakdownProps {
  data: CompetencyData[];
  onCompetencyClick?: (competency: string) => void;
}

const chartConfig = {
  score: {
    label: "Score",
    color: "#8b5cf6", // Purple-500 - matching GlowingRadarChart for consistency
  },
} satisfies ChartConfig;

export function CompetencyBreakdown({ data, onCompetencyClick }: CompetencyBreakdownProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="items-center pb-4">
          <CardTitle>Competency Breakdown</CardTitle>
          <CardDescription>No competency data available</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] lg:h-[400px] flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Complete interviews to see your competency scores</p>
        </CardContent>
      </Card>
    );
  }

  // Find strongest competency
  const strongest = data.reduce((max, current) =>
    current.score > max.score ? current : max
  );

  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>Competency Breakdown</CardTitle>
        <CardDescription>
          Strongest: <span className="text-primary font-semibold">{strongest.competency}</span> ({strongest.score.toFixed(0)}%)
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[400px]"
        >
          <RadarChart
            data={data}
            onClick={(state) => {
              if (onCompetencyClick && state.activeLabel) {
                onCompetencyClick(state.activeLabel);
              }
            }}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent
                formatter={(value) => `${Number(value).toFixed(0)}%`}
              />}
            />
            <PolarAngleAxis
              dataKey="competency"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            />
            <PolarGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />
            <Radar
              stroke="var(--color-score)"
              dataKey="score"
              fill="var(--color-score)"
              fillOpacity={0.2}
              strokeWidth={2}
              filter="url(#competency-glow)"
            />
            <defs>
              <filter
                id="competency-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
