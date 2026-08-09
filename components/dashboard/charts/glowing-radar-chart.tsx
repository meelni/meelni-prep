"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";

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
    color: "var(--chart-1)",
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
      <div className="bg-background rounded-lg border p-2 shadow-sm">
        <div className="grid gap-2">
          <div className="flex flex-col">
            <span className="text-label text-muted-foreground uppercase">
              {fullName}
            </span>
            <span className="text-foreground font-bold">
              {dataPoint.score}/10
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardChartCard
      title="Competency Breakdown"
      centeredHeader
      contentClassName="pb-0 pt-3"
    >
      <ChartContainer
        config={chartConfig}
        className="max-h-chart-radar-sm mx-auto aspect-square"
      >
        <RadarChart
          data={data}
          margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
        >
          <ChartTooltip cursor={false} content={<CustomTooltip />} />
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
    </DashboardChartCard>
  );
}
