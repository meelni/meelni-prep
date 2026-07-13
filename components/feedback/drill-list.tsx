"use client";

import { FeedbackSectionCard } from "@/components/feedback/feedback-surface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, Lightbulb, ArrowRight } from "lucide-react";
import type { DrillSuggestion } from "@/lib/types/feedback";

interface DrillListProps {
  drills: (DrillSuggestion | string)[];
}

export function DrillList({ drills: recommendations }: DrillListProps) {
  if (recommendations.length === 0) {
    return null;
  }

  const handleRecommendationClick = (recommendation: DrillSuggestion | string) => {
    const title =
      typeof recommendation === "string" ? recommendation : recommendation.title;
    // Placeholder for future focused-practice navigation
    console.log("Starting focused practice:", title);
    alert(
      `Practice recommendation "${title}" is coming soon! This will navigate you to a focused practice session.`
    );
  };

  return (
    <FeedbackSectionCard
      title="Practice Recommendations"
      description="Targeted exercises to improve your weakest areas"
      icon={<Target className="h-5 w-5" />}
      tone="info"
      contentClassName="space-y-3"
    >
      {recommendations.map((recommendation, index) => {
        // Handle both string array and object array formats
        const isString = typeof recommendation === "string";
        const title = isString ? recommendation : recommendation.title;
        const description = isString ? null : recommendation.description;
        const tips = isString ? null : recommendation.tips;

        return (
          <div
            key={index}
            className="group border-border/50 hover:border-primary/30 cursor-pointer rounded-lg border p-4 transition-all duration-300"
            onClick={() => handleRecommendationClick(recommendation)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="default"
                      className="border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      Exercise {index + 1}
                    </Badge>
                  </div>
                  <h3 className="font-display text-foreground group-hover:text-primary text-base font-light transition-colors">
                    {title}
                  </h3>
                  {description && (
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>

                {/* Tips */}
                {tips && tips.length > 0 && (
                  <div className="border-primary/20 space-y-2 border-l-2 pl-4">
                    <div className="font-display text-muted-foreground/70 flex items-center gap-1.5 text-xs font-light tracking-wide uppercase">
                      <Lightbulb className="h-3.5 w-3.5" />
                      <span>Tips</span>
                    </div>
                    <ul className="space-y-1">
                      {tips.map((tip, tipIndex) => (
                        <li
                          key={tipIndex}
                          className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed"
                        >
                          <span className="text-primary mt-0.5">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRecommendationClick(recommendation);
                }}
              >
                <span className="text-xs">Start</span>
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </FeedbackSectionCard>
  );
}
