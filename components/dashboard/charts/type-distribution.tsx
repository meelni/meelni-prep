"use client";

import { LabelList, Pie, PieChart, Cell } from "recharts";
import { AlertCircle } from "lucide-react";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";

interface TypeDistributionData {
  type: string;
  count: number;
  fill: string;
}

interface TypeDistributionProps {
  data: TypeDistributionData[];
  onTypeClick?: (type: string) => void;
}

const chartConfig = {
  count: {
    label: "Sessions",
  },
} satisfies ChartConfig;

// All possible interview types
const ALL_TYPES = [
  { key: "Product Sense", label: "Product Sense" },
  { key: "Analytical", label: "Analytical" },
  { key: "Leadership", label: "Leadership" },
  { key: "Strategy", label: "Strategy" },
];

export function TypeDistribution({ data, onTypeClick }: TypeDistributionProps) {
  if (data.length === 0) {
    return (
      <DashboardChartCard
        title="Interview Type Distribution"
        description="No session data available"
        centeredHeader
        contentClassName="flex h-[300px] items-center justify-center text-muted-foreground lg:h-[400px]"
      >
        <p className="text-sm">Complete interviews to see type distribution</p>
      </DashboardChartCard>
    );
  }

  const totalSessions = data.reduce((sum, item) => sum + item.count, 0);
  const mostPracticed = data.reduce((max, current) =>
    current.count > max.count ? current : max
  );

  // Identify missing types (gaps)
  const practicedTypes = new Set(data.map((d) => d.type));
  const missingTypes = ALL_TYPES.filter(
    (type) => !practicedTypes.has(type.key)
  );

  return (
    <DashboardChartCard
      title="Interview Type Distribution"
      description={
        <>
          Most practiced:{" "}
          <span className="text-primary font-semibold">
            {mostPracticed.type}
          </span>{" "}
          ({mostPracticed.count} sessions)
        </>
      }
      centeredHeader
      contentClassName="pb-0 pt-6"
    >
      {/* Gap indicator - show missing types */}
      {missingTypes.length > 0 && (
        <div className="border-warning/20 bg-warning/10 mb-4 rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-warning mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-warning text-sm font-medium">Missing Types</p>
              <p className="text-muted-foreground mt-1 text-xs">
                You haven&apos;t practiced:{" "}
                {missingTypes.map((t) => t.label).join(", ")}
              </p>
            </div>
          </div>
        </div>
      )}

      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[400px]"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="type"
                formatter={(value) => {
                  const percentage = (
                    (Number(value) / totalSessions) *
                    100
                  ).toFixed(1);
                  return `${value} sessions (${percentage}%)`;
                }}
              />
            }
          />
          <Pie
            data={data}
            dataKey="count"
            nameKey="type"
            innerRadius={60}
            outerRadius={120}
            cornerRadius={8}
            paddingAngle={4}
            onClick={(data) => {
              if (onTypeClick && data.type) {
                onTypeClick(data.type);
              }
            }}
            className="cursor-pointer"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                className="transition-opacity hover:opacity-80"
              />
            ))}
            <LabelList
              dataKey="count"
              stroke="none"
              fontSize={13}
              fontWeight={600}
              fill="var(--background)"
              formatter={(value: number) => value.toString()}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </DashboardChartCard>
  );
}
