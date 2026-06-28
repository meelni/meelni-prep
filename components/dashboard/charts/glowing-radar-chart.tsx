"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from "recharts";
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
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CompetencyDataPoint {
  competency: string;
  fullName?: string;
  score: number;
  fullMark: number;
}

interface GlowingRadarChartProps {
  data: CompetencyDataPoint[];
}

const chartConfig = {
  score: {
    label: "Score",
    color: "#8b5cf6", // Purple-500 - visible in both light and dark mode
  },
} satisfies ChartConfig;

export function GlowingRadarChart({ data }: GlowingRadarChartProps) {
  // Custom tooltip content that shows full competency names (excluding Structure)
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: CompetencyDataPoint }>;
  }) => {
    if (!active || !payload || !payload.length) return null;

    const dataPoint = payload[0].payload;
    const fullName = dataPoint.fullName || dataPoint.competency;

    // Don't show tooltip for Structure
    if (fullName === "Structure") return null;

    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] uppercase text-muted-foreground">
              {fullName}
            </span>
            <span className="font-bold text-foreground">
              {dataPoint.score}/10
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="items-center pb-4">
        <CardTitle>Competency Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[280px]"
        >
          <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
            <ChartTooltip
              cursor={false}
              content={<CustomTooltip />}
            />
            <PolarAngleAxis dataKey="competency" />
            <PolarGrid strokeDasharray="3 3" />
            <PolarRadiusAxis angle={90} domain={[0, 10]} tickCount={6} axisLine={false} tick={false} />
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
