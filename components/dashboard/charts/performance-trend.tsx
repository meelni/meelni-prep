"use client";

import { Area, AreaChart, CartesianGrid, XAxis, Line } from "recharts";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { DashboardChartCard } from "@/components/dashboard/dashboard-surface";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useRef, useState, useMemo, useEffect } from "react";
import { useSpring, useMotionValueEvent } from "motion/react";

interface PerformanceTrendData {
  date: string;
  fullDate: Date;
  score: number;
  sessionId: string;
  roundType: string;
}

interface PerformanceTrendProps {
  data: PerformanceTrendData[];
  onSessionClick?: (sessionId: string) => void;
}

const chartConfig = {
  score: {
    label: "Score",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PerformanceTrend({
  data,
  onSessionClick,
}: PerformanceTrendProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [axis, setAxis] = useState(0);

  // Get latest score for initial value
  const latestScore = data.length > 0 ? data[data.length - 1].score : 0;

  // Motion values for smooth animations - initialize with latest score
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

  // Initialize axis to full width on mount so chart is visible immediately
  useEffect(() => {
    const width = chartRef.current?.getBoundingClientRect().width || 0;
    if (width > 0) {
      setAxis(width);
      springX.set(width);
    }
    // Set springY to latest score on mount
    springY.set(latestScore);
  }, [springX, springY, latestScore]);

  // Calculate linear regression trend line
  const trendLineData = useMemo(() => {
    if (data.length < 2) return [];

    // Calculate linear regression: y = mx + b
    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, point) => sum + point.score, 0);
    const sumXY = data.reduce((sum, point, i) => sum + i * point.score, 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate trend line points
    return data.map((point, i) => ({
      ...point,
      trendScore: slope * i + intercept,
    }));
  }, [data]);

  // Calculate trend
  const trend =
    data.length >= 2 ? data[data.length - 1].score - data[0].score : 0;
  const trendPercentage =
    data.length >= 2 && data[0].score > 0
      ? ((trend / data[0].score) * 100).toFixed(1)
      : "0";

  const currentScore =
    data.length > 0 ? (springY.get() || latestScore).toFixed(0) : "0";

  if (data.length === 0) {
    return (
      <DashboardChartCard
        title="Performance Trend"
        description="No session data available"
        contentClassName="flex h-chart-md items-center justify-center text-muted-foreground lg:h-chart-lg"
      >
        <p className="text-sm">
          Complete your first interview to see your performance trend
        </p>
      </DashboardChartCard>
    );
  }

  return (
    <DashboardChartCard
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-2xl">{currentScore}%</span>
        </span>
      }
      description={`Overall score trend (last ${data.length} sessions)`}
      action={
        <Badge variant={trend >= 0 ? "default" : "secondary"} className="ml-2">
          {trend >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>
            {trend >= 0 ? "+" : ""}
            {trendPercentage}%
          </span>
        </Badge>
      }
    >
      <ChartContainer
        ref={chartRef}
        className="h-chart-md lg:h-chart-lg w-full"
        config={chartConfig}
      >
        <AreaChart
          className="overflow-visible"
          accessibilityLayer
          data={trendLineData.length > 0 ? trendLineData : data}
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
          onClick={(state) => {
            if (onSessionClick && state.activePayload?.[0]?.payload) {
              const sessionId = state.activePayload[0].payload.sessionId;
              onSessionClick(sessionId);
            }
          }}
          margin={{
            right: 0,
            left: 0,
            top: 20,
          }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--border)"
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
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <Area
            dataKey="score"
            type="monotone"
            fill="url(#gradient-performance-trend)"
            fillOpacity={0.4}
            stroke="var(--color-score)"
            strokeWidth={2}
            clipPath={`inset(0 ${
              Number(chartRef.current?.getBoundingClientRect().width) - axis
            } 0 0)`}
          />
          {/* Vertical indicator line */}
          <line
            x1={axis}
            y1={0}
            x2={axis}
            y2={"85%"}
            stroke="var(--color-score)"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeOpacity={0.3}
          />
          {/* Score label */}
          <rect
            x={Math.max(0, axis - 50)}
            y={0}
            width={50}
            height={20}
            fill="var(--color-score)"
            rx={4}
          />
          <text
            x={Math.max(25, axis - 25)}
            fontWeight={600}
            fontSize={12}
            y={14}
            textAnchor="middle"
            fill="var(--primary-foreground)"
          >
            {springY.get().toFixed(0)}%
          </text>
          {/* Trend line showing improvement direction */}
          {trendLineData.length > 0 && (
            <Line
              dataKey="trendScore"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              strokeOpacity={0.6}
            />
          )}
          {/* Ghost line behind graph */}
          <Area
            dataKey="score"
            type="monotone"
            fill="none"
            stroke="var(--color-score)"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
          <defs>
            <linearGradient
              id="gradient-performance-trend"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor="var(--color-score)"
                stopOpacity={0.3}
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
