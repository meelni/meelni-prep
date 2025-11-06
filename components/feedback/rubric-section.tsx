"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Target, MessageSquare, Lightbulb, Users, TrendingUp } from "lucide-react";
import type { RubricScores } from "@/lib/types/feedback";
import { RUBRIC_DESCRIPTIONS } from "@/lib/types/feedback";

interface RubricSectionProps {
  rubricScores: RubricScores;
}

const RUBRIC_ICONS = {
  structure: Target,
  clarity: MessageSquare,
  insight: Lightbulb,
  communication: Users,
  leadership: TrendingUp,
};

export function RubricSection({ rubricScores }: RubricSectionProps) {
  const dimensions = Object.entries(rubricScores) as [keyof RubricScores, number][];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {dimensions.map(([dimension, score]) => {
        const Icon = RUBRIC_ICONS[dimension];
        const description = RUBRIC_DESCRIPTIONS[dimension];
        const percentage = (score / 10) * 100;

        return (
          <Card
            key={dimension}
            className="bg-card border-border hover:border-primary/30 transition-all duration-300"
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-display font-light text-foreground capitalize">
                      {dimension}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </div>
                <div className="text-2xl font-display font-light text-primary">
                  {score.toFixed(1)}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Score</span>
                  <span>{score.toFixed(1)}/10</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
