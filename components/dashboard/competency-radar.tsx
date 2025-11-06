"use client";

import { Card } from "@/components/ui/card";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

interface CompetencyData {
  competency: string;
  score: number;
  fullMark: number;
}

interface CompetencyRadarProps {
  data: CompetencyData[];
}

export function CompetencyRadar({ data }: CompetencyRadarProps) {
  if (data.length === 0) {
    return (
      <Card className="p-8 bg-surface/30 border-border/30">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            No competency data yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Complete interviews with feedback to see your competency breakdown
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-surface/50 border-border/50">
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            Competency Breakdown
          </h3>
          <p className="text-sm text-muted-foreground">
            Your average scores across key competencies
          </p>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data}>
              <PolarGrid stroke="rgba(128, 128, 128, 0.2)" />
              <PolarAngleAxis
                dataKey="competency"
                stroke="rgba(128, 128, 128, 0.5)"
                fontSize={12}
                tick={{ fill: "rgba(255, 255, 255, 0.7)" }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                stroke="rgba(128, 128, 128, 0.3)"
                fontSize={10}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(128, 128, 128, 0.2)",
                  borderRadius: "8px",
                  padding: "12px",
                }}
                labelStyle={{ color: "rgba(255, 255, 255, 0.9)", marginBottom: "4px" }}
                itemStyle={{ color: "rgba(34, 197, 94, 1)" }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="rgba(34, 197, 94, 1)"
                fill="rgba(34, 197, 94, 0.3)"
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
