"use client";

import {
  DashboardChartCard,
  DashboardStateCard,
} from "@/components/dashboard/dashboard-surface";
import { RadarIcon } from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { analytics } from "@/lib/analytics/analytics-service";
import { useEffect, useRef } from "react";

interface CompetencyData {
  competency: string;
  score: number;
  fullMark: number;
}

interface CompetencyRadarProps {
  data: CompetencyData[];
}

export function CompetencyRadar({ data }: CompetencyRadarProps) {
  const hasTrackedView = useRef(false);

  // Track competency radar view
  useEffect(() => {
    if (data.length > 0 && !hasTrackedView.current) {
      hasTrackedView.current = true;

      const hasScores = data.some((d) => d.score > 0);
      const avgScore = hasScores
        ? data.reduce((sum, d) => sum + d.score, 0) / data.length
        : undefined;

      analytics.track("competency_radar_viewed", {
        competencies_count: data.length,
        has_scores: hasScores,
        avg_competency_score: avgScore
          ? Math.round(avgScore * 10) / 10
          : undefined,
      });
    }
  }, [data]);

  const handleRadarClick = () => {
    analytics.track("chart_interacted", {
      chart_type: "competency_radar",
      interaction_type: "click",
      data_point: `${data.length} competencies`,
    });
  };

  if (data.length === 0) {
    return (
      <DashboardStateCard
        icon={<RadarIcon className="h-8 w-8" />}
        title="No competency data yet"
        description="Complete interviews with feedback to see your competency breakdown."
        className="py-8"
      />
    );
  }

  return (
    <DashboardChartCard
      title="Competency Breakdown"
      description="Your average scores across key competencies"
    >
      <div className="h-chart-radar w-full" onClick={handleRadarClick}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            margin={{ top: 30, right: 40, bottom: 30, left: 40 }}
          >
            <PolarGrid stroke="var(--border)" strokeOpacity={0.3} />
            <PolarAngleAxis
              dataKey="competency"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.6}
              fontSize={11}
              tick={{ fill: "var(--muted-foreground)", width: 60 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              stroke="var(--border)"
              strokeOpacity={0.3}
              tick={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "12px",
                color: "var(--foreground)",
              }}
              formatter={(value: number) => [`${value.toFixed(1)}/10`, "Score"]}
              labelStyle={{
                color: "var(--foreground)",
                marginBottom: "4px",
                fontWeight: 600,
              }}
              itemStyle={{ color: "var(--primary)" }}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="var(--primary)"
              fill="var(--primary)"
              fillOpacity={0.18}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </DashboardChartCard>
  );
}
