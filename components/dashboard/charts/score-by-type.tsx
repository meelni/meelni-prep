"use client";

import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";
import { TrendingUp, TrendingDown } from "lucide-react";

interface ScoreByTypeData {
  type: string;
  yourScore: number;
  avgScore: number;
}

interface ScoreByTypeProps {
  data: ScoreByTypeData[];
  onTypeClick?: (type: string) => void;
}

const chartConfig = {
  yourScore: {
    label: "Your Score",
    color: "var(--chart-1)",
  },
  avgScore: {
    label: "Platform Average",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function ScoreByType({ data, onTypeClick }: ScoreByTypeProps) {
  if (data.length === 0) {
    return (
      <DashboardChartCard
        title="Performance by Interview Type"
        description="No comparison data available"
        contentClassName="flex h-[300px] items-center justify-center text-muted-foreground lg:h-[350px]"
      >
        <p className="text-sm">
          Complete interviews across different types to see comparisons
        </p>
      </DashboardChartCard>
    );
  }

  // Find strongest and weakest types
  const sortedByYourScore = [...data].sort((a, b) => b.yourScore - a.yourScore);
  const strongest = sortedByYourScore[0];
  const weakest = sortedByYourScore[sortedByYourScore.length - 1];

  return (
    <DashboardChartCard
      title="Performance by Interview Type"
      description={
        <>
          Strongest:{" "}
          <span className="text-primary font-semibold">{strongest.type}</span> (
          {strongest.yourScore.toFixed(0)}%) • Focus area:{" "}
          <span className="text-muted-foreground font-semibold">
            {weakest.type}
          </span>{" "}
          ({weakest.yourScore.toFixed(0)}%)
        </>
      }
      contentClassName="pb-0 pt-6"
    >
      <ChartContainer
        config={chartConfig}
        className="h-[300px] w-full lg:h-[350px]"
      >
        <BarChart
          accessibilityLayer
          data={data}
          onClick={(state) => {
            if (onTypeClick && state.activeLabel) {
              onTypeClick(state.activeLabel);
            }
          }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="type"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => {
              // Shorten type names for small screens
              const shortNames: Record<string, string> = {
                "Product Sense": "Product",
                Analytical: "Analytical",
                Leadership: "Leadership",
                Strategy: "Strategy",
              };
              return shortNames[value] || value;
            }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => `${value}%`}
            allowDataOverflow={true}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dashed"
                formatter={(value, name) => {
                  const label =
                    name === "yourScore" ? "Your Score" : "Platform Avg";
                  return (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{label}:</span>
                      <span>{Number(value).toFixed(0)}%</span>
                      {name === "yourScore" && (
                        <ComparisonBadge
                          yourScore={Number(value)}
                          avgScore={data.find((d) => d.type)?.avgScore || 0}
                        />
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          <Bar
            dataKey="yourScore"
            fill="var(--color-yourScore)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="avgScore"
            fill="var(--color-avgScore)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </DashboardChartCard>
  );
}

function ComparisonBadge({
  yourScore,
  avgScore,
}: {
  yourScore: number;
  avgScore: number;
}) {
  const diff = yourScore - avgScore;
  const isAbove = diff > 0;

  if (Math.abs(diff) < 2) {
    return null; // Don't show badge for negligible differences
  }

  return (
    <span
      className={`flex items-center gap-1 text-xs ${isAbove ? "text-green-500" : "text-orange-500"}`}
    >
      {isAbove ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.abs(diff).toFixed(0)}%
    </span>
  );
}
