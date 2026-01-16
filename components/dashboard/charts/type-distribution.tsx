"use client";

import { LabelList, Pie, PieChart, Cell } from "recharts";
import { AlertCircle } from "lucide-react";
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
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Interview Type Distribution</CardTitle>
          <CardDescription>No session data available</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] lg:h-[400px] flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Complete interviews to see type distribution</p>
        </CardContent>
      </Card>
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
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>Interview Type Distribution</CardTitle>
        <CardDescription>
          Most practiced: <span className="text-primary font-semibold">{mostPracticed.type}</span> ({mostPracticed.count} sessions)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0 pt-6">
        {/* Gap indicator - show missing types */}
        {missingTypes.length > 0 && (
          <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-500">
                  Missing Types
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You haven&apos;t practiced: {missingTypes.map((t) => t.label).join(", ")}
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
                    const percentage = ((Number(value) / totalSessions) * 100).toFixed(1);
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
                  className="hover:opacity-80 transition-opacity"
                />
              ))}
              <LabelList
                dataKey="count"
                stroke="none"
                fontSize={13}
                fontWeight={600}
                fill="hsl(var(--background))"
                formatter={(value: number) => value.toString()}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
