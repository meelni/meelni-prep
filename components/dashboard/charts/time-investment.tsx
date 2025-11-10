"use client";

import { Clock } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
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

interface TimeInvestmentData {
  period: string;
  minutes: number;
  sessionCount: number;
}

interface TimeInvestmentProps {
  data: TimeInvestmentData[];
  groupBy?: "week" | "month";
}

const chartConfig = {
  minutes: {
    label: "Minutes",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function TimeInvestment({ data, groupBy = "week" }: TimeInvestmentProps) {
  if (data.length === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-0">
          <CardTitle>Time Investment</CardTitle>
          <CardDescription>No time data available</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] lg:h-[350px] flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Complete interviews to see your time investment</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total time and most active period
  const totalMinutes = data.reduce((sum, item) => sum + item.minutes, 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const mostActivePeriod = data.reduce((max, current) =>
    current.minutes > max.minutes ? current : max
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Time Investment
        </CardTitle>
        <CardDescription>
          Total: <span className="text-primary font-semibold">{totalHours}h {remainingMinutes}m</span> •
          Peak: <span className="text-primary font-semibold">{mostActivePeriod.period}</span> ({Math.floor(mostActivePeriod.minutes / 60)}h {mostActivePeriod.minutes % 60}m)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0 pt-6">
        <ChartContainer
          config={chartConfig}
          className="h-[300px] lg:h-[350px] w-full"
        >
          <BarChart accessibilityLayer data={data}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
            />
            <XAxis
              dataKey="period"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => {
                // Shorten long period names
                if (groupBy === "week") {
                  return value; // "Nov 3"
                }
                return value.slice(0, 3); // "Nov 2024" -> "Nov"
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) => `${Math.floor(value / 60)}h`}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, name, props) => {
                    const minutes = Number(value);
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const sessions = props.payload.sessionCount;
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {sessions} {sessions === 1 ? 'session' : 'sessions'}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar
              shape={<CustomGradientBar />}
              dataKey="minutes"
              fill="var(--color-minutes)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const CustomGradientBar = (
  props: React.SVGProps<SVGRectElement> & { dataKey?: string }
) => {
  const { fill, x, y, width, height, dataKey } = props;

  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        stroke="none"
        fill={`url(#gradient-time-investment-${dataKey})`}
      />
      <rect x={x} y={y} width={width} height={2} stroke="none" fill={fill} />
      <defs>
        <linearGradient
          id={`gradient-time-investment-${dataKey}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={fill} stopOpacity={0.6} />
          <stop offset="100%" stopColor={fill} stopOpacity={0.1} />
        </linearGradient>
      </defs>
    </>
  );
};
