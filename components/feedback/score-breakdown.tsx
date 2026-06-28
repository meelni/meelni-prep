"use client";

import { FeedbackSectionCard } from "@/components/feedback/feedback-surface";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
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
    color: "var(--chart-1)",
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
    <FeedbackSectionCard
      title="Performance Breakdown"
      description="Your scores across key competencies"
      action={
        <div className="text-right">
          <div className="font-display text-primary text-3xl font-light">
            {scores.overall.toFixed(1)}
          </div>
          <div className="text-muted-foreground text-xs tracking-wide uppercase">
            Overall
          </div>
        </div>
      }
    >
      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <RadarChart
          data={radarData}
          margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
        >
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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
    </FeedbackSectionCard>
  );
}
