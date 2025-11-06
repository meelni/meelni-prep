"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { RubricScores } from "@/lib/types/feedback";

interface ScoreBreakdownProps {
  rubricScores: RubricScores;
  overallScore: number;
}

export function ScoreBreakdown({ rubricScores, overallScore }: ScoreBreakdownProps) {
  // Convert rubric scores to radar chart format
  const radarData = [
    { competency: "Structure", score: rubricScores.structure, fullMark: 10 },
    { competency: "Clarity", score: rubricScores.clarity, fullMark: 10 },
    { competency: "Insight", score: rubricScores.insight, fullMark: 10 },
    { competency: "Communication", score: rubricScores.communication, fullMark: 10 },
    { competency: "Leadership", score: rubricScores.leadership, fullMark: 10 },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-display font-light text-muted-foreground tracking-wider uppercase">
              Performance Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Your scores across key competencies
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-display font-light text-primary">
              {overallScore.toFixed(1)}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Overall
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(128, 128, 128, 0.2)" />
              <PolarAngleAxis
                dataKey="competency"
                stroke="rgba(128, 128, 128, 0.5)"
                fontSize={12}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                stroke="rgba(128, 128, 128, 0.3)"
                fontSize={10}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  padding: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))", marginBottom: "4px" }}
                itemStyle={{ color: "hsl(var(--primary))" }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.3)"
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
