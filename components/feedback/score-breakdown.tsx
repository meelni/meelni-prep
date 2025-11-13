"use client";

import { useEffect, useState } from "react";
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
  scores: RubricScores;
}

export function ScoreBreakdown({ scores }: ScoreBreakdownProps) {
  // Get computed CSS colors from the document
  const [colors, setColors] = useState({
    grid: "rgba(128, 128, 128, 0.2)",
    axis: "rgba(128, 128, 128, 0.5)",
    text: "rgba(128, 128, 128, 0.8)",
    primary: "oklch(0.70 0.22 285)",
    primaryFill: "rgba(135, 92, 255, 0.3)",
    card: "oklch(0.18 0.008 264)",
    border: "oklch(0.28 0.015 264)",
    foreground: "oklch(0.95 0.005 264)",
  });

  useEffect(() => {
    // Get computed colors from CSS variables
    const computedStyle = getComputedStyle(document.documentElement);

    // Extract the actual color values
    const borderColor = computedStyle.getPropertyValue("--border").trim();
    const foregroundColor = computedStyle.getPropertyValue("--foreground").trim();
    const primaryColor = computedStyle.getPropertyValue("--primary").trim();
    const cardColor = computedStyle.getPropertyValue("--card").trim();

    setColors({
      grid: borderColor || "oklch(0.28 0.015 264)",
      axis: borderColor || "oklch(0.28 0.015 264)",
      text: foregroundColor || "oklch(0.95 0.005 264)",
      primary: primaryColor || "oklch(0.70 0.22 285)",
      primaryFill: primaryColor ? `${primaryColor} / 0.3` : "oklch(0.70 0.22 285 / 0.3)",
      card: cardColor || "oklch(0.18 0.008 264)",
      border: borderColor || "oklch(0.28 0.015 264)",
      foreground: foregroundColor || "oklch(0.95 0.005 264)",
    });
  }, []);

  // Convert rubric scores to radar chart format
  const radarData = [
    { competency: "Structure", score: scores.structure, fullMark: 10 },
    { competency: "Clarity", score: scores.clarity, fullMark: 10 },
    { competency: "Insight", score: scores.insight, fullMark: 10 },
    { competency: "Communication", score: scores.communication, fullMark: 10 },
    { competency: "Leadership", score: scores.leadership, fullMark: 10 },
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
              {scores.overall.toFixed(1)}
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
              <PolarGrid
                stroke={colors.grid}
                strokeOpacity={0.5}
              />
              <PolarAngleAxis
                dataKey="competency"
                stroke={colors.axis}
                strokeOpacity={0.8}
                fontSize={12}
                tick={{ fill: colors.text }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                stroke={colors.axis}
                strokeOpacity={0.6}
                fontSize={10}
                tick={{ fill: colors.text }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  padding: "12px",
                }}
                labelStyle={{ color: colors.foreground, marginBottom: "4px" }}
                itemStyle={{ color: colors.primary }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke={colors.primary}
                fill={colors.primaryFill}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
