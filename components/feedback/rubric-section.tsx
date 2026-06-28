"use client";

import { FeedbackSectionCard } from "@/components/feedback/feedback-surface";
import {
  Target,
  MessageSquare,
  Lightbulb,
  Users,
  TrendingUp,
} from "lucide-react";
import type { RubricScores } from "@/lib/types/feedback";
import { RUBRIC_DESCRIPTIONS } from "@/lib/types/feedback";

interface RubricSectionProps {
  scores: RubricScores;
}

const RUBRIC_ICONS = {
  structure: Target,
  clarity: MessageSquare,
  insight: Lightbulb,
  communication: Users,
  leadership: TrendingUp,
};

export function RubricSection({ scores }: RubricSectionProps) {
  // Filter out 'overall' and only show the 5 dimension scores
  const dimensions = Object.entries(scores).filter(
    ([dimension]) => dimension !== "overall"
  ) as [keyof Omit<RubricScores, "overall">, number][];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      {dimensions.map(([dimension, score]) => {
        const Icon = RUBRIC_ICONS[dimension];
        const description = RUBRIC_DESCRIPTIONS[dimension];
        const percentage = (score / 10) * 100;

        return (
          <FeedbackSectionCard
            key={dimension}
            title={<span className="capitalize">{dimension}</span>}
            description={description}
            icon={<Icon className="h-4 w-4" />}
            action={
              <div className="font-display text-primary text-2xl font-light">
                {score.toFixed(1)}
              </div>
            }
            className="hover:border-primary/30 transition-all duration-300"
            contentClassName="space-y-2"
          >
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>Score</span>
              <span>{score.toFixed(1)}/10</span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="from-primary/80 to-primary h-full rounded-full bg-gradient-to-r transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </FeedbackSectionCard>
        );
      })}
    </div>
  );
}
