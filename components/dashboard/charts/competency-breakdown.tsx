"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";

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
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function CompetencyBreakdown({
  data,
  onCompetencyClick,
}: CompetencyBreakdownProps) {
  if (data.length === 0) {
    return (
      <DashboardChartCard
        title="Competency Breakdown"
        description="No competency data available"
        centeredHeader
        contentClassName="flex h-[300px] items-center justify-center text-muted-foreground lg:h-[400px]"
      >
        <p className="text-sm">
          Complete interviews to see your competency scores
        </p>
      </DashboardChartCard>
    );
  }

  // Find strongest competency
  const strongest = data.reduce((max, current) =>
    current.score > max.score ? current : max
  );

  return (
    <DashboardChartCard
      title="Competency Breakdown"
      description={
        <>
          Strongest:{" "}
          <span className="text-primary font-semibold">
            {strongest.competency}
          </span>{" "}
          ({strongest.score.toFixed(0)}%)
        </>
      }
      centeredHeader
      contentClassName="pb-0 pt-3"
    >
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
            content={
              <ChartTooltipContent
                formatter={(value) => `${Number(value).toFixed(0)}%`}
              />
            }
          />
          <PolarAngleAxis
            dataKey="competency"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <PolarGrid strokeDasharray="3 3" stroke="var(--border)" />
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
    </DashboardChartCard>
  );
}
