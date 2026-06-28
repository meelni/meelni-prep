"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useSpring, useMotionValueEvent } from "motion/react";

interface ScoreDataPoint {
  date: string;
  score: number;
  roundType: string;
}

interface ClippedAreaChartProps {
  data: ScoreDataPoint[];
}

const chartConfig = {
  score: {
    label: "Score",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ClippedAreaChart({ data }: ClippedAreaChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Use actual data or fallback to empty state
  const chartData =
    data.length > 0 ? data : [{ date: "No data", score: 0, roundType: "" }];
  const latestScore = data.length > 0 ? data[data.length - 1].score : 0;

  const [axis, setAxis] = useState(0);

  // motion values - initialize with latest score
  const springX = useSpring(0, {
    damping: 30,
    stiffness: 100,
  });
  const springY = useSpring(latestScore, {
    damping: 30,
    stiffness: 100,
  });

  useMotionValueEvent(springX, "change", (latest) => {
    setAxis(latest);
  });

  // Initialize axis to full width on mount
  useEffect(() => {
    const width = chartRef.current?.getBoundingClientRect().width || 0;
    if (width > 0) {
      setAxis(width);
      springX.set(width);
    }
  }, [springX]);

  // Calculate trend
  const trend =
    data.length >= 2
      ? ((data[data.length - 1].score - data[0].score) / data[0].score) * 100
      : 0;
  const isPositive = trend > 0;

  return (
    <DashboardChartCard
      title="Score Trends"
      description={`Performance over last ${data.length} sessions`}
      action={
        trend !== 0 ? (
          <Badge
            variant="secondary"
            className={`${isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"} border-none`}
          >
            {isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
          </Badge>
        ) : null
      }
    >
      <ChartContainer
        ref={chartRef}
        className="h-chart-sm w-full"
        config={chartConfig}
      >
        <AreaChart
          className="overflow-visible"
          accessibilityLayer
          data={chartData}
          onMouseMove={(state) => {
            const x = state.activeCoordinate?.x;
            const dataValue = state.activePayload?.[0]?.value;
            if (x && dataValue !== undefined) {
              springX.set(x);
              springY.set(dataValue);
            }
          }}
          onMouseLeave={() => {
            springX.set(chartRef.current?.getBoundingClientRect().width || 0);
            springY.jump(latestScore);
          }}
          margin={{
            right: 0,
            left: 0,
          }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            horizontalCoordinatesGenerator={(props) => {
              const { height } = props;
              return [0, height - 30];
            }}
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => value.slice(0, 5)}
          />
          <YAxis
            domain={[0, 10]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            hide
          />
          <Area
            dataKey="score"
            type="monotone"
            fill="url(#gradient-cliped-area-score)"
            fillOpacity={0.6}
            stroke="var(--color-score)"
            strokeWidth={3}
            clipPath={`inset(0 ${
              Number(chartRef.current?.getBoundingClientRect().width) - axis
            } 0 0)`}
          />
          <line
            x1={axis}
            y1={0}
            x2={axis}
            y2={"85%"}
            stroke="var(--color-score)"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeOpacity={0.2}
          />
          <rect
            x={axis - 50}
            y={0}
            width={50}
            height={18}
            fill="var(--color-score)"
          />
          <text
            x={axis - 25}
            fontWeight={600}
            y={13}
            textAnchor="middle"
            fill="var(--primary-foreground)"
          >
            {springY.get().toFixed(1)}
          </text>
          {/* ghost line behind graph */}
          <Area
            dataKey="score"
            type="monotone"
            fill="none"
            stroke="var(--color-score)"
            strokeOpacity={0.1}
          />
          <defs>
            <linearGradient
              id="gradient-cliped-area-score"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor="var(--color-score)"
                stopOpacity={0.2}
              />
              <stop
                offset="95%"
                stopColor="var(--color-score)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
        </AreaChart>
      </ChartContainer>
    </DashboardChartCard>
  );
}
